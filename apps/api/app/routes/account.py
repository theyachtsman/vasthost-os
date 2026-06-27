import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from core.config import settings
from core.crypto import decrypt, encrypt, mask
from db.session import get_db
from models import VastAccount, WatchedClass
from schemas.models import AccountConnectRequest, AccountStatus
from services.vast_client import VastClient, VastClientError

logger = logging.getLogger("vasthost.account")
router = APIRouter()


def _active_account(db: Session) -> VastAccount | None:
    return db.scalar(select(VastAccount).where(VastAccount.is_active.is_(True)))


def _seed_default_watched_class(db: Session) -> None:
    exists = db.scalar(select(WatchedClass).limit(1))
    if exists is None:
        db.add(
            WatchedClass(
                gpu_name=settings.observer_default_gpu,
                num_gpus=settings.VAST_OBSERVER_DEFAULT_NUM_GPUS,
                geolocation=None,
            )
        )
        db.commit()


def _run_initial_sync(account_id) -> None:
    """Run fleet + earnings sync inline (used as a background task)."""
    from db.session import SessionLocal
    from services.sync import earnings_sync, fleet_sync

    db = SessionLocal()
    try:
        account = db.get(VastAccount, account_id)
        if account is None:
            return
        try:
            fleet_sync(db, account)
        except Exception as exc:  # noqa: BLE001
            logger.error("initial fleet_sync failed: %s", exc)
        try:
            earnings_sync(db, account)
        except Exception as exc:  # noqa: BLE001
            logger.error("initial earnings_sync failed: %s", exc)
    finally:
        db.close()


@router.post("/connect", response_model=AccountStatus)
def connect(
    payload: AccountConnectRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
) -> AccountStatus:
    # Validate the key against Vast before storing it.
    try:
        user = VastClient(payload.api_key).show_user()
    except VastClientError as exc:
        raise HTTPException(status_code=400, detail=f"Vast rejected the key: {exc}") from exc

    account = _active_account(db)
    if account is None:
        account = VastAccount(vast_api_key=encrypt(payload.api_key))
        db.add(account)
    else:
        account.vast_api_key = encrypt(payload.api_key)
        account.is_active = True

    account.vast_user_id = user.get("id")
    account.email = user.get("email")
    account.display_name = user.get("username") or user.get("fullname")
    account.account_balance = user.get("balance")
    db.commit()
    db.refresh(account)

    _seed_default_watched_class(db)

    # Kick the initial sync so machines/earnings appear within ~60s (DoD #4).
    background.add_task(_run_initial_sync, account.id)

    return _status(account, payload.api_key)


@router.get("/status", response_model=AccountStatus)
def status(db: Session = Depends(get_db)) -> AccountStatus:
    account = _active_account(db)
    if account is None:
        return AccountStatus(connected=False)
    try:
        key = decrypt(account.vast_api_key)
    except Exception:  # noqa: BLE001
        key = None
    return _status(account, key)


@router.delete("/disconnect")
def disconnect(db: Session = Depends(get_db)) -> dict:
    account = _active_account(db)
    if account is None:
        raise HTTPException(status_code=404, detail="No account connected")
    account.is_active = False
    db.commit()
    return {"disconnected": True}


def _status(account: VastAccount, api_key: str | None) -> AccountStatus:
    return AccountStatus(
        connected=bool(account.is_active),
        vast_user_id=account.vast_user_id,
        email=account.email,
        display_name=account.display_name,
        account_balance=float(account.account_balance) if account.account_balance else None,
        last_synced_at=account.last_synced_at,
        connected_at=account.connected_at,
        api_key_masked=mask(api_key) if api_key else None,
    )

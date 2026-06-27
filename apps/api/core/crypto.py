"""Symmetric encryption for secrets stored at rest (Vast API keys).

Uses Fernet (AES-128-CBC + HMAC). The key is derived deterministically from
SECRET_KEY so the same env value always decrypts previously stored ciphertext.
"""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from .config import settings


def _fernet() -> Fernet:
    if not settings.SECRET_KEY:
        raise RuntimeError(
            "SECRET_KEY is not set. Generate one with: "
            'python -c "from cryptography.fernet import Fernet; '
            'print(Fernet.generate_key().decode())"'
        )
    # Derive a 32-byte urlsafe-base64 key from whatever SECRET_KEY string is set.
    digest = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:  # pragma: no cover - defensive
        raise ValueError("Could not decrypt value with current SECRET_KEY") from exc


def mask(secret: str) -> str:
    """Return a display-safe masked version of a secret."""
    if not secret:
        return ""
    if len(secret) <= 8:
        return "•" * len(secret)
    return f"{secret[:4]}…{secret[-4:]}"

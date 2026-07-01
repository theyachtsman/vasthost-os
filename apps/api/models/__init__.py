"""SQLAlchemy models for GPUIQ.

Data-retention boundary (enforced by separate modules / ownership):

* ``account``, ``fleet``, ``earnings`` — PRIVATE to a connected user's provider
  key (``user_provider_keys``). Legacy ``vast_accounts`` is retained for the
  pre-migration single-account data.
* ``market`` — PUBLIC observations derived from public listings, polled with the
  admin-owned PLATFORM key, NOT tied to any user.
* ``auth`` / ``keys`` — users, admins, sessions, and the two-key model.

The public and private pools must never be joined in a single query. Keep them in
separate modules so the ownership boundary is visible at import sites.
"""

from .account import AccountSnapshot, VastAccount, WatchedClass
from .alerting import AlertSettings
from .auth import AdminSession, AdminUser, Session, User, UserEntitlement
from .earnings import CostConfig, EarningsDaily
from .fleet import HostMachine, ReliabilityHistory, RentalContract
from .keys import KeyAccessAudit, PlatformProviderKey, UserProviderKey
from .market import ClearingEvent, MarketDistribution, OfferSnapshot
from .pricing import PriceChangeEvent
from .simulator import SimulatedHost

__all__ = [
    "VastAccount",
    "AccountSnapshot",
    "WatchedClass",
    "User",
    "AdminUser",
    "Session",
    "AdminSession",
    "UserEntitlement",
    "PlatformProviderKey",
    "UserProviderKey",
    "KeyAccessAudit",
    "HostMachine",
    "RentalContract",
    "ReliabilityHistory",
    "EarningsDaily",
    "CostConfig",
    "OfferSnapshot",
    "ClearingEvent",
    "MarketDistribution",
    "PriceChangeEvent",
    "SimulatedHost",
    "AlertSettings",
]

"""SQLAlchemy models for VastHost OS.

Data-retention boundary (enforced by separate modules / ownership):

* ``account``, ``fleet``, ``earnings`` — PRIVATE to a connected vast_account.
* ``market`` — PUBLIC observations derived from public Vast listings, NOT tied
  to any user account.

These two pools must never be joined in a single query. Keep them in separate
modules so the ownership boundary is visible at import sites.
"""

from .account import AccountSnapshot, VastAccount, WatchedClass
from .earnings import CostConfig, EarningsDaily
from .fleet import HostMachine, ReliabilityHistory, RentalContract
from .market import ClearingEvent, MarketDistribution, OfferSnapshot
from .pricing import PriceChangeEvent
from .simulator import SimulatedHost

__all__ = [
    "VastAccount",
    "AccountSnapshot",
    "WatchedClass",
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
]

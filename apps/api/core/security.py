"""Authentication primitives: password hashing and opaque session tokens.

Passwords are hashed with bcrypt (never stored in plaintext, even transiently).
Sessions use opaque random tokens: the raw token goes to the client in an
httpOnly cookie, and only its SHA-256 hash is persisted (``sessions.token_hash``
/ ``admin_sessions.token_hash``), so a database read never yields a usable
credential.

``bcrypt`` is an independent C extension and does not depend on ``cryptography``,
so adding it does not disturb the pinned ``cryptography``/``vastai`` constraint.
"""

from __future__ import annotations

import hashlib
import secrets

import bcrypt

# bcrypt truncates silently at 72 bytes; hash a prehash so long passwords are
# fully covered and we never feed raw bytes >72 to bcrypt.
def _prehash(password: str) -> bytes:
    return hashlib.sha256(password.encode("utf-8")).digest()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_prehash(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_prehash(password), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def generate_session_token() -> str:
    """Return a fresh opaque token to hand to the client."""
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    """Deterministic hash stored server-side; the raw token is never persisted."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

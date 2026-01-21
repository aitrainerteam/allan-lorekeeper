"""
Common utilities and base models for LoreKeeper.

This module contains shared utilities and base classes used across different
model types in the application, including timestamp utilities.
"""

from __future__ import annotations

from datetime import datetime, timezone


def utcnow() -> datetime:
    return datetime.now(timezone.utc)



"""
Web utilities and common functions.

This module contains utility functions used across web routes and templates
for common operations like context building and text processing.
"""

from __future__ import annotations

from fastapi import Request

from app.core.config import get_settings


def base_ctx(request: Request) -> dict:
    """
    Create base context dictionary for templates.

    Args:
        request: The FastAPI request object.

    Returns:
        dict: Base context with request and database path.
    """
    settings = get_settings()
    return {"request": request, "db_path": str(settings.sqlite_path)}
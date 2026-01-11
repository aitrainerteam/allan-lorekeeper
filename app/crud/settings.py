from __future__ import annotations

from sqlmodel import Session

from app.models.common import utcnow
from app.models.settings import AppSettings


SETTINGS_ID = 1


def get_app_settings(session: Session) -> AppSettings:
    s = session.get(AppSettings, SETTINGS_ID)
    if s:
        return s
    s = AppSettings(id=SETTINGS_ID, oracle_instructions="")
    session.add(s)
    session.commit()
    session.refresh(s)
    return s


def get_oracle_instructions(session: Session) -> str:
    s = get_app_settings(session)
    return (s.oracle_instructions or "").strip()


def set_oracle_instructions(session: Session, text: str) -> AppSettings:
    s = get_app_settings(session)
    s.oracle_instructions = text or ""
    s.updated_at = utcnow()
    session.add(s)
    session.commit()
    session.refresh(s)
    return s



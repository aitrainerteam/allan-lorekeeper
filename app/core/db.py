from __future__ import annotations

from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from app.core.config import get_settings


def get_engine():
    settings = get_settings()
    sqlite_url = f"sqlite:///{settings.sqlite_path}"
    return create_engine(
        sqlite_url,
        echo=False,
        connect_args={"check_same_thread": False},
    )


engine = get_engine()


def init_db() -> None:
    # Import models so SQLModel registers tables on metadata
    from app import models as _  # noqa: F401

    SQLModel.metadata.create_all(engine)
    _run_sqlite_migrations()


def _run_sqlite_migrations() -> None:
    """
    Minimal migration helper ( 1/2 convenience).
    SQLite create_all does not add new columns to existing tables, so we do small
    ALTER TABLEs for additive changes.
    """
    from sqlalchemy import text

    def col_exists(table: str, col: str) -> bool:
        with engine.connect() as conn:
            rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
        return any(r[1] == col for r in rows)  # r[1] is column name

    def add_col(table: str, ddl: str) -> None:
        with engine.connect() as conn:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))
            conn.commit()

    # PlotHole.ai_suggestions (added after initial bootstrap)
    if not col_exists("plothole", "ai_suggestions"):
        add_col("plothole", "ai_suggestions TEXT NOT NULL DEFAULT ''")

    # Event.act / Event.beat (acts moved into timeline classification)
    if not col_exists("event", "act"):
        add_col("event", "act TEXT")
    if not col_exists("event", "beat"):
        add_col("event", "beat TEXT")

    # PlotHole.kind (generalized problem type)
    if not col_exists("plothole", "kind"):
        add_col("plothole", "kind TEXT NOT NULL DEFAULT 'plot_hole'")

    # Oracle assistant and thread tables for prompt caching
    def table_exists(table: str) -> bool:
        with engine.connect() as conn:
            rows = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name=:table"), {"table": table}).fetchall()
        return len(rows) > 0

    # Create oracle_assistant table if it doesn't exist
    if not table_exists("oracleassistant"):
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE oracleassistant (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    assistant_id VARCHAR(128) NOT NULL UNIQUE,
                    instructions_hash VARCHAR(64) NOT NULL UNIQUE,
                    instructions TEXT NOT NULL DEFAULT '',
                    model VARCHAR(32) NOT NULL DEFAULT 'gpt-4o-mini',
                    created_at DATETIME NOT NULL,
                    updated_at DATETIME NOT NULL
                )
            """))
            conn.commit()

    # Create oracle_thread table if it doesn't exist
    if not table_exists("oraclethread"):
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE oraclethread (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    conversation_id VARCHAR(64) NOT NULL UNIQUE,
                    thread_id VARCHAR(128) NOT NULL UNIQUE,
                    assistant_id VARCHAR(128) NOT NULL,
                    created_at DATETIME NOT NULL,
                    updated_at DATETIME NOT NULL
                )
            """))
            conn.commit()


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session



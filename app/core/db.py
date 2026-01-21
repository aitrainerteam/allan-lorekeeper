"""
Database connection and initialization utilities.

This module provides database engine setup, session management, and migration
utilities for the LoreKeeper SQLite database. It handles schema creation and
incremental updates to support evolving data models.
"""

from __future__ import annotations

from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from app.core.config import get_settings


def get_engine():
    """
    Create and return the SQLAlchemy database engine.

    Returns:
        Engine: SQLAlchemy engine configured for SQLite.
    """
    settings = get_settings()
    sqlite_url = f"sqlite:///{settings.sqlite_path}"
    return create_engine(
        sqlite_url,
        echo=False,
        connect_args={"check_same_thread": False},
    )


engine = get_engine()


def init_db() -> None:
    """
    Initialize the database by creating all tables and running migrations.

    Imports all model modules to register them with SQLModel, creates tables,
    and applies any pending database migrations.
    """
    try:
        # Import models so SQLModel registers tables on metadata
        from app import models as _  # noqa: F401

        SQLModel.metadata.create_all(engine)
        _run_sqlite_migrations()
    except Exception as e:
        raise RuntimeError(f"Failed to initialize database: {e}") from e


def _run_sqlite_migrations() -> None:
    """
    Run database migrations for schema evolution.

    SQLite doesn't support ALTER TABLE ADD COLUMN in create_all, so we handle
    incremental schema changes here. This includes column additions and new tables.
    """
    from sqlalchemy import text

    def col_exists(table: str, col: str) -> bool:
        """Check if a column exists in a table."""
        with engine.connect() as conn:
            rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
        return any(r[1] == col for r in rows)  # r[1] is column name

    def add_col(table: str, ddl: str) -> None:
        """Add a column to an existing table."""
        try:
            with engine.connect() as conn:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))
                conn.commit()
        except Exception as e:
            # Column might already exist or DDL might be invalid
            print(f"Warning: Failed to add column {ddl} to {table}: {e}")

    def table_exists(table: str) -> bool:
        """Check if a table exists in the database."""
        with engine.connect() as conn:
            rows = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name=:table"), {"table": table}).fetchall()
        return len(rows) > 0

    def create_table(ddl: str) -> None:
        """Create a new table."""
        try:
            with engine.connect() as conn:
                conn.execute(text(ddl))
                conn.commit()
        except Exception as e:
            # Table might already exist
            print(f"Warning: Failed to create table: {e}")

    # Migration 1: Add ai_suggestions to PlotHole table
    if not col_exists("plothole", "ai_suggestions"):
        add_col("plothole", "ai_suggestions TEXT NOT NULL DEFAULT ''")

    # Migration 2: Add act/beat classification to Event table
    if not col_exists("event", "act"):
        add_col("event", "act TEXT")
    if not col_exists("event", "beat"):
        add_col("event", "beat TEXT")

    # Migration 3: Add generalized problem type to PlotHole
    if not col_exists("plothole", "kind"):
        add_col("plothole", "kind TEXT NOT NULL DEFAULT 'plot_hole'")

    # Migration 4: Create Oracle assistant caching tables
    if not table_exists("oracleassistant"):
        create_table("""
            CREATE TABLE oracleassistant (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                assistant_id VARCHAR(128) NOT NULL UNIQUE,
                instructions_hash VARCHAR(64) NOT NULL UNIQUE,
                instructions TEXT NOT NULL DEFAULT '',
                model VARCHAR(32) NOT NULL DEFAULT 'gpt-4o-mini',
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            )
        """)

    if not table_exists("oraclethread"):
        create_table("""
            CREATE TABLE oraclethread (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id VARCHAR(64) NOT NULL UNIQUE,
                thread_id VARCHAR(128) NOT NULL UNIQUE,
                assistant_id VARCHAR(128) NOT NULL,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            )
        """)


def get_session() -> Generator[Session, None, None]:
    """
    Dependency injection function for database sessions.

    Provides a SQLModel session for use in FastAPI route handlers.
    The session is automatically closed when the request completes.

    Yields:
        Session: Active database session.
    """
    with Session(engine) as session:
        yield session



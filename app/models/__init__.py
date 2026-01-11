"""
SQLModel models for LoreKeeper.

Importing this package registers all table models with SQLModel.metadata.
"""

from app.models.bible import BibleSection  # noqa: F401
from app.models.codex import Act, Character, Concept, Tag, Tagging  # noqa: F401
from app.models.chat import ChatMessage  # noqa: F401
from app.models.oracle import OracleAssistant, OracleThread  # noqa: F401
from app.models.problems import PlotHole  # noqa: F401
from app.models.settings import AppSettings  # noqa: F401
from app.models.timeline import Event  # noqa: F401



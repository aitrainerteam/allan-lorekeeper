from __future__ import annotations

from typing import Sequence

from sqlmodel import Session, select

from app.ai.bible_editor import parse_document_into_sections
from app.models.bible import BibleSection
from app.models.common import utcnow


def get_bible_sections(session: Session) -> Sequence[BibleSection]:
    """Get all bible sections ordered by their position."""
    return session.exec(
        select(BibleSection).order_by(BibleSection.order)
    ).all()


def get_bible_section_by_id(session: Session, section_id: int) -> BibleSection | None:
    """Get a specific bible section by ID."""
    return session.get(BibleSection, section_id)


def get_bible_section_by_name(session: Session, section_name: str) -> BibleSection | None:
    """Get a specific bible section by name."""
    return session.exec(
        select(BibleSection).where(BibleSection.section_name == section_name)
    ).first()


def create_or_update_bible_section(
    session: Session,
    section_name: str,
    display_name: str,
    content: str,
    order: int = 0
) -> BibleSection:
    """Create or update a bible section."""
    # Try to find existing section
    existing = get_bible_section_by_name(session, section_name)

    if existing:
        # Update existing
        existing.content = content
        existing.display_name = display_name
        existing.order = order
        existing.updated_at = utcnow()
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return existing
    else:
        # Create new
        section = BibleSection(
            section_name=section_name,
            display_name=display_name,
            content=content,
            order=order
        )
        session.add(section)
        session.commit()
        session.refresh(section)
        return section


def import_bible_from_text(session: Session, full_text: str) -> Sequence[BibleSection]:
    """Import bible sections from full document text."""
    parsed_sections = parse_document_into_sections(full_text)

    created_sections = []
    for display_name, section_data in parsed_sections.items():
        section = create_or_update_bible_section(
            session=session,
            section_name=section_data["section_name"],
            display_name=section_data["display_name"],
            content=section_data["content"],
            order=section_data["order"]
        )
        created_sections.append(section)

    return created_sections


def get_full_bible_text(session: Session) -> str:
    """Get the full bible as formatted text."""
    sections = get_bible_sections(session)

    full_text = []
    for section in sections:
        if section.section_name == "Intro/Uncategorized":
            full_text.append(section.content)
        else:
            full_text.append(f"{section.section_name}\n{section.content}")

    return "\n\n".join(full_text)


def update_bible_section_content(session: Session, section_id: int, content: str) -> BibleSection | None:
    """Update the content of a specific bible section."""
    section = get_bible_section_by_id(session, section_id)
    if section:
        section.content = content
        section.updated_at = utcnow()
        session.add(section)
        session.commit()
        session.refresh(section)
    return section


def delete_bible_section(session: Session, section_id: int) -> bool:
    """Delete a bible section."""
    section = get_bible_section_by_id(session, section_id)
    if section:
        session.delete(section)
        session.commit()
        return True
    return False

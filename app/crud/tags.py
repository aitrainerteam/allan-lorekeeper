from __future__ import annotations

from sqlmodel import Session, select

from app.models.codex import Tag, Tagging


def parse_tag_names(raw: str | None) -> list[str]:
    if not raw:
        return []
    parts = [p.strip() for p in raw.replace(";", ",").split(",")]
    dedup: list[str] = []
    seen = set()
    for p in parts:
        if not p:
            continue
        key = p.lower()
        if key in seen:
            continue
        seen.add(key)
        dedup.append(p)
    return dedup


def get_or_create_tag(session: Session, name: str) -> Tag:
    existing = session.exec(select(Tag).where(Tag.name == name)).first()
    if existing:
        return existing
    tag = Tag(name=name)
    session.add(tag)
    session.commit()
    session.refresh(tag)
    return tag


def set_entity_tags(
    session: Session,
    *,
    entity_type: str,
    entity_id: int,
    tag_names: list[str],
) -> None:
    # remove all old
    old = session.exec(
        select(Tagging).where(
            Tagging.entity_type == entity_type,
            Tagging.entity_id == entity_id,
        )
    ).all()
    for o in old:
        session.delete(o)
    session.commit()

    # add new
    for name in tag_names:
        tag = get_or_create_tag(session, name)
        session.add(Tagging(tag_id=tag.id, entity_type=entity_type, entity_id=entity_id))
    session.commit()


def get_entity_tag_names(session: Session, *, entity_type: str, entity_id: int) -> list[str]:
    tag_ids = session.exec(
        select(Tagging.tag_id).where(
            Tagging.entity_type == entity_type,
            Tagging.entity_id == entity_id,
        )
    ).all()
    if not tag_ids:
        return []
    tags = session.exec(select(Tag).where(Tag.id.in_(tag_ids)).order_by(Tag.name)).all()
    return [t.name for t in tags]


def filter_entity_ids_by_tag(session: Session, *, entity_type: str, tag_name: str) -> list[int]:
    tag = session.exec(select(Tag).where(Tag.name == tag_name)).first()
    if not tag:
        return []
    ids = session.exec(
        select(Tagging.entity_id).where(
            Tagging.entity_type == entity_type,
            Tagging.tag_id == tag.id,
        )
    ).all()
    return list(ids)



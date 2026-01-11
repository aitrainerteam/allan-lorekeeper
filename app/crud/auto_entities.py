from __future__ import annotations

from typing import Any

from sqlmodel import Session, select

from app.models.codex import Character, Concept
from app.models.common import utcnow
from app.models.problems import PlotHole
from app.models.timeline import Event


def _norm(s: str | None) -> str:
    return (s or "").strip()


def _merge_text(existing: str, incoming: str) -> str:
    existing = _norm(existing)
    incoming = _norm(incoming)
    if not incoming:
        return existing
    if not existing:
        return incoming
    if incoming.lower() in existing.lower():
        return existing
    return existing + "\n\n" + incoming


def get_or_create_character(session: Session, *, name: str, traits: str = "", arc: str = "") -> tuple[Character, bool]:
    key = _norm(name)
    if not key:
        raise ValueError("Character name required")
    existing = session.exec(select(Character).where(Character.name.ilike(key))).first()
    if existing:
        changed = False
        new_traits = _merge_text(existing.traits, traits)
        new_arc = _merge_text(existing.arc, arc)
        if new_traits != (existing.traits or ""):
            existing.traits = new_traits
            changed = True
        if new_arc != (existing.arc or ""):
            existing.arc = new_arc
            changed = True
        if changed:
            existing.updated_at = utcnow()
            session.add(existing)
        return existing, False

    c = Character(name=key, traits=_norm(traits), arc=_norm(arc))
    session.add(c)
    session.commit()
    session.refresh(c)
    return c, True


def get_or_create_concept(session: Session, *, title: str, description: str = "") -> tuple[Concept, bool]:
    key = _norm(title)
    if not key:
        raise ValueError("Concept title required")
    existing = session.exec(select(Concept).where(Concept.title.ilike(key))).first()
    if existing:
        new_desc = _merge_text(existing.description, description)
        if new_desc != (existing.description or ""):
            existing.description = new_desc
            existing.updated_at = utcnow()
            session.add(existing)
            session.commit()
        return existing, False

    c = Concept(title=key, description=_norm(description))
    session.add(c)
    session.commit()
    session.refresh(c)
    return c, True


def get_or_create_event(
    session: Session,
    *,
    title: str,
    description: str = "",
    act: str | None = None,
    beat: str | None = None,
    approx_order: int = 0,
) -> tuple[Event, bool]:
    key = _norm(title)
    if not key:
        raise ValueError("Event title required")
    existing = session.exec(select(Event).where(Event.title.ilike(key))).first()
    if existing:
        changed = False
        new_desc = _merge_text(existing.description, description)
        if new_desc != (existing.description or ""):
            existing.description = new_desc
            changed = True
        if act and not existing.act:
            existing.act = act
            changed = True
        if beat and not existing.beat:
            existing.beat = beat
            changed = True
        if approx_order and not existing.approx_order:
            existing.approx_order = approx_order
            changed = True
        if changed:
            existing.updated_at = utcnow()
            session.add(existing)
            session.commit()
        return existing, False

    e = Event(
        title=key,
        description=_norm(description),
        act=_norm(act) or None,
        beat=_norm(beat) or None,
        approx_order=int(approx_order or 0),
    )
    session.add(e)
    session.commit()
    session.refresh(e)
    return e, True


def get_or_create_plot_hole(
    session: Session, *, title: str, description: str = "", kind: str = "plot_hole"
) -> tuple[PlotHole, bool]:
    key = _norm(title)
    if not key:
        raise ValueError("Plot hole title required")
    existing = session.exec(select(PlotHole).where(PlotHole.title.ilike(key))).first()
    if existing:
        # Update kind if it's still default or missing
        if kind and (not getattr(existing, "kind", None) or existing.kind == "plot_hole"):
            existing.kind = kind
            existing.updated_at = utcnow()
            session.add(existing)
            session.commit()
        new_desc = _merge_text(existing.description, description)
        if new_desc != (existing.description or ""):
            existing.description = new_desc
            existing.updated_at = utcnow()
            session.add(existing)
            session.commit()
        return existing, False

    h = PlotHole(title=key, description=_norm(description), kind=_norm(kind) or "plot_hole")
    session.add(h)
    session.commit()
    session.refresh(h)
    return h, True


def persist_extracted_entities(session: Session, extracted: dict[str, Any]) -> dict[str, Any]:
    """
    Persists extracted entities into the DB (upsert-ish).
    Returns a summary:
      {"created": {"characters":[name],...}, "updated": {...}}
    """
    created: dict[str, list[str]] = {"characters": [], "concepts": [], "events": [], "plot_holes": []}
    updated: dict[str, list[str]] = {"characters": [], "concepts": [], "events": [], "plot_holes": []}

    # For description enrichment (so entity pages show clickable @mentions)
    mention_names: list[str] = []
    for row in extracted.get("characters") or []:
        n = _norm(row.get("name"))
        if n:
            mention_names.append(n)
    for row in extracted.get("concepts") or []:
        t = _norm(row.get("title"))
        if t:
            mention_names.append(t)

    for row in extracted.get("characters") or []:
        name = _norm(row.get("name"))
        if not name:
            continue
        traits = _norm(row.get("traits"))
        arc = _norm(row.get("arc"))
        obj, was_created = get_or_create_character(session, name=name, traits=traits, arc=arc)
        (created if was_created else updated)["characters"].append(obj.name)

    for row in extracted.get("concepts") or []:
        title = _norm(row.get("title"))
        if not title:
            continue
        description = _norm(row.get("description"))
        obj, was_created = get_or_create_concept(session, title=title, description=description)
        (created if was_created else updated)["concepts"].append(obj.title)

    for row in extracted.get("events") or []:
        title = _norm(row.get("title"))
        if not title:
            continue
        description = _norm(row.get("description"))
        # Add mention hints if not already present
        if mention_names and "@{" not in description:
            mentions = ", ".join([f"@{{{n}}}" for n in mention_names[:6]])
            description = _merge_text(description, f"Mentions: {mentions}")
        act = _norm(row.get("act")) or None
        beat = _norm(row.get("beat")) or None
        approx_order = row.get("approx_order") or 0
        try:
            approx_order_i = int(approx_order)
        except Exception:
            approx_order_i = 0
        obj, was_created = get_or_create_event(
            session,
            title=title,
            description=description,
            act=act,
            beat=beat,
            approx_order=approx_order_i,
        )
        (created if was_created else updated)["events"].append(obj.title)

    for row in extracted.get("plot_holes") or []:
        title = _norm(row.get("title"))
        if not title:
            continue
        description = _norm(row.get("description"))
        kind = _norm(row.get("kind")) or "plot_hole"
        obj, was_created = get_or_create_plot_hole(session, title=title, description=description, kind=kind)
        (created if was_created else updated)["plot_holes"].append(obj.title)

    return {"created": created, "updated": updated}



from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.db import get_session
from app.crud.tags import (
    filter_entity_ids_by_tag,
    get_entity_tag_names,
    parse_tag_names,
    set_entity_tags,
)
from app.models.codex import Act, Character, Concept
from app.models.common import utcnow
from app.web.mentions import linkify_mentions


router = APIRouter(prefix="/codex", tags=["codex"])
templates = Jinja2Templates(directory=str(Path(__file__).resolve().parents[1] / "templates"))
settings = get_settings()

def _parse_int(value: str | None) -> int | None:
    if value is None:
        return None
    value = value.strip()
    if value == "":
        return None
    try:
        return int(value)
    except ValueError:
        return None


def _base_ctx(request: Request) -> dict:
    return {"request": request, "db_path": str(settings.sqlite_path)}


@router.get("/characters", response_class=HTMLResponse)
def characters_page(request: Request):
    return templates.TemplateResponse(
        "codex_characters.html",
        {
            **_base_ctx(request),
            "title": "Characters",
        },
    )


@router.get("/characters/list", response_class=HTMLResponse)
def characters_list(
    request: Request,
    status: str | None = None,
    importance: str | None = None,
    tag: str | None = None,
    q: str | None = None,
    session: Session = Depends(get_session),
):
    stmt = select(Character)
    if status:
        stmt = stmt.where(Character.status == status)
    importance_i = _parse_int(importance)
    if importance_i is not None:
        stmt = stmt.where(Character.importance == importance_i)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(Character.name.like(like) | Character.traits.like(like) | Character.arc.like(like))
    if tag:
        ids = filter_entity_ids_by_tag(session, entity_type="character", tag_name=tag)
        if not ids:
            characters: list[Character] = []
            tags_by_id: dict[int, list[str]] = {}
            return templates.TemplateResponse(
                "partials/character_table.html",
                {**_base_ctx(request), "characters": characters, "tags_by_id": tags_by_id},
            )
        stmt = stmt.where(Character.id.in_(ids))

    characters = session.exec(stmt.order_by(Character.name)).all()
    tags_by_id = {c.id: get_entity_tag_names(session, entity_type="character", entity_id=c.id) for c in characters if c.id}
    return templates.TemplateResponse(
        "partials/character_table.html",
        {**_base_ctx(request), "characters": characters, "tags_by_id": tags_by_id, "linkify_mentions": linkify_mentions},
    )


@router.post("/characters", response_class=HTMLResponse)
def characters_create(
    request: Request,
    name: str = Form(...),
    traits: str = Form(""),
    arc: str = Form(""),
    status: str = Form("draft"),
    importance: int = Form(3),
    tags: str = Form(""),
    session: Session = Depends(get_session),
):
    c = Character(name=name, traits=traits, arc=arc, status=status, importance=importance)
    session.add(c)
    session.commit()
    session.refresh(c)
    set_entity_tags(session, entity_type="character", entity_id=c.id, tag_names=parse_tag_names(tags))
    # Return the refreshed list (HTMX)
    return characters_list(request, session=session)


@router.get("/characters/{character_id}/row", response_class=HTMLResponse)
def characters_row(
    character_id: int,
    request: Request,
    session: Session = Depends(get_session),
):
    c = session.get(Character, character_id)
    if not c:
        return HTMLResponse("Not found", status_code=404)
    tags = get_entity_tag_names(session, entity_type="character", entity_id=c.id) if c.id else []
    return templates.TemplateResponse(
        "partials/character_row.html",
        {**_base_ctx(request), "c": c, "tags": tags, "linkify_mentions": linkify_mentions},
    )


@router.get("/characters/{character_id}/edit", response_class=HTMLResponse)
def characters_edit_row(
    character_id: int,
    request: Request,
    session: Session = Depends(get_session),
):
    c = session.get(Character, character_id)
    if not c:
        return HTMLResponse("Not found", status_code=404)
    tags = get_entity_tag_names(session, entity_type="character", entity_id=c.id) if c.id else []
    return templates.TemplateResponse(
        "partials/character_row_edit.html",
        {**_base_ctx(request), "c": c, "tags_csv": ", ".join(tags), "linkify_mentions": linkify_mentions},
    )


@router.post("/characters/{character_id}", response_class=HTMLResponse)
def characters_update(
    character_id: int,
    request: Request,
    name: str = Form(...),
    traits: str = Form(""),
    arc: str = Form(""),
    status: str = Form("draft"),
    importance: int = Form(3),
    tags: str = Form(""),
    session: Session = Depends(get_session),
):
    c = session.get(Character, character_id)
    if not c:
        return HTMLResponse("Not found", status_code=404)
    c.name = name
    c.traits = traits
    c.arc = arc
    c.status = status
    c.importance = importance
    c.updated_at = utcnow()
    session.add(c)
    session.commit()
    if c.id:
        set_entity_tags(session, entity_type="character", entity_id=c.id, tag_names=parse_tag_names(tags))
    return characters_row(character_id=character_id, request=request, session=session)


@router.post("/characters/{character_id}/toggle_incomplete", response_class=HTMLResponse)
def characters_toggle_incomplete(
    character_id: int,
    request: Request,
    session: Session = Depends(get_session),
):
    c = session.get(Character, character_id)
    if not c:
        return HTMLResponse("Not found", status_code=404)
    c.is_incomplete = not c.is_incomplete
    c.updated_at = utcnow()
    session.add(c)
    session.commit()
    return characters_list(request, session=session)


@router.post("/characters/{character_id}/delete", response_class=HTMLResponse)
def characters_delete(
    character_id: int,
    request: Request,
    session: Session = Depends(get_session),
):
    c = session.get(Character, character_id)
    if not c:
        return HTMLResponse("Not found", status_code=404)
    session.delete(c)
    session.commit()
    return characters_list(request, session=session)


@router.get("/concepts", response_class=HTMLResponse)
def concepts_page(request: Request):
    return templates.TemplateResponse("codex_concepts.html", {**_base_ctx(request), "title": "Concepts"})


@router.get("/concepts/list", response_class=HTMLResponse)
def concepts_list(
    request: Request,
    status: str | None = None,
    importance: str | None = None,
    tag: str | None = None,
    q: str | None = None,
    session: Session = Depends(get_session),
):
    stmt = select(Concept)
    if status:
        stmt = stmt.where(Concept.status == status)
    importance_i = _parse_int(importance)
    if importance_i is not None:
        stmt = stmt.where(Concept.importance == importance_i)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(Concept.title.like(like) | Concept.description.like(like))
    if tag:
        ids = filter_entity_ids_by_tag(session, entity_type="concept", tag_name=tag)
        if not ids:
            concepts: list[Concept] = []
            tags_by_id: dict[int, list[str]] = {}
            return templates.TemplateResponse(
                "partials/concept_table.html",
                {**_base_ctx(request), "concepts": concepts, "tags_by_id": tags_by_id},
            )
        stmt = stmt.where(Concept.id.in_(ids))

    concepts = session.exec(stmt.order_by(Concept.title)).all()
    tags_by_id = {c.id: get_entity_tag_names(session, entity_type="concept", entity_id=c.id) for c in concepts if c.id}
    return templates.TemplateResponse(
        "partials/concept_table.html",
        {**_base_ctx(request), "concepts": concepts, "tags_by_id": tags_by_id, "linkify_mentions": linkify_mentions},
    )


@router.post("/concepts", response_class=HTMLResponse)
def concepts_create(
    request: Request,
    title: str = Form(...),
    description: str = Form(""),
    status: str = Form("draft"),
    importance: int = Form(3),
    tags: str = Form(""),
    session: Session = Depends(get_session),
):
    c = Concept(title=title, description=description, status=status, importance=importance)
    session.add(c)
    session.commit()
    session.refresh(c)
    set_entity_tags(session, entity_type="concept", entity_id=c.id, tag_names=parse_tag_names(tags))
    return concepts_list(request, session=session)


@router.get("/concepts/{concept_id}/row", response_class=HTMLResponse)
def concepts_row(
    concept_id: int,
    request: Request,
    session: Session = Depends(get_session),
):
    c = session.get(Concept, concept_id)
    if not c:
        return HTMLResponse("Not found", status_code=404)
    tags = get_entity_tag_names(session, entity_type="concept", entity_id=c.id) if c.id else []
    return templates.TemplateResponse(
        "partials/concept_row.html",
        {**_base_ctx(request), "c": c, "tags": tags, "linkify_mentions": linkify_mentions},
    )


@router.get("/concepts/{concept_id}/edit", response_class=HTMLResponse)
def concepts_edit_row(
    concept_id: int,
    request: Request,
    session: Session = Depends(get_session),
):
    c = session.get(Concept, concept_id)
    if not c:
        return HTMLResponse("Not found", status_code=404)
    tags = get_entity_tag_names(session, entity_type="concept", entity_id=c.id) if c.id else []
    return templates.TemplateResponse(
        "partials/concept_row_edit.html",
        {**_base_ctx(request), "c": c, "tags_csv": ", ".join(tags), "linkify_mentions": linkify_mentions},
    )


@router.post("/concepts/{concept_id}", response_class=HTMLResponse)
def concepts_update(
    concept_id: int,
    request: Request,
    title: str = Form(...),
    description: str = Form(""),
    status: str = Form("draft"),
    importance: int = Form(3),
    tags: str = Form(""),
    session: Session = Depends(get_session),
):
    c = session.get(Concept, concept_id)
    if not c:
        return HTMLResponse("Not found", status_code=404)
    c.title = title
    c.description = description
    c.status = status
    c.importance = importance
    c.updated_at = utcnow()
    session.add(c)
    session.commit()
    if c.id:
        set_entity_tags(session, entity_type="concept", entity_id=c.id, tag_names=parse_tag_names(tags))
    return concepts_row(concept_id=concept_id, request=request, session=session)


@router.post("/concepts/{concept_id}/toggle_incomplete", response_class=HTMLResponse)
def concepts_toggle_incomplete(
    concept_id: int,
    request: Request,
    session: Session = Depends(get_session),
):
    c = session.get(Concept, concept_id)
    if not c:
        return HTMLResponse("Not found", status_code=404)
    c.is_incomplete = not c.is_incomplete
    c.updated_at = utcnow()
    session.add(c)
    session.commit()
    return concepts_list(request, session=session)


@router.post("/concepts/{concept_id}/delete", response_class=HTMLResponse)
def concepts_delete(
    concept_id: int,
    request: Request,
    session: Session = Depends(get_session),
):
    c = session.get(Concept, concept_id)
    if not c:
        return HTMLResponse("Not found", status_code=404)
    session.delete(c)
    session.commit()
    return concepts_list(request, session=session)


@router.get("/acts", response_class=HTMLResponse)
def acts_page(request: Request):
    # Acts are now applied as classifications on Timeline events.
    return templates.TemplateResponse("codex_acts.html", {**_base_ctx(request), "title": "Acts"})


## Act CRUD removed: acts are now applied on Timeline Events via act/beat fields.



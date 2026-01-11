from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, Form, Request, UploadFile, File, Body
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlmodel import Session

from app.ai.bible_editor import edit_bible_section
from app.core.config import get_settings
from app.core.db import get_session
from app.crud.bible import (
    get_bible_sections,
    get_bible_section_by_id,
    import_bible_from_text,
    update_bible_section_content,
    get_full_bible_text
)

router = APIRouter(prefix="/bible", tags=["bible"])
templates = Jinja2Templates(directory=str(Path(__file__).resolve().parents[1] / "templates"))
settings = get_settings()


def _base_ctx(request: Request) -> dict:
    return {"request": request, "db_path": str(settings.sqlite_path)}


@router.get("", response_class=HTMLResponse)
def bible_root():
    return RedirectResponse(url="/bible/editor", status_code=302)


@router.get("/editor", response_class=HTMLResponse)
def bible_editor_page(
    request: Request,
    session: Session = Depends(get_session),
):
    sections = get_bible_sections(session)
    return templates.TemplateResponse(
        "bible_editor.html",
        {**_base_ctx(request), "title": "Bible Editor", "sections": sections},
    )


@router.get("/sections", response_class=HTMLResponse)
def bible_sections_list(
    request: Request,
    session: Session = Depends(get_session),
):
    sections = get_bible_sections(session)
    return templates.TemplateResponse(
        "partials/bible_sections.html",
        {**_base_ctx(request), "sections": sections},
    )


@router.get("/section/{section_id}", response_class=HTMLResponse)
def bible_section_detail(
    request: Request,
    section_id: int,
    session: Session = Depends(get_session),
):
    section = get_bible_section_by_id(session, section_id)
    if not section:
        return HTMLResponse("Section not found", status_code=404)

    return templates.TemplateResponse(
        "partials/bible_section_detail.html",
        {**_base_ctx(request), "section": section},
    )


@router.post("/import", response_class=HTMLResponse)
async def bible_import(
    request: Request,
    uploaded_file: UploadFile | None = File(None),
    text_content: str = Form(""),
    session: Session = Depends(get_session),
):
    content = ""

    if uploaded_file:
        # Read uploaded file
        content = (await uploaded_file.read()).decode("utf-8")
    elif text_content:
        content = text_content

    if content:
        sections = import_bible_from_text(session, content)

    return bible_sections_list(request, session=session)


@router.post("/edit/{section_id}", response_class=HTMLResponse)
def bible_edit_section(
    request: Request,
    section_id: int,
    instructions: str = Form("", min_length=0),
    current_content: str = Form("", min_length=0),
    session: Session = Depends(get_session),
):
    # Debug logging
    print(f"DEBUG: section_id={section_id}")
    print(f"DEBUG: instructions='{instructions}' (len={len(instructions)})")
    print(f"DEBUG: current_content length={len(current_content)}")
    print(f"DEBUG: current_content preview='{current_content[:100] if current_content else 'None'}...'")

    # If form data is empty, try to parse as JSON (HTMX might send JSON)
    if not instructions and not current_content:
        try:
            import json
            data = request.json()
            instructions = data.get('instructions', '')
            current_content = data.get('current_content', '')
            print(f"DEBUG: Parsed from JSON - instructions='{instructions}', content_len={len(current_content)}")
        except:
            print("DEBUG: Could not parse as JSON")
    # Debug logging
    print(f"DEBUG: section_id={section_id}")
    print(f"DEBUG: instructions='{instructions}'")
    print(f"DEBUG: current_content length={len(current_content)}")
    print(f"DEBUG: current_content preview='{current_content[:100]}...'")
    section = get_bible_section_by_id(session, section_id)
    if not section:
        return HTMLResponse("Section not found", status_code=404)

    try:
        # Generate AI revision
        revised_content = edit_bible_section(
            session=session,
            section_name=section.display_name,
            current_content=current_content,
            user_instructions=instructions
        )

        return templates.TemplateResponse(
            "partials/bible_section_revision.html",
            {
                **_base_ctx(request),
                "section": section,
                "revision": revised_content,
                "instructions": instructions
            },
        )
    except RuntimeError as e:
        if "OPENAI_API_KEY" in str(e):
            error_message = """
            <div class="p-4 bg-red-900/20 border border-red-700 rounded">
                <h4 class="text-red-400 font-medium mb-2">AI Revision Unavailable</h4>
                <p class="text-sm text-red-300 mb-2">
                    The OpenAI API key is not configured. To use AI revision features:
                </p>
                <ol class="text-sm text-red-300 list-decimal list-inside space-y-1">
                    <li>Create a <code class="bg-red-900 px-1 rounded">.env</code> file in the project root</li>
                    <li>Add your OpenAI API key: <code class="bg-red-900 px-1 rounded">OPENAI_API_KEY=your_key_here</code></li>
                    <li>Restart the application</li>
                </ol>
            </div>
            """
            return HTMLResponse(error_message, status_code=400)
        else:
            return HTMLResponse(f"Error generating revision: {e}", status_code=500)
    except Exception as e:
        error_str = str(e)
        if "401" in error_str or "invalid_api_key" in error_str or "Incorrect API key" in error_str:
            error_message = """
            <div class="p-4 bg-red-900/20 border border-red-700 rounded">
                <h4 class="text-red-400 font-medium mb-2">Invalid OpenAI API Key</h4>
                <p class="text-sm text-red-300 mb-2">
                    The configured OpenAI API key is invalid or expired. Please check your API key and try again.
                </p>
            </div>
            """
            return HTMLResponse(error_message, status_code=400)
        elif "429" in error_str or "rate limit" in error_str.lower():
            error_message = """
            <div class="p-4 bg-yellow-900/20 border border-yellow-700 rounded">
                <h4 class="text-yellow-400 font-medium mb-2">Rate Limit Exceeded</h4>
                <p class="text-sm text-yellow-300 mb-2">
                    You've exceeded the OpenAI API rate limit. Please wait a moment and try again.
                </p>
            </div>
            """
            return HTMLResponse(error_message, status_code=429)
        else:
            return HTMLResponse(f"Error generating revision: {e}", status_code=500)
    except Exception as e:
        return HTMLResponse(f"Error generating revision: {e}", status_code=500)


@router.post("/accept/{section_id}", response_class=HTMLResponse)
def bible_accept_revision(
    request: Request,
    section_id: int,
    revision_content: str = Form(...),
    session: Session = Depends(get_session),
):
    section = get_bible_section_by_id(session, section_id)
    if not section:
        return HTMLResponse("Section not found", status_code=404)

    # Update the section content with the revision
    update_bible_section_content(session, section_id, revision_content)

    return bible_section_detail(request, section_id, session=session)


@router.post("/update/{section_id}", response_class=HTMLResponse)
def bible_update_section(
    request: Request,
    section_id: int,
    content: str = Form(...),
    session: Session = Depends(get_session),
):
    update_bible_section_content(session, section_id, content)
    return bible_section_detail(request, section_id, session=session)


@router.get("/export", response_class=HTMLResponse)
def bible_export(
    request: Request,
    session: Session = Depends(get_session),
):
    full_text = get_full_bible_text(session)
    return templates.TemplateResponse(
        "partials/bible_export.html",
        {**_base_ctx(request), "full_text": full_text},
    )

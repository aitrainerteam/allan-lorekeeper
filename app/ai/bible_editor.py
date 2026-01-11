from __future__ import annotations

import re
from typing import Any

from sqlmodel import Session, select

from app.ai.client import get_openai_client
from app.models.bible import BibleSection


def parse_document_into_sections(content: str) -> dict[str, dict[str, Any]]:
    """
    Parse document content into sections based on headers.
    Adapted from the original bible editor logic.
    """
    # Define regex patterns for headers
    patterns = [
        r"(I\.\s.*?)(?=\n[IV]+\.|Problems|Ideas|Characters|$)",
        r"(II\.\s.*?)(?=\n[IV]+\.|Problems|Ideas|Characters|$)",
        r"(III\.\s.*?)(?=\n[IV]+\.|Problems|Ideas|Characters|$)",
        r"(IV\.\s.*?)(?=\n[IV]+\.|Problems|Ideas|Characters|$)",
        r"(Problems)(?=\n[IV]+\.|Ideas|Characters|$)",
        r"(Ideas)(?=\n[IV]+\.|Problems|Characters|$)",
        r"(Characters)(?=\n[IV]+\.|Problems|Ideas|World|$)",
        r"(World)(?=\n[IV]+\.|Problems|Ideas|Characters|$)"
    ]

    sections = {}
    remaining_text = content

    # Map headers to friendlier display names
    markers = {
        "I. ": "I. The World",
        "II. ": "II. Metaphysical System",
        "III. ": "III. Characters",
        "IV. ": "IV. Story Beats",
        "Problems": "Issues/Problems",
        "Ideas": "Ideas",
        "Characters": "Character Profiles",
        "World": "World Building"
    }

    # Split the document by headers
    split_pattern = r"(^I\..*|^II\..*|^III\..*|^IV\..*|^Problems|^Ideas|^Characters|^World)"
    parts = re.split(split_pattern, content, flags=re.MULTILINE)

    current_header = "Intro/Uncategorized"
    if parts:
        sections[current_header] = {
            "section_name": current_header,
            "display_name": current_header,
            "content": parts[0].strip(),
            "order": 0
        }

    order = 1
    for i in range(1, len(parts), 2):
        header = parts[i].strip()
        content_text = parts[i+1].strip() if i+1 < len(parts) else ""

        # Clean up header name
        display_name = header
        section_name = header
        for key, val in markers.items():
            if header.startswith(key) or header == key:
                display_name = val
                break

        sections[display_name] = {
            "section_name": section_name,
            "display_name": display_name,
            "content": content_text,
            "order": order
        }
        order += 1

    return sections


def get_full_bible_context(session: Session) -> str:
    """
    Get the full bible content for context when editing sections.
    """
    sections = session.exec(
        select(BibleSection).order_by(BibleSection.order)
    ).all()

    if not sections:
        return ""

    full_content = []
    for section in sections:
        full_content.append(f"{section.section_name}\n{section.content}")

    return "\n\n".join(full_content)


def edit_bible_section(
    session: Session,
    section_name: str,
    current_content: str,
    user_instructions: str
) -> str:
    """
    Edit a specific bible section using OpenAI with full context.
    Adapted from the original bible editor logic.
    """

    # Get full bible context
    full_context = get_full_bible_context(session)

    client = get_openai_client()

    system_prompt = f"""
    You are an expert novel editor and writing assistant.

    BELOW IS THE ENTIRE CONTEXT OF THE NOVEL PROJECT.
    READ IT TO UNDERSTAND THE WORLD, TONE, AND PLOT.

    --- START CONTEXT ---
    {full_context}
    --- END CONTEXT ---

    YOUR TASK:
    The user will provide a specific SECTION to edit and INSTRUCTIONS.
    You must:
    1. Analyze how the changes fit the global context (tone, established facts).
    2. Rewrite the section based on the instructions.
    3. Output ONLY the rewritten section.
    """

    user_message = f"""
    --- CURRENT SECTION: {section_name} ---
    {current_content}
    ----------------------------

    INSTRUCTIONS:
    {user_instructions}
    """

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ],
        temperature=0.7
    )

    return response.choices[0].message.content

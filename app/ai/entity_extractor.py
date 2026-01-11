from __future__ import annotations

import json
import re
from typing import Any

from sqlmodel import Session, select

from app.ai.client import get_openai_client
from app.models.codex import Character, Concept
from app.models.problems import PlotHole
from app.models.timeline import Event


ACT_BEATS: dict[str, list[str]] = {
    "ACT 1": [
        "Epilogue",
        "Exposition/Introduction",
        "Inciting Incident",
        "Second Thoughts",
        "Climax Of Act One",
    ],
    "ACT 2": [
        "Obstacle (1)",
        "Rising Action",
        "Midpoint",
        "Obstacle (2)",
        "Disaster",
        "Climax Of Act Two",
    ],
    "ACT 3": [
        "Relative Peace",
        "Obstacle",
        "Rising Action",
        "Disaster",
        "Climax Of Act III",
        "Resolution",
        "Falling Action",
    ],
}


def _strip_json_fences(s: str) -> str:
    s = (s or "").strip()
    if s.startswith("```"):
        # Handle ```json ... ``` or ``` ... ```
        s = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", s)
        s = re.sub(r"\s*```$", "", s)
    return s.strip()


def _titleish(s: str) -> str:
    s = re.sub(r"\s+", " ", (s or "").strip())
    if not s:
        return ""
    # Keep acronyms; otherwise title-case words
    words = []
    for w in s.split(" "):
        if w.isupper() and len(w) <= 6:
            words.append(w)
        else:
            words.append(w[:1].upper() + w[1:])
    return " ".join(words)


def _heuristic_extract(text: str) -> dict[str, Any]:
    t = (text or "").strip()
    lower = t.lower()

    characters: list[dict[str, str]] = []
    concepts: list[dict[str, str]] = []
    events: list[dict[str, Any]] = []
    plot_holes: list[dict[str, str]] = []

    # Don't extract from questions
    if "?" in t or any(lower.startswith(word) for word in ["what", "who", "when", "where", "why", "how", "can ", "could ", "should ", "does ", "do ", "did ", "is ", "are ", "will ", "would "]):
        return {
            "characters": characters,
            "concepts": concepts,
            "events": events,
            "plot_holes": plot_holes,
            "source": "heuristic",
        }

    # Character: "His name is Zion" / "named Zion" - be more specific
    m = re.search(
        r"\b(?:his|her|their)?\s*name\s+is\s+([A-Za-z][\w-]{0,50}(?:\s+[A-Za-z][\w-]{0,50}){0,2})\b",
        t,
        flags=re.IGNORECASE,
    ) or re.search(
        r"\bnamed\s+([A-Za-z][\w-]{0,50}(?:\s+[A-Za-z][\w-]{0,50}){0,2})\b",
        t,
        flags=re.IGNORECASE,
    )
    char_name = _titleish(m.group(1)) if m else ""
    if char_name:
        characters.append({"name": char_name, "traits": "", "arc": ""})

    # Concept: "power of flying" / "ability to fly" - require more context
    concept_title = ""
    if "power of" in lower or "ability to" in lower:
        m = re.search(r"\bpower\s+of\s+([^,.;\n]{3,80})", lower)
        if m:
            concept_title = _titleish(m.group(1))
        else:
            m2 = re.search(r"\bability\s+to\s+([^,.;\n]{3,80})", lower)
            if m2:
                concept_title = _titleish(m2.group(1))
    if concept_title:
        concepts.append({"title": concept_title, "description": ""})

    # Act / beat signals - only if clearly describing story structure
    act = None
    if re.search(r"\bact\s*1\b", lower):
        act = "ACT 1"
    elif re.search(r"\bact\s*2\b", lower):
        act = "ACT 2"
    elif re.search(r"\bact\s*3\b", lower):
        act = "ACT 3"

    beat = None
    if any(k in lower for k in ["intro", "introduction", "exposition"]):
        beat = "Exposition/Introduction"
    elif "inciting" in lower:
        beat = "Inciting Incident"

    # Event: look for "scene" + at least a character/concept/act hint, but be more conservative
    if ("scene" in lower or act or beat) and (char_name or concept_title or "new scene" in lower):
        parts = []
        if act:
            parts.append(act)
        if beat:
            parts.append(beat)

        core = ""
        if char_name and concept_title and ("learn" in lower or "learned" in lower):
            core = f"{char_name} learns {concept_title}"
        elif char_name and concept_title:
            core = f"{char_name} + {concept_title}"
        elif char_name:
            core = f"Scene featuring {char_name}"
        elif concept_title:
            core = f"Scene about {concept_title}"
        else:
            core = "New scene"

        title = (": ".join([" — ".join(parts), core]) if parts else core).strip()
        # Keep titles mention-friendly
        title = title[:80].rstrip()

        events.append({"title": title, "description": t, "act": act, "beat": beat, "approx_order": 0})

    return {
        "characters": characters,
        "concepts": concepts,
        "events": events,
        "plot_holes": plot_holes,
        "source": "heuristic",
    }


def _extract_explicit_plot_hole_command(text: str) -> dict[str, Any] | None:
    """
    If the user explicitly asks to create a problem/issue/plot hole, create a Problem (stored in PlotHole table)
    and infer a suitable kind.
    Examples:
      - "create a problem saying: need to..."
      - "add an issue: X"
      - "new plot hole: Y"
    """
    t = (text or "").strip()
    if not t:
        return None

    lower = t.lower()
    if not any(
        k in lower
        for k in [
            "create a problem",
            "create an issue",
            "create issue",
            "create problem",
            "plot hole",
            "plothole",
            "new problem",
            "new issue",
        ]
    ):
        return None

    # Infer kind from keywords
    kind = "plot_hole"
    if any(k in lower for k in ["scene", "rewrite", "fix scene"]):
        kind = "scene_to_fix"
    if any(k in lower for k in ["concept", "rule", "lore", "system"]):
        kind = "concept_issue"
    if "continuity" in lower:
        kind = "continuity"
    if "pacing" in lower:
        kind = "pacing"
    if "motivation" in lower:
        kind = "character_motivation"
    if "worldbuilding" in lower:
        kind = "worldbuilding"

    # Try to capture a "title" after common delimiters
    m = re.search(r"\b(?:saying|titled|title)\s*:\s*(.+)$", t, flags=re.IGNORECASE) or re.search(
        r"\b(?:problem|issue|plot\s*hole|plothole)\b\s*:\s*(.+)$", t, flags=re.IGNORECASE
    )
    title = (m.group(1).strip() if m else "").strip()
    title = re.sub(r"\s+", " ", title)

    if not title:
        # Fallback: use whole message (trimmed) as title, but keep it short
        title = re.sub(r"\s+", " ", t)
        title = title[:120].rstrip()

    return {
        "characters": [],
        "concepts": [],
        "events": [],
        "plot_holes": [{"title": title, "description": t, "kind": kind}],
        "source": "rule",
    }


def extract_entities_from_text(
    session: Session,
    *,
    text: str,
    model: str = "gpt-4o-mini",
) -> dict[str, Any]:
    """
    Returns a dict like:
      {
        "characters": [{"name": str, "traits": str, "arc": str}],
        "concepts": [{"title": str, "description": str}],
        "events": [{"title": str, "description": str, "act": str|null, "beat": str|null, "approx_order": int}],
        "plot_holes": [{"title": str, "description": str, "kind": str}],
        "source": "llm"|"heuristic"
      }
    """
    cleaned = (text or "").strip()
    if not cleaned:
        return {"characters": [], "concepts": [], "events": [], "plot_holes": [], "source": "heuristic"}

    # Don't extract from questions unless they contain explicit creation commands
    lower = cleaned.lower()
    is_question = ("?" in cleaned or
                  any(lower.startswith(word) for word in ["what", "who", "when", "where", "why", "how", "can ", "could ", "should ", "does ", "do ", "did ", "is ", "are ", "will ", "would "]))
    has_creation_command = any(keyword in lower for keyword in ["create a", "create an", "add a", "add an", "new character", "new concept", "new event", "new plot hole", "new issue", "new problem"])

    if is_question and not has_creation_command:
        return {"characters": [], "concepts": [], "events": [], "plot_holes": [], "source": "heuristic"}

    forced = _extract_explicit_plot_hole_command(cleaned)
    if forced:
        return forced

    # Small "index" to reduce duplicates
    existing = {
        "characters": session.exec(select(Character.name).order_by(Character.name).limit(200)).all(),
        "concepts": session.exec(select(Concept.title).order_by(Concept.title).limit(200)).all(),
        "events": session.exec(select(Event.title).order_by(Event.title).limit(200)).all(),
        "plot_holes": session.exec(select(PlotHole.title).order_by(PlotHole.title).limit(200)).all(),
        "acts_note": "Acts are stored on Events via event.act; do not create separate Act records.",
    }

    try:
        client = get_openai_client()
    except Exception:
        return _heuristic_extract(cleaned)

    system = (
        "You extract NEW lore entities from text for a fiction database. "
        "Return STRICT JSON ONLY. No markdown, no commentary."
    )

    user: dict[str, Any] = {
        "task": "Extract entities to create/update from this text.",
        "text": cleaned,
        "existing_index": existing,
        "allowed_acts": list(ACT_BEATS.keys()),
        "allowed_beats_by_act": ACT_BEATS,
        "output_schema": {
            "characters": [{"name": "str", "traits": "str", "arc": "str"}],
            "concepts": [{"title": "str", "description": "str"}],
            "events": [{"title": "str", "description": "str", "act": "str|null", "beat": "str|null", "approx_order": "int"}],
            "plot_holes": [{"title": "str", "description": "str", "kind": "str"}],
        },
        "rules": [
            "Only include entities that are explicitly stated or clearly implied in the text.",
            "If the text explicitly requests creating a problem/issue/plot hole, output it under plot_holes (not concepts).",
            "For plot_holes.kind use one of: plot_hole, scene_to_fix, concept_issue, continuity, pacing, character_motivation, worldbuilding, other.",
            "Prefer reusing existing entities if names match ignoring case; otherwise create new.",
            "For characters: use a proper name, Title Case (e.g. 'Zion').",
            "For concepts: use a short title (<= 80 chars) that could be @mentioned (e.g. 'Power of Flying').",
            "For events: create a short, mention-friendly title (<= 80 chars).",
            "If act/beat are implied, set act to one of allowed_acts and beat to one of allowed beats for that act.",
            "If not sure about act/beat, set them to null.",
            "Return only the JSON object with keys: characters, concepts, events, plot_holes.",
        ],
    }

    try:
        resp = client.chat.completions.create(
            model=model,
            temperature=0.2,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(user)},
            ],
        )
        content = _strip_json_fences(resp.choices[0].message.content or "")
        parsed = json.loads(content)
        # Normalize missing keys
        out = {
            "characters": parsed.get("characters") or [],
            "concepts": parsed.get("concepts") or [],
            "events": parsed.get("events") or [],
            "plot_holes": parsed.get("plot_holes") or [],
            "source": "llm",
        }
        return out
    except Exception:
        return _heuristic_extract(cleaned)



from __future__ import annotations

import json
from typing import Any

from app.ai.client import get_openai_client


def synthesize_and_align_timeline(
    *,
    events: list[dict[str, Any]],
    model: str = "gpt-4o-mini",
) -> dict[str, Any]:
    """
    events: [{id, title, description, approx_order}]
    Returns:
      {
        "aligned": [{"id": int, "suggested_order": int, "notes": str}],
        "global_notes": str
      }
    """
    client = get_openai_client()

    system = (
        "You are a story editor and timeline continuity expert. "
        "Given a list of story events with approximate ordering, you will: "
        "(1) identify logic gaps/continuity issues, (2) suggest pacing improvements, "
        "(3) output a cohesive ordering."
    )

    user = {
        "task": "Synthesize & Align the timeline. Return STRICT JSON only.",
        "events": events,
        "output_schema": {
            "aligned": [{"id": "int", "suggested_order": "int", "notes": "str"}],
            "global_notes": "str",
        },
        "constraints": [
            "Use each input event id exactly once in aligned.",
            "suggested_order should be 10,20,30... leaving room for inserts.",
            "notes should be concise (<= 2 sentences) per event.",
            "Return only JSON with keys: aligned, global_notes.",
        ],
    }

    resp = client.chat.completions.create(
        model=model,
        temperature=0.2,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(user)},
        ],
    )

    content = resp.choices[0].message.content or ""
    content = content.strip()
    # Best-effort JSON parse
    return json.loads(content)



from __future__ import annotations

import json
from typing import Any

from app.ai.client import get_openai_client


def brainstorm_plot_hole_solutions(
    *,
    plot_hole: dict[str, Any],
    context: dict[str, Any],
    model: str = "gpt-4o-mini",
) -> dict[str, Any]:
    """
    plot_hole: {title, description, related_entity_type, related_entity_name?}
    context: {characters, concepts, acts, events}
    Returns STRICT JSON:
      {
        "solutions": [{"title": str, "details": str}],
        "tradeoffs": [str],
        "clarifying_questions": [str]
      }
    """
    client = get_openai_client()

    system = (
        "You are a senior story editor and plot doctor. "
        "Generate practical fixes that preserve continuity and strengthen theme/pacing."
    )

    user = {
        "task": "Brainstorm solutions for this plot hole. Return STRICT JSON only.",
        "plot_hole": plot_hole,
        "context": context,
        "output_schema": {
            "solutions": [{"title": "str", "details": "str"}],
            "tradeoffs": ["str"],
            "clarifying_questions": ["str"],
        },
        "constraints": [
            "Provide 3-6 solutions.",
            "Each solution should be actionable and reference context when helpful.",
            "Keep tradeoffs concise.",
            "Return only JSON with keys: solutions, tradeoffs, clarifying_questions.",
        ],
    }

    resp = client.chat.completions.create(
        model=model,
        temperature=0.5,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(user)},
        ],
    )
    content = (resp.choices[0].message.content or "").strip()
    return json.loads(content)



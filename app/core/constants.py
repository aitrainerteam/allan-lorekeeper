from __future__ import annotations

"""
Shared constants and configuration values.

This module contains constants and configuration values that are used across
multiple modules in LoreKeeper to avoid duplication and ensure consistency.
"""


# Story structure constants for timeline management and entity extraction
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


def parse_int(value: str | None) -> int | None:
    """
    Parse a string value to integer, handling None and empty strings.

    Args:
        value: String value to parse.

    Returns:
        int or None: Parsed integer or None if invalid/empty.
    """
    if value is None:
        return None
    value = value.strip()
    if value == "":
        return None
    try:
        return int(value)
    except ValueError:
        return None
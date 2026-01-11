from __future__ import annotations

import re

from markupsafe import Markup, escape


_MENTION_RE = re.compile(
    r"""
    @\{(?P<braced>[^}]{1,80})\}      # @{Multi Word}
    |
    @(?P<word>[A-Za-z][\w-]{0,50})   # @Jason
    """,
    re.VERBOSE,
)


def linkify_mentions(text: str | None) -> Markup:
    """
    Converts @mentions into safe HTML spans for hover previews.

    Supported:
    - @Jason
    - @{Jason Clark}
    """
    if not text:
        return Markup("")

    s = str(text)
    out: list[str] = []
    last = 0

    for m in _MENTION_RE.finditer(s):
        start, end = m.span()
        if start > last:
            out.append(str(escape(s[last:start])))

        name = m.group("braced") or m.group("word") or ""
        name = name.strip()
        shown = "@" + name

        # data-mention is used by JS to fetch preview HTML
        out.append(
            str(
                Markup(
                    '<span class="lk-mention underline decoration-dotted underline-offset-2 cursor-help text-indigo-200" '
                    'data-mention="{name}">{shown}</span>'
                ).format(name=escape(name), shown=escape(shown))
            )
        )
        last = end

    if last < len(s):
        out.append(str(escape(s[last:])))

    return Markup("".join(out))



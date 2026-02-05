"""
Conversational Story Oracle with OpenAI Function Calling.

This module provides a ChatGPT-like conversational assistant for story consultation.
It naturally discusses the user's story and can create entities when explicitly requested.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, List

from sqlmodel import Session, select

from app.ai.client import get_openai_client
from app.ai.oracle import analyze_novel_for_issues, build_rag_lite_context
from app.crud.auto_entities import persist_extracted_entities
from app.models.chat import ChatMessage


# Tool definitions - only for explicit entity creation/modification
# IMPORTANT: Tools should only capture EXACTLY what the user provides, no embellishment
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "create_character",
            "description": "Create a new character. ONLY include information the user EXPLICITLY stated. Do NOT invent or embellish traits, arcs, or any details.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Character name - exactly as user stated"},
                    "traits": {"type": "string", "description": "ONLY traits/details the user explicitly mentioned (age, species, occupation, etc). Leave empty if not provided."},
                    "arc": {"type": "string", "description": "ONLY arc details the user explicitly mentioned. Leave empty if not provided."}
                },
                "required": ["name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_concept",
            "description": "Create a new concept/rule/magic system. ONLY include information the user EXPLICITLY stated. Do NOT invent details.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Concept title - exactly as user stated"},
                    "description": {"type": "string", "description": "ONLY description the user explicitly provided. Leave empty if not provided."}
                },
                "required": ["title"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_event",
            "description": "Create a new timeline event/scene. ONLY include information the user EXPLICITLY stated. Do NOT invent details.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Event title - exactly as user stated"},
                    "description": {"type": "string", "description": "ONLY description the user explicitly provided. Leave empty if not provided."},
                    "act": {"type": "string", "enum": ["ACT 1", "ACT 2", "ACT 3"], "description": "Only if user specified"},
                    "beat": {"type": "string", "description": "Only if user specified"}
                },
                "required": ["title"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_problem",
            "description": "Create a plot hole or issue to track. ONLY include information the user EXPLICITLY stated.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Problem title - exactly as user stated"},
                    "description": {"type": "string", "description": "ONLY description the user explicitly provided. Leave empty if not provided."},
                    "kind": {"type": "string", "enum": ["plot_hole", "continuity", "character_motivation", "worldbuilding", "pacing", "concept_issue", "scene_to_fix", "other"]}
                },
                "required": ["title"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_story",
            "description": "Deep analyze the entire story for plot holes and inconsistencies. Only use when user explicitly asks to analyze or find issues.",
            "parameters": {"type": "object", "properties": {}}
        }
    }
]


def build_system_prompt(context: Dict[str, Any]) -> str:
    """Build a system prompt that includes story context."""
    oracle_instructions = context.get("oracle_instructions", "")
    
    # Format context sections
    context_parts = []
    
    if context.get("bible_sections"):
        bible_text = "\n".join([
            f"**{s['name']}**: {s['content'][:500]}{'...' if len(s['content']) > 500 else ''}"
            for s in context["bible_sections"][:5]
        ])
        context_parts.append(f"## Story Bible\n{bible_text}")
    
    if context.get("characters"):
        chars = context["characters"][:10]
        char_text = "\n".join([
            f"- **{c['name']}**: {c.get('traits', 'No traits')} | Arc: {c.get('arc', 'Unknown')}"
            for c in chars
        ])
        context_parts.append(f"## Characters ({len(context['characters'])} total)\n{char_text}")
    
    if context.get("concepts"):
        concepts = context["concepts"][:8]
        concept_text = "\n".join([
            f"- **{c['title']}**: {c.get('description', '')[:200]}"
            for c in concepts
        ])
        context_parts.append(f"## Concepts\n{concept_text}")
    
    if context.get("events"):
        events = context["events"][:10]
        event_text = "\n".join([
            f"- **{e['title']}**: {e.get('description', '')[:150]}"
            for e in events
        ])
        context_parts.append(f"## Timeline Events\n{event_text}")
    
    if context.get("plot_holes"):
        holes = [h for h in context["plot_holes"] if h.get("status") != "resolved"][:5]
        if holes:
            hole_text = "\n".join([
                f"- **{h['title']}**: {h.get('description', '')[:100]}"
                for h in holes
            ])
            context_parts.append(f"## Known Issues/Plot Holes\n{hole_text}")
    
    story_context = "\n\n".join(context_parts) if context_parts else "No story data yet. The user hasn't added any characters, events, or concepts."
    
    system_prompt = f"""You are the Story Oracle for LoreKeeper, an AI writing assistant. You help fiction writers develop and understand their stories.

## Your Role
- Be a knowledgeable, helpful creative partner who understands the user's story deeply
- Answer questions naturally and conversationally about characters, plot, timeline, world-building
- Offer insights, suggestions, and help brainstorm when asked
- Be encouraging but honest about potential issues

## User's Story Context
{story_context}

## Custom Instructions from Author
{oracle_instructions if oracle_instructions else "None provided."}

## Guidelines
1. **Be conversational** - respond naturally like ChatGPT, not like a rigid assistant
2. **Use your knowledge** - draw from the story context above to give informed answers
3. **Don't ask for clarification** unless truly necessary - make reasonable assumptions
4. **Only use tools** when the user EXPLICITLY asks to create/add something or analyze the story
5. **For questions** - just answer them directly using the context, no tool needed
6. **Be concise** but thorough - don't pad responses unnecessarily
7. **Reference specifics** - mention character names, events, concepts when relevant

## Tool Usage
- ONLY call create_* tools when user says things like "create", "add", "make a new"
- ONLY call analyze_story when user says "analyze", "find issues", "check for problems"  
- For regular questions and discussion, just respond normally WITHOUT tools

## CRITICAL: Entity Creation Rules
When creating entities (characters, concepts, events, problems):
- **ONLY store exactly what the user said** - no embellishment, no brainstorming
- **Do NOT invent** traits, backstory, personality, arcs, or any details
- If user says "create character Tessia, 19 years old, fairy" → traits should be ONLY "19 years old, fairy"
- Leave fields EMPTY if the user didn't provide that information
- Accuracy over verbosity - the user can add more details later"""
    
    return system_prompt


@dataclass
class RouterResult:
    """Result from the Oracle containing response text and metadata."""
    response_text: str
    entity_summary: Dict[str, Any] | None = None
    is_clarification: bool = False
    has_errors: bool = False


def route_user_message(
    session: Session,
    message: str,
    conversation_id: str,
    model: str = "gpt-4o-mini"
) -> RouterResult:
    """
    Process user message with conversational Oracle.
    
    This function creates a ChatGPT-like experience - naturally conversational
    with the ability to create entities when explicitly requested.
    """
    try:
        client = get_openai_client()
    except Exception as e:
        return RouterResult(
            response_text=f"AI service unavailable: {str(e)}",
            has_errors=True
        )

    # Build story context
    context = build_rag_lite_context(session, question=message)
    system_prompt = build_system_prompt(context)
    
    # Get recent conversation history for context
    recent_messages = session.exec(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(10)
    ).all()
    
    # Build message history (oldest first)
    messages = [{"role": "system", "content": system_prompt}]
    for msg in reversed(recent_messages):
        messages.append({"role": msg.role, "content": msg.content})
    
    # Add current message
    messages.append({"role": "user", "content": message})

    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",  # Let model decide - usually won't need tools
            temperature=0.7,
        )
        
        response_message = response.choices[0].message
        
        # Check if we have tool calls
        if response_message.tool_calls:
            return execute_tool_calls(session, response_message.tool_calls, context)
        
        # Normal conversational response
        return RouterResult(
            response_text=response_message.content or "I'm not sure how to respond to that."
        )

    except Exception as e:
        return RouterResult(
            response_text=f"Error processing your message: {str(e)}",
            has_errors=True
        )


def execute_tool_calls(
    session: Session,
    tool_calls: List[Any],
    context: Dict[str, Any]
) -> RouterResult:
    """Execute tool calls and return combined results."""
    results = []
    has_errors = False

    for tool_call in tool_calls:
        try:
            function_name = tool_call.function.name
            arguments = json.loads(tool_call.function.arguments)

            if function_name == "create_character":
                result = handle_create_character(session, arguments)
            elif function_name == "create_concept":
                result = handle_create_concept(session, arguments)
            elif function_name == "create_event":
                result = handle_create_event(session, arguments)
            elif function_name == "create_problem":
                result = handle_create_problem(session, arguments)
            elif function_name == "analyze_story":
                result = handle_analyze_story(session)
            else:
                result = f"Unknown action: {function_name}"
                has_errors = True

            results.append(result)

        except Exception as e:
            results.append(f"Error: {str(e)}")
            has_errors = True

    return RouterResult(
        response_text="\n\n".join(results),
        has_errors=has_errors
    )


# Tool handlers
def handle_create_character(session: Session, arguments: Dict[str, Any]) -> str:
    """Create a new character - stores ONLY what user provided."""
    name = arguments.get("name", "").strip()
    if not name:
        return "I need a name to create a character."

    # Only use what was explicitly provided, default to empty
    traits = arguments.get("traits", "").strip()
    arc = arguments.get("arc", "").strip()

    try:
        extracted = {
            "characters": [{"name": name, "traits": traits, "arc": arc}],
            "concepts": [], "events": [], "plot_holes": []
        }
        summary = persist_extracted_entities(session, extracted)

        if summary["created"]["characters"]:
            response = f"✓ Created **{name}**"
            if traits:
                response += f" ({traits})"
            return response
        else:
            return f"**{name}** already exists - updated with new details."
    except Exception as e:
        return f"Couldn't create character: {str(e)}"


def handle_create_concept(session: Session, arguments: Dict[str, Any]) -> str:
    """Create a new concept - stores ONLY what user provided."""
    title = arguments.get("title", "").strip()
    if not title:
        return "I need a title to create a concept."

    description = arguments.get("description", "").strip()

    try:
        extracted = {
            "characters": [], "events": [], "plot_holes": [],
            "concepts": [{"title": title, "description": description}]
        }
        summary = persist_extracted_entities(session, extracted)

        if summary["created"]["concepts"]:
            response = f"✓ Created concept **{title}**"
            if description:
                response += f" - {description[:100]}"
            return response
        else:
            return f"**{title}** already exists - updated with new details."
    except Exception as e:
        return f"Couldn't create concept: {str(e)}"


def handle_create_event(session: Session, arguments: Dict[str, Any]) -> str:
    """Create a new timeline event - stores ONLY what user provided."""
    title = arguments.get("title", "").strip()
    if not title:
        return "I need a title to create an event."

    description = arguments.get("description", "").strip()
    act = arguments.get("act", "").strip() if arguments.get("act") else None
    beat = arguments.get("beat", "").strip() if arguments.get("beat") else None

    try:
        extracted = {
            "characters": [], "concepts": [], "plot_holes": [],
            "events": [{"title": title, "description": description, "act": act, "beat": beat, "approx_order": 0}]
        }
        summary = persist_extracted_entities(session, extracted)

        if summary["created"]["events"]:
            response = f"✓ Created event **{title}**"
            if act:
                response += f" ({act})"
            return response
        else:
            return f"**{title}** already exists - updated with new details."
    except Exception as e:
        return f"Couldn't create event: {str(e)}"


def handle_create_problem(session: Session, arguments: Dict[str, Any]) -> str:
    """Create a plot hole or issue - stores ONLY what user provided."""
    title = arguments.get("title", "").strip()
    if not title:
        return "I need a title to create a problem entry."

    description = arguments.get("description", "").strip()
    kind = arguments.get("kind", "plot_hole")

    try:
        extracted = {
            "characters": [], "concepts": [], "events": [],
            "plot_holes": [{"title": title, "description": description, "kind": kind}]
        }
        summary = persist_extracted_entities(session, extracted)

        if summary["created"]["plot_holes"]:
            return f"✓ Noted: **{title}**"
        else:
            return f"**{title}** is already tracked."
    except Exception as e:
        return f"Couldn't create problem: {str(e)}"


def handle_analyze_story(session: Session) -> str:
    """Analyze the story for issues."""
    try:
        issues = analyze_novel_for_issues(session)
        if not issues:
            return "I've analyzed your story and everything looks consistent! No obvious plot holes or issues found."

        lines = [f"I found **{len(issues)} potential issue(s)** in your story:\n"]
        for i, issue in enumerate(issues, 1):
            title = issue.get("title", "Untitled")
            description = issue.get("description", "")
            kind = issue.get("kind", "plot_hole").replace("_", " ").title()
            lines.append(f"**{i}. {title}** _{kind}_")
            if description:
                lines.append(f"   {description}\n")

        lines.append("\n_These have been added to your plot holes tracker._")
        return "\n".join(lines)
    except Exception as e:
        return f"Couldn't analyze story: {str(e)}"

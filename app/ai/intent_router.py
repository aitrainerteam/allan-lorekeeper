"""
LLM Intent Classification and Action Routing with OpenAI Function Calling.

This module provides intelligent intent detection and action execution using OpenAI's
function calling capabilities. It replaces hardcoded pattern matching with LLM-driven
understanding of user requests, supporting multi-action requests and clarification handling.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, List

from sqlmodel import Session

from app.ai.client import get_openai_client
from app.ai.oracle import answer_story_question, analyze_novel_for_issues, build_rag_lite_context
from app.crud.auto_entities import persist_extracted_entities
from app.models.codex import Character, Concept
from app.models.common import utcnow
from app.models.problems import PlotHole
from app.models.timeline import Event


# Tool definitions for OpenAI function calling
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "answer_question",
            "description": "Answer a question about the user's story using available context (characters, concepts, events, plot holes, bible sections)",
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {"type": "string", "description": "The question to answer"}
                },
                "required": ["question"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_character",
            "description": "Create a new character in the story database",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "traits": {"type": "string", "description": "Character traits/personality"},
                    "arc": {"type": "string", "description": "Character arc/development"}
                },
                "required": ["name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_concept",
            "description": "Create a new concept/rule/magic system in the story",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "description": {"type": "string"}
                },
                "required": ["title"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_event",
            "description": "Create a new timeline event/scene",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "act": {"type": "string", "enum": ["ACT 1", "ACT 2", "ACT 3"]},
                    "beat": {"type": "string"}
                },
                "required": ["title"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_problem",
            "description": "Create a plot hole, issue, or problem to track",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "description": {"type": "string"},
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
            "description": "Analyze the entire story for plot holes, inconsistencies, and issues",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "request_clarification",
            "description": "Ask the user to clarify their request when intent is unclear",
            "parameters": {
                "type": "object",
                "properties": {
                    "message": {"type": "string", "description": "The clarification message"},
                    "options": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Specific options for the user to choose from"
                    }
                },
                "required": ["message", "options"]
            }
        }
    }
]

# System prompt for the intent router
ROUTER_SYSTEM_PROMPT = """You are an AI assistant for LoreKeeper, a fiction writing tool.
Your job is to understand what the user wants and call the appropriate tool(s).

Available actions:
- Answer questions about their story (characters, plot, timeline, etc.)
- Create new entities (characters, concepts, events, problems)
- Analyze the story for issues

Guidelines:
1. If the user asks a question, use answer_question
2. If the user wants to create something, use the appropriate create_* tool
3. If the user asks to "find issues" or "analyze", use analyze_story
4. If the request is ambiguous, use request_clarification with specific options
5. You can call MULTIPLE tools if the request requires it

When uncertain, ALWAYS use request_clarification rather than guessing.
Include 2-4 specific, actionable options based on what you think the user might want.
"""


@dataclass
class RouterResult:
    """Result from the intent router containing response text and metadata."""
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
    Routes user message to appropriate action(s) using LLM tool calling.
    Returns structured result with tool calls and any generated response.

    Args:
        session: Database session for entity operations
        message: The user's input message
        conversation_id: Conversation identifier for context
        model: OpenAI model to use

    Returns:
        RouterResult: Structured result with response text and metadata
    """
    try:
        client = get_openai_client()
    except Exception:
        # Fallback to heuristic approach if OpenAI is not available
        return _fallback_routing(session, message)

    # Build context for the LLM to understand available story elements
    context = build_rag_lite_context(session, question=message)

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": ROUTER_SYSTEM_PROMPT},
                {"role": "user", "content": message}
            ],
            tools=TOOLS,
            tool_choice="auto"  # Let LLM decide
        )

        # Process tool calls and execute handlers
        return execute_tool_calls(session, response, context, conversation_id, message)

    except Exception as e:
        # Fallback on API errors
        return _fallback_routing(session, message, error=str(e))


def execute_tool_calls(
    session: Session,
    response: Any,
    context: Dict[str, Any],
    conversation_id: str,
    original_message: str
) -> RouterResult:
    """
    Execute tool calls from the LLM response and return formatted result.

    Args:
        session: Database session
        response: OpenAI API response with tool calls
        context: Story context dictionary
        conversation_id: Conversation identifier
        original_message: Original user message

    Returns:
        RouterResult: Execution results
    """
    tool_calls = response.choices[0].message.tool_calls
    if not tool_calls:
        # No tool calls - this shouldn't happen with our prompt, but handle gracefully
        return RouterResult(
            response_text="I'm not sure what you'd like me to do. Could you clarify your request?",
            is_clarification=True
        )

    results = []
    entity_summary = None
    has_clarification = False
    has_errors = False

    # Execute each tool call
    for tool_call in tool_calls:
        try:
            function_name = tool_call.function.name
            arguments = json.loads(tool_call.function.arguments)

            if function_name == "answer_question":
                result = handle_answer_question(session, arguments, context, conversation_id)
            elif function_name == "create_character":
                result = handle_create_character(session, arguments)
            elif function_name == "create_concept":
                result = handle_create_concept(session, arguments)
            elif function_name == "create_event":
                result = handle_create_event(session, arguments)
            elif function_name == "create_problem":
                result = handle_create_problem(session, arguments)
            elif function_name == "analyze_story":
                result = handle_analyze_story(session)
            elif function_name == "request_clarification":
                result = handle_request_clarification(arguments)
                has_clarification = True
            else:
                result = f"Unknown function: {function_name}"
                has_errors = True

            results.append(result)

        except Exception as e:
            results.append(f"Error executing {tool_call.function.name}: {str(e)}")
            has_errors = True

    # Combine results
    response_text = "\n\n".join(results)

    # If we created entities, we need to extract the entity summary
    # This is a bit tricky since multiple tool calls might create entities
    if any("create_" in call.function.name for call in tool_calls):
        # We'll need to collect all created entities and format them
        # For now, just mark that we have entity changes
        pass

    return RouterResult(
        response_text=response_text,
        entity_summary=entity_summary,
        is_clarification=has_clarification,
        has_errors=has_errors
    )


# Tool handlers
def handle_answer_question(
    session: Session,
    arguments: Dict[str, Any],
    context: Dict[str, Any],
    conversation_id: str
) -> str:
    """Handle answer_question tool call."""
    question = arguments.get("question", "")
    if not question:
        return "I need a question to answer."

    try:
        return answer_story_question(
            session=session,
            conversation_id=conversation_id,
            question=question,
            context=context
        )
    except Exception as e:
        return f"Error answering question: {str(e)}"


def handle_create_character(session: Session, arguments: Dict[str, Any]) -> str:
    """Handle create_character tool call."""
    name = arguments.get("name", "").strip()
    if not name:
        return "Character name is required."

    traits = arguments.get("traits", "")
    arc = arguments.get("arc", "")

    try:
        extracted = {
            "characters": [{"name": name, "traits": traits, "arc": arc}],
            "concepts": [],
            "events": [],
            "plot_holes": []
        }
        summary = persist_extracted_entities(session, extracted)

        if summary["created"]["characters"]:
            return f"Created character {name}."
        else:
            return f"Character {name} already exists (may have been updated)."
    except Exception as e:
        return f"Error creating character: {str(e)}"


def handle_create_concept(session: Session, arguments: Dict[str, Any]) -> str:
    """Handle create_concept tool call."""
    title = arguments.get("title", "").strip()
    if not title:
        return "Concept title is required."

    description = arguments.get("description", "")

    try:
        extracted = {
            "characters": [],
            "concepts": [{"title": title, "description": description}],
            "events": [],
            "plot_holes": []
        }
        summary = persist_extracted_entities(session, extracted)

        if summary["created"]["concepts"]:
            return f"Created concept '{title}'."
        else:
            return f"Concept '{title}' already exists (may have been updated)."
    except Exception as e:
        return f"Error creating concept: {str(e)}"


def handle_create_event(session: Session, arguments: Dict[str, Any]) -> str:
    """Handle create_event tool call."""
    title = arguments.get("title", "").strip()
    if not title:
        return "Event title is required."

    description = arguments.get("description", "")
    act = arguments.get("act")
    beat = arguments.get("beat")

    try:
        extracted = {
            "characters": [],
            "concepts": [],
            "events": [{"title": title, "description": description, "act": act, "beat": beat, "approx_order": 0}],
            "plot_holes": []
        }
        summary = persist_extracted_entities(session, extracted)

        if summary["created"]["events"]:
            return f"Created event '{title}'."
        else:
            return f"Event '{title}' already exists (may have been updated)."
    except Exception as e:
        return f"Error creating event: {str(e)}"


def handle_create_problem(session: Session, arguments: Dict[str, Any]) -> str:
    """Handle create_problem tool call."""
    title = arguments.get("title", "").strip()
    if not title:
        return "Problem title is required."

    description = arguments.get("description", "")
    kind = arguments.get("kind", "plot_hole")

    try:
        extracted = {
            "characters": [],
            "concepts": [],
            "events": [],
            "plot_holes": [{"title": title, "description": description, "kind": kind}]
        }
        summary = persist_extracted_entities(session, extracted)

        if summary["created"]["plot_holes"]:
            return f"Created problem '{title}'."
        else:
            return f"Problem '{title}' already exists (may have been updated)."
    except Exception as e:
        return f"Error creating problem: {str(e)}"


def handle_analyze_story(session: Session) -> str:
    """Handle analyze_story tool call."""
    try:
        issues = analyze_novel_for_issues(session)
        if not issues:
            return "I analyzed your story and didn't find any obvious issues. Your narrative appears consistent!"

        lines = [f"I found {len(issues)} potential issue(s) in your story:"]
        for i, issue in enumerate(issues, 1):
            title = issue.get("title", "Untitled Issue")
            description = issue.get("description", "")
            kind = issue.get("kind", "plot_hole").replace("_", " ").title()
            lines.append(f"\n**{i}. {title}** ({kind})")
            if description:
                lines.append(f"   {description}")

        lines.append("\nI've added these as plot holes to your database so you can track and resolve them.")
        return "\n".join(lines)
    except Exception as e:
        return f"Error analyzing story: {str(e)}"


def handle_request_clarification(arguments: Dict[str, Any]) -> str:
    """Handle request_clarification tool call."""
    message = arguments.get("message", "I need clarification on your request.")
    options = arguments.get("options", [])

    lines = [message, ""]
    for i, option in enumerate(options, 1):
        lines.append(f"{i}. {option}")

    return "\n".join(lines)


def _fallback_routing(session: Session, message: str, error: str | None = None) -> RouterResult:
    """Fallback routing when OpenAI is not available."""
    # Simple heuristic fallback
    lower_message = message.lower().strip()

    if error:
        error_msg = f"(AI service unavailable: {error}). "
    else:
        error_msg = "(AI service unavailable). "

    # Basic question detection
    if ("?" in message or
        any(lower_message.startswith(word) for word in ["what", "who", "when", "where", "why", "how", "can ", "could ", "should ", "does ", "do ", "did ", "is ", "are ", "will ", "would "])):
        return RouterResult(
            response_text=error_msg + "For questions, please try asking me when the AI service is available.",
            has_errors=True
        )

    # Basic creation detection
    if any(keyword in lower_message for keyword in ["create a", "create an", "add a", "add an", "new character", "new concept", "new event", "new plot hole", "new issue", "new problem"]):
        # Try to extract entities using the existing heuristic method
        try:
            from app.ai.entity_extractor import extract_entities_from_text
            extracted = extract_entities_from_text(session, text=message)
            if extracted and (extracted.get("characters") or extracted.get("concepts") or extracted.get("events") or extracted.get("plot_holes")):
                summary = persist_extracted_entities(session, extracted)
                # Format summary similar to existing chat.py logic
                created = summary.get("created", {})
                updated = summary.get("updated", {})

                lines = []
                if created.get("characters") or updated.get("characters"):
                    lines.append("Characters: " + ", ".join(created.get("characters", []) + updated.get("characters", [])))
                if created.get("concepts") or updated.get("concepts"):
                    lines.append("Concepts: " + ", ".join(created.get("concepts", []) + updated.get("concepts", [])))
                if created.get("events") or updated.get("events"):
                    lines.append("Events: " + ", ".join(created.get("events", []) + updated.get("events", [])))
                if created.get("plot_holes") or updated.get("plot_holes"):
                    lines.append("Plot Holes: " + ", ".join(created.get("plot_holes", []) + updated.get("plot_holes", [])))

                response = "Created/updated entities:\n" + "\n".join(lines) if lines else "No entities were created or updated."
                return RouterResult(response_text=response)
        except Exception as e:
            return RouterResult(
                response_text=error_msg + f"Could not process entity creation: {str(e)}",
                has_errors=True
            )

    return RouterResult(
        response_text=error_msg + "I'm not sure what you'd like me to do. Try being more specific, like 'create a character named X' or ask a question about your story.",
        is_clarification=True,
        has_errors=True
    )
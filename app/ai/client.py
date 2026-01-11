from __future__ import annotations

from openai import OpenAI

from app.core.config import get_settings


def get_openai_client() -> OpenAI:
    settings = get_settings()
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not set. Create a .env file and set OPENAI_API_KEY.")
    return OpenAI(api_key=settings.openai_api_key)


def create_oracle_assistant(client: OpenAI, instructions: str, model: str = "gpt-4o-mini") -> str:
    """Create an assistant with oracle instructions for prompt caching."""
    assistant = client.beta.assistants.create(
        name="LoreKeeper Story Oracle",
        description="Answers questions about fiction projects using cached oracle instructions",
        instructions=instructions,
        model=model,
        temperature=0.2,
    )
    return assistant.id


def update_oracle_assistant(client: OpenAI, assistant_id: str, instructions: str) -> None:
    """Update an existing assistant's instructions."""
    client.beta.assistants.update(
        assistant_id=assistant_id,
        instructions=instructions,
    )


def delete_oracle_assistant(client: OpenAI, assistant_id: str) -> None:
    """Delete an assistant."""
    client.beta.assistants.delete(assistant_id)


def create_thread(client: OpenAI) -> str:
    """Create a new conversation thread."""
    thread = client.beta.threads.create()
    return thread.id


def add_message_to_thread(client: OpenAI, thread_id: str, content: str, role: str = "user") -> str:
    """Add a message to a thread."""
    message = client.beta.threads.messages.create(
        thread_id=thread_id,
        role=role,
        content=content,
    )
    return message.id


def run_assistant(client: OpenAI, thread_id: str, assistant_id: str) -> str:
    """Run the assistant on a thread and return the response."""
    run = client.beta.threads.runs.create(
        thread_id=thread_id,
        assistant_id=assistant_id,
    )

    # Wait for completion
    while run.status != "completed":
        if run.status == "failed":
            raise RuntimeError(f"Assistant run failed: {run.last_error}")
        run = client.beta.threads.runs.retrieve(thread_id=thread_id, run_id=run.id)

    # Get the latest message from the assistant
    messages = client.beta.threads.messages.list(thread_id=thread_id, limit=1)
    if messages.data:
        return messages.data[0].content[0].text.value
    return ""



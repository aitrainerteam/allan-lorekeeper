# LoreKeeper (local-first)

LoreKeeper is a local-first desktop-style web app for fiction writers to organize:
- Characters, Concepts, Acts (the Codex)
- Timeline Events + AI “Synthesize & Align”
- Plot Holes / Unsolved Problems
- Story Oracle chat (RAG-lite over your local SQLite DB)

## Setup

Create a virtualenv, then:

```bash
pip install -r requirements.txt
```

## Environment (.env)

This repo includes `env.example`. Copy it to `.env` and set your key:

```bash
cp env.example .env
```

Then edit `.env`:

```bash
OPENAI_API_KEY=your_key_here
```

## Run (dev)

```bash
uvicorn app.main:app --reload --port 8000
```

On first run, the app will create a local SQLite DB file: `lorekeeper.db` in the project root.


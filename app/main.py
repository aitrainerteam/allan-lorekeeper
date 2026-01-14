from __future__ import annotations

from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles

from app.core.config import get_settings
from app.core.db import init_db
from app.web.routes.bible import router as bible_router
from app.web.routes.chat import router as chat_router
from app.web.routes.codex import router as codex_router
from app.web.routes.map import router as map_router
from app.web.routes.mentions import router as mentions_router
from app.web.routes.problems import router as problems_router
from app.web.routes.timeline import router as timeline_router


settings = get_settings()
templates = Jinja2Templates(directory=str(Path(__file__).parent / "web" / "templates"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    yield
    # Shutdown (if needed)


app = FastAPI(title="LoreKeeper", version="0.1.0", lifespan=lifespan)

# Serve static files from map/dist directory
map_dist_path = Path(__file__).parent.parent / "map" / "dist"
if map_dist_path.exists():
    app.mount("/map-assets", StaticFiles(directory=str(map_dist_path)), name="map-assets")

app.include_router(bible_router)
app.include_router(codex_router)
app.include_router(timeline_router)
app.include_router(problems_router)
app.include_router(chat_router)
app.include_router(mentions_router)
app.include_router(map_router)


@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse(
        "home.html",
        {"request": request, "title": "LoreKeeper", "db_path": str(settings.sqlite_path)},
    )


@app.get("/codex", response_class=HTMLResponse)
def codex(request: Request):
    return RedirectResponse(url="/codex/characters", status_code=302)


@app.get("/timeline", response_class=HTMLResponse)
def timeline(request: Request):
    return RedirectResponse(url="/timeline/events", status_code=302)


@app.get("/problems", response_class=HTMLResponse)
def problems(request: Request):
    return RedirectResponse(url="/problems/holes", status_code=302)


@app.get("/chat", response_class=HTMLResponse)
def chat(request: Request):
    return RedirectResponse(url="/chat/oracle", status_code=302)



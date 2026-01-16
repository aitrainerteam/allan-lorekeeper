import os
import requests
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pathlib import Path

router = APIRouter()
templates = Jinja2Templates(directory=str(Path(__file__).parent.parent / "templates"))


@router.get("/map", response_class=HTMLResponse)
def map_page(request: Request):
    # Check if Vite dev server is running (development mode)
    vite_ports = [5137, 5138, 5139, 5140, 5173]  # Common vite ports
    vite_dev_url = None
    is_development = False

    for port in vite_ports:
        try:
            # Quick check if vite dev server is responding
            response = requests.get(f"http://localhost:{port}/", timeout=1)
            if response.status_code == 200:
                vite_dev_url = f"http://localhost:{port}"
                is_development = True
                break
        except (requests.RequestException, requests.Timeout):
            continue

    if is_development:
        # Use Vite dev server assets
        map_js = f"{vite_dev_url}/app/main.tsx"
        map_css = ""  # Vite handles CSS injection automatically in dev mode
    else:
        # Use built assets from dist
        map_dist_path = Path(__file__).parent.parent.parent.parent / "map" / "dist" / "assets"
        map_js = ""
        map_css = ""

        if map_dist_path.exists():
            files = sorted(list(map_dist_path.glob("index-*.js")), key=lambda p: p.stat().st_mtime, reverse=True)
            if files:
                map_js = f"/map-assets/assets/{files[0].name}"

            files = sorted(list(map_dist_path.glob("index-*.css")), key=lambda p: p.stat().st_mtime, reverse=True)
            if files:
                map_css = f"/map-assets/assets/{files[0].name}"

    return templates.TemplateResponse(
        "map.html",
        {
            "request": request,
            "title": "World Map - LoreKeeper",
            "map_js": map_js,
            "map_css": map_css,
            "is_development": is_development,
            "vite_dev_url": vite_dev_url
        },
    )

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pathlib import Path

router = APIRouter()
templates = Jinja2Templates(directory=str(Path(__file__).parent.parent / "templates"))


@router.get("/map", response_class=HTMLResponse)
def map_page(request: Request):
    # Dynamically find the latest assets in map/dist/assets
    map_dist_path = Path(__file__).parent.parent.parent.parent / "map" / "dist" / "assets"
    map_js = ""
    map_css = ""
    
    if map_dist_path.exists():
        files = sorted(list(map_dist_path.glob("index-*.js")), key=lambda p: p.stat().st_mtime, reverse=True)
        if files:
            map_js = files[0].name
            
        files = sorted(list(map_dist_path.glob("index-*.css")), key=lambda p: p.stat().st_mtime, reverse=True)
        if files:
            map_css = files[0].name

    return templates.TemplateResponse(
        "map.html",
        {
            "request": request, 
            "title": "World Map - LoreKeeper",
            "map_js": map_js,
            "map_css": map_css
        },
    )

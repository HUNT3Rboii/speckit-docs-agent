import logging
import shutil
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router
from app.api.agent_routes import router as agent_router
from app.api.config_routes import router as config_router
from app.api.process_routes import router as process_router

logger = logging.getLogger(__name__)


def _check_agentic_pipeline_dependencies() -> None:
    """
    Log whether mmdc (local, privacy-preserving diagram rendering) and
    WeasyPrint (PDF rendering) are available, per task 20.3. Neither check is
    fatal: DiagramRenderingService falls back to Kroki if mmdc is missing,
    and PDFGeneratorService falls back to raw HTML if WeasyPrint fails.
    """
    if shutil.which("mmdc") is None:
        logger.warning(
            "mmdc (Mermaid CLI) not found on PATH - diagrams will render via the "
            "Kroki fallback API (sends diagram content to a third-party service) "
            "instead of locally. Install with: npm install -g @mermaid-js/mermaid-cli"
        )
    else:
        logger.info("mmdc detected - diagrams will render locally.")

    try:
        import weasyprint  # noqa: F401
        logger.info("WeasyPrint available - PDFs will render via HTML/CSS.")
    except Exception as exc:  # pragma: no cover - environment-dependent
        logger.warning(
            "WeasyPrint is not available (%s) - PDF generation will fall back "
            "to raw HTML output.",
            exc,
        )


@asynccontextmanager
async def lifespan(_: FastAPI):
    _check_agentic_pipeline_dependencies()
    yield


app = FastAPI(title="Documentation Agent Backend", lifespan=lifespan)

# Configure CORS to allow frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(agent_router)
app.include_router(config_router)
app.include_router(process_router)

@app.get("/health")
def health_check():
    """Health check endpoint for monitoring and extension connectivity."""
    return {"status": "ok", "service": "speckit-backend"}

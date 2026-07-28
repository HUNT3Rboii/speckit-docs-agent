from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router
from app.api.agent_routes import router as agent_router
from app.api.config_routes import router as config_router

app = FastAPI(title="Documentation Agent Backend")

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

@app.get("/health")
def health_check():
    """Health check endpoint for monitoring and extension connectivity."""
    return {"status": "ok", "service": "speckit-backend"}

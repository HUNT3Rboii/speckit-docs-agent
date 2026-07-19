from fastapi import FastAPI
from app.api.routes import router
from app.api.agent_routes import router as agent_router
from app.api.config_routes import router as config_router

app = FastAPI(title="Documentation Agent Backend")
app.include_router(router)
app.include_router(agent_router)
app.include_router(config_router)

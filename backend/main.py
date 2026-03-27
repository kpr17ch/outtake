from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers import chat, engine, files, render, sessions, settings, upload, workspace


app = FastAPI(title="Outtake Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router)
app.include_router(sessions.router)
app.include_router(upload.router)
app.include_router(workspace.router)
app.include_router(files.router)
app.include_router(settings.router)
app.include_router(engine.router)
app.include_router(render.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

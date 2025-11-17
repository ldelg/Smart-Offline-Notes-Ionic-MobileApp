import asyncio
import os
import uuid
from pathlib import Path
from typing import Dict, List

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

try:
    import whisper
except ImportError as exc:
    raise RuntimeError(
        "The `whisper` package is required. Install it with `pip install openai-whisper`."
    ) from exc


WHISPER_MODEL_NAME = os.getenv("WHISPER_MODEL_NAME", "base")
MODEL_DIR = Path(__file__).parent / "model"
ALLOWED_MIME_TYPES = {
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/webm",
    "audio/ogg",
    "video/mp4",
    "video/webm",
}

app = FastAPI(title="Speech-to-Notes API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("FRONTEND_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_model() -> "whisper.Whisper":
    """Load Whisper model once on startup."""
    try:
        return whisper.load_model(
            WHISPER_MODEL_NAME,
            download_root=str(MODEL_DIR),
        )
    except Exception as exc:  # pragma: no cover - startup errors should surface once
        raise RuntimeError(f"Failed to load Whisper model: {exc}") from exc


model = load_model()


async def _transcribe_file(temp_path: str) -> Dict:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None,
        lambda: model.transcribe(
            temp_path,
            fp16=False,  # Keeps CPU-only deployments from crashing
            verbose=False,
        ),
    )


def _serialize_segments(segments: List[Dict]) -> List[Dict]:
    serialized = []
    for segment in segments or []:
        serialized.append(
            {
                "id": segment.get("id"),
                "start": segment.get("start"),
                "end": segment.get("end"),
                "text": segment.get("text", "").strip(),
                "tokens": segment.get("tokens"),
                "temperature": segment.get("temperature"),
                "avg_logprob": segment.get("avg_logprob"),
                "compression_ratio": segment.get("compression_ratio"),
                "no_speech_prob": segment.get("no_speech_prob"),
            }
        )
    return serialized


@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """
    Receives a recorded blob or uploaded audio file (wav/mp3/mp4/etc.),
    runs Whisper transcription, and returns structured JSON.
    """
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported media type: {file.content_type}",
        )

    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Empty audio payload.")

    suffix = Path(file.filename or "").suffix or ".tmp"
    temp_dir = Path(os.getenv("TRANSIENT_DIR", Path.cwd() / "tmp"))
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_path = temp_dir / f"{uuid.uuid4().hex}{suffix}"

    try:
        temp_path.write_bytes(payload)
        result = await _transcribe_file(str(temp_path))
    finally:
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)

    response = {
        "text": result.get("text", "").strip(),
        "language": result.get("language"),
        "duration": result.get("duration"),
        "segments": _serialize_segments(result.get("segments")),
    }
    return JSONResponse(content=response)


@app.get("/")
def root():
    return {"message": "Speech-to-Notes backend ready."}
StopAsyncIteration
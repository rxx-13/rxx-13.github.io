# ════════════════════════════════════════════════════════
# server.py — Scriptorium OCR Backend
# FastAPI + Groq API (llama-3.2-11b-vision-preview)
# Требует: GROQ_API_KEY в переменных окружения
# Запуск: GROQ_API_KEY=gsk_xxx python server.py
# ════════════════════════════════════════════════════════

import base64
import io
import os

import httpx
from PIL import Image
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
MODEL = os.environ.get("OCR_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")
API_URL = "https://api.groq.com/openai/v1/chat/completions"


class PredictRequest(BaseModel):
    image: str
    context: str = ""


def recognize(image_b64: str, context: str = "") -> dict:
    if ',' in image_b64:
        image_b64 = image_b64.split(',')[1]

    image_bytes = base64.b64decode(image_b64)
    Image.open(io.BytesIO(image_bytes)).convert('RGB')

    prompt = (
        "Перепиши весь текст на изображении точно как написано. "
        "Выведи только текст, без пояснений и комментариев."
    )
    if context.strip():
        prompt = f"Контекст документа: {context.strip()}\n\n" + prompt

    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{image_b64}"
                        },
                    },
                    {
                        "type": "text",
                        "text": prompt,
                    },
                ],
            }
        ],
        "max_tokens": 1024,
    }

    response = httpx.post(
        API_URL,
        headers={
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=60.0,
    )

    if not response.is_success:
        raise HTTPException(status_code=502, detail=response.text)

    result_text = response.json()["choices"][0]["message"]["content"]
    return {"corrected": result_text.strip()}


@app.post("/predict")
async def predict(req: PredictRequest):
    if not req.image:
        raise HTTPException(status_code=400, detail="Поле image отсутствует")
    return recognize(req.image, req.context)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)

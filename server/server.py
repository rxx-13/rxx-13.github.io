# ════════════════════════════════════════════════════════
# server.py — Scriptorium OCR Backend
# FastAPI-сервер, вызывает HuggingFace Inference API
# Требует: HF_TOKEN в переменных окружения
# Запуск: HF_TOKEN=hf_xxx python server.py
# ════════════════════════════════════════════════════════

import base64
import io
import os

from PIL import Image
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from huggingface_hub import InferenceClient

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

HF_TOKEN = os.environ.get("HF_TOKEN", "")
PROVIDER = os.environ.get("HF_PROVIDER", "nebius")

client = InferenceClient(
    provider=PROVIDER,
    api_key=HF_TOKEN,
)


class PredictRequest(BaseModel):
    image: str


# ── ФУНКЦИЯ РАСПОЗНАВАНИЯ ─────────────────────────────
def recognize(image_b64: str) -> dict:
    # Убираем префикс data:image/...;base64,
    if ',' in image_b64:
        image_b64 = image_b64.split(',')[1]

    # Проверяем, что base64 декодируется в корректное изображение
    image_bytes = base64.b64decode(image_b64)
    Image.open(io.BytesIO(image_bytes)).convert('RGB')

    response = client.chat_completion(
        model="Qwen/Qwen2.5-VL-3B-Instruct",
        messages=[
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
                        "text": (
                            "Перепиши весь рукописный текст на изображении точно как написано. "
                            "Выведи только текст, без пояснений и комментариев."
                        ),
                    },
                ],
            }
        ],
        max_tokens=1024,
    )

    result_text = response.choices[0].message.content
    return {"corrected": result_text.strip()}


# ── ЭНДПОИНТЫ ─────────────────────────────────────────
@app.post("/predict")
async def predict(req: PredictRequest):
    if not req.image:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Поле image отсутствует")
    return recognize(req.image)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)

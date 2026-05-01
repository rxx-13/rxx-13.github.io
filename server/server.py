# ════════════════════════════════════════════════════════
# server.py — Scriptorium OCR Backend
# FastAPI + Groq API + Google Gemini REST API (via httpx)
# Обязательно: GROQ_API_KEY
# Опционально: GEMINI_API_KEY (для gemini-2.0-flash)
# Запуск: GROQ_API_KEY=gsk_xxx python server.py
# ════════════════════════════════════════════════════════

import base64
import io
import math
import os
import re

import httpx
from PIL import Image, ImageEnhance, ImageOps
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

GROQ_API_KEY  = os.environ.get("GROQ_API_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

MODELS = [
    {
        "id": "groq-scout",
        "label": "Llama 4 Scout (быстро)",
        "provider": "groq",
        "model": "meta-llama/llama-4-scout-17b-16e-instruct",
        "description": "Быстрая модель Groq, хороша для чистых сканов",
    },
    {
        "id": "gemini-flash",
        "label": "Gemini 2.0 Flash (рукописи)",
        "provider": "gemini",
        "model": "gemini-2.0-flash",
        "description": "Google Gemini, высокая точность на исторических рукописях",
    },
]

SYSTEM_PROMPT = """Ты — OCR-движок для рукописных документов. Твоя единственная задача — точно переписать рукописный текст с изображения в обычный plain text.

СТРОГИЕ ПРАВИЛА ВЫВОДА:
1. Выводи ТОЛЬКО распознанный текст. Никаких преамбул («Текст с изображения:», «Вот текст:» и т.п.).
2. НИКАКОГО Markdown: запрещены **жирный**, *курсив*, ## заголовки, --- разделители, > цитаты, ``` блоки.
3. НИКАКОГО LaTeX: числа пиши как 1891, а не $1891$. Математику пиши как cos²d+sin²d=1, а не $\\cos d$. Многоточие пиши как «...», а не $[\\ldots]$.
4. Списки пиши с тем же маркером, что в оригинале (• или —), не заменяй на * или -.
5. Сохраняй исходные переносы строк документа: каждая строка рукописи = отдельная строка вывода с \\n.
6. Сохраняй оригинальную орфографию (включая дореформенную: ѣ, і, ъ в конце слов, ѳ).
7. Если фрагмент нечитаем — поставь [?]. НЕ ПРИДУМЫВАЙ слова, которых не видишь.
8. НЕ дублируй строки. Каждая строка оригинала появляется в выводе ровно один раз.

Если в запросе пользователя есть КОНТЕКСТ документа (период, тема, автор) — используй его только как подсказку для разрешения неоднозначностей, но не цитируй и не упоминай в ответе."""


class PredictRequest(BaseModel):
    image: str
    context: str = ""
    model_id: str = "groq-scout"


# ── Препроцессинг изображения ──────────────────────────

def _looks_yellow(img: Image.Image) -> bool:
    small = img.resize((32, 32)).convert("RGB")
    pixels = list(small.getdata())
    r = sum(p[0] for p in pixels) / len(pixels)
    g = sum(p[1] for p in pixels) / len(pixels)
    b = sum(p[2] for p in pixels) / len(pixels)
    return (r + g) > b * 2.6


def _preprocess(img: Image.Image) -> Image.Image:
    if max(img.size) > 2048:
        img.thumbnail((2048, 2048), Image.LANCZOS)
    if _looks_yellow(img):
        img = ImageOps.autocontrast(img, cutoff=2)
        img = ImageEnhance.Color(img).enhance(0.3)
    return img


# ── Пост-обработка текста ─────────────────────────────

def _sanitize_output(text: str) -> str:
    text = re.sub(r"^\s*#{1,6}\s+.*?:\s*\n", "", text, flags=re.MULTILINE)
    text = re.sub(r"^(Текст|Вот|Содержимое)[^:\n]{0,40}:\s*\n", "", text, flags=re.IGNORECASE | re.MULTILINE)
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"(?<!\w)\*(.+?)\*(?!\w)", r"\1", text)
    text = re.sub(r"(?<!\w)_(.+?)_(?!\w)", r"\1", text)
    text = re.sub(r"\$\s*([0-9]+(?:[.,][0-9]+)?)\s*\$", r"\1", text)
    text = re.sub(r"\$\\ldots\$|\$\[\\ldots\]\$", "...", text)
    text = re.sub(r"\$\\ast\$", "*", text)
    text = re.sub(r"\$\\neq\$", "≠", text)
    text = re.sub(r"^\s*[*\-]\s+", "• ", text, flags=re.MULTILINE)
    lines = text.split("\n")
    deduped = []
    for line in lines:
        if not deduped or deduped[-1].strip() != line.strip() or not line.strip():
            deduped.append(line)
    return "\n".join(deduped).strip()


# ── Logprobs → слова с confidence ─────────────────────

def _tokens_to_words(logprobs_content: list) -> list:
    """Преобразует токены с logprob в список слов с confidence."""
    words = []
    chars: list[str] = []
    confs: list[int] = []

    def flush(line_break: bool = False) -> None:
        text = "".join(chars).strip()
        # Снять word-level markdown если остался
        text = re.sub(r"^\*\*(.+)\*\*$", r"\1", text)
        text = re.sub(r"^\*(.+)\*$", r"\1", text)
        text = re.sub(r"^\$(\d+(?:[.,]\d+)?)\$$", r"\1", text)
        if text:
            words.append({
                "word": text,
                "confidence": min(confs) if confs else 80,
                "lineBreak": line_break,
            })
        chars.clear()
        confs.clear()

    for item in logprobs_content:
        token = item.get("token", "")
        logprob = item.get("logprob", -0.5)
        conf = max(1, min(99, round(math.exp(logprob) * 100)))

        for ch in token:
            if ch == "\n":
                flush(line_break=True)
            elif ch == " ":
                if chars:
                    flush(line_break=False)
            else:
                chars.append(ch)
                confs.append(conf)

    if chars:
        flush(line_break=False)

    return [w for w in words if w["word"]]


# ── Провайдеры ────────────────────────────────────────

def _call_groq(image_b64: str, context: str, model_name: str) -> dict:
    user_text = "Перепиши текст с изображения."
    if context.strip():
        user_text = f"КОНТЕКСТ: {context.strip()}\n\n{user_text}"

    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}},
                    {"type": "text", "text": user_text},
                ],
            },
        ],
        "max_tokens": 2048,
    }

    resp = httpx.post(
        GROQ_URL,
        headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
        json=payload,
        timeout=90.0,
    )
    if not resp.is_success:
        raise HTTPException(status_code=502, detail=resp.text)

    data = resp.json()
    text = data["choices"][0]["message"]["content"].strip()
    text = _sanitize_output(text)

    words = None
    try:
        lp = data["choices"][0].get("logprobs") or {}
        content = lp.get("content") or []
        if content:
            words = _tokens_to_words(content)
    except Exception:
        pass

    return {"corrected": text, "words": words}


def _call_gemini(image_b64: str, context: str) -> dict:
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY не задан в переменных окружения HuggingFace Space")

    user_text = "Перепиши текст с изображения."
    if context.strip():
        user_text = f"КОНТЕКСТ: {context.strip()}\n\n{user_text}"

    payload = {
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"inline_data": {"mime_type": "image/jpeg", "data": image_b64}},
                    {"text": user_text},
                ],
            }
        ],
        "generationConfig": {"maxOutputTokens": 2048},
    }

    resp = httpx.post(
        GEMINI_URL,
        params={"key": GEMINI_API_KEY},
        json=payload,
        timeout=90.0,
    )
    if not resp.is_success:
        raise HTTPException(status_code=502, detail=resp.text)

    data = resp.json()
    text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
    text = _sanitize_output(text)

    return {"corrected": text, "words": None}


# ── Роутинг по модели ─────────────────────────────────

def recognize(image_b64: str, context: str, model_id: str) -> dict:
    if "," in image_b64:
        image_b64 = image_b64.split(",")[1]

    image_bytes = base64.b64decode(image_b64)
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img = _preprocess(img)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=92)
    image_b64 = base64.b64encode(buf.getvalue()).decode()

    model_info = next((m for m in MODELS if m["id"] == model_id), MODELS[0])

    if model_info["provider"] == "groq":
        return _call_groq(image_b64, context, model_info["model"])
    elif model_info["provider"] == "gemini":
        return _call_gemini(image_b64, context)
    else:
        raise HTTPException(status_code=400, detail=f"Неизвестный провайдер: {model_info['provider']}")


# ── Эндпоинты ─────────────────────────────────────────

@app.post("/predict")
async def predict(req: PredictRequest):
    if not req.image:
        raise HTTPException(status_code=400, detail="Поле image отсутствует")
    return recognize(req.image, req.context, req.model_id)


@app.get("/models")
async def get_models():
    return [
        {
            "id": m["id"],
            "label": m["label"],
            "provider": m["provider"],
            "description": m["description"],
            "available": (
                bool(GROQ_API_KEY) if m["provider"] == "groq"
                else bool(GEMINI_API_KEY) if m["provider"] == "gemini"
                else False
            ),
        }
        for m in MODELS
    ]


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)

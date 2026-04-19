# Статус проекта Scriptorium

## Архитектура (текущая)

```
браузер (GitHub Pages: rxx-13.github.io)
    ↕ POST /predict  { image: "base64..." }
HuggingFace Space (dmitry-402859/space)
    FastAPI + httpx  [server/server.py]
    ↕ POST /chat/completions
Groq API (api.groq.com)
    llama-4-scout-17b (vision модель)
```

## Файлы

| Файл | Назначение |
|------|-----------|
| `server/server.py` | FastAPI-сервер, вызывает Groq API |
| `server/requirements.txt` | fastapi, uvicorn, httpx, Pillow |
| `server/Dockerfile` | Docker-образ для HF Space |
| `js/api.js` | Фронтенд, SPACE_URL = dmitry-402859-space.hf.space |

## Секреты в HF Space

| Имя | Значение |
|-----|---------|
| `GROQ_API_KEY` | ключ с console.groq.com (gsk_...) |

## Текущая проблема и решение

**Ошибка:** `llama-3.2-11b-vision-preview has been decommissioned`

**Причина:** Groq вывел эту модель из эксплуатации.

**Решение:** В Space → Files → `server.py` → Edit → изменить строку 27:
```python
MODEL = os.environ.get("OCR_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")
```
Commit → Space перезапустится → тестировать.

## История попыток с провайдерами (для понимания контекста)

Пробовали HuggingFace Inference Router с провайдерами:
- `together` — не поддерживает vision модели
- `fireworks-ai` — несовместимые ID моделей через роутер
- `groq` (через HF) — не поддерживает vision через HF роутер
- `novita` — не поддерживает vision
- `router.huggingface.co/v1` без провайдера — только текстовые модели

**Итог:** отказались от HF роутера, используем Groq API напрямую.

## Что работает

- HF Space запущен, /health отвечает {"status":"ok"}
- SPACE_URL в js/api.js указывает на правильный адрес
- Groq API ключ добавлен в секреты Space
- Сервер принимает запросы и отвечает (502 из-за модели, не из-за сети)

## Следующий шаг

Обновить строку 27 в `server.py` в Space (см. выше) — и система должна заработать.

# Текущая проблема: GEMINI_API_KEY не читается на HuggingFace Space

## Статус
🔴 Не решено. Gemini 2.0 Flash показывается в списке как "(нет ключа)" и недоступна.

## Что сделано

### Инфраструктура
- Бэкенд: FastAPI на HuggingFace Space `dmitry-402859-space.hf.space`
- Автодеплой настроен: GitHub Actions (`.github/workflows/deploy-hf.yml`) копирует `server/server.py` → HF Space при push в master
- Space использует кастомный **Dockerfile** (не стандартный Gradio/Streamlit)

### Что добавляли для Gemini
1. В `server/server.py` добавили модель `gemini-flash` и функцию `_call_gemini()`
2. Секрет `GEMINI_API_KEY` добавлен в HF Space → Settings → Variables and secrets (видно в UI, "Updated X minutes ago")
3. Пробовали: Restart Space, Factory rebuild — не помогло
4. Изменили чтение ключа с модульного уровня на динамическую функцию:
   ```python
   def _get_gemini_key() -> str:
       return os.environ.get("GEMINI_API_KEY", "")
   ```
5. Добавлен диагностический эндпоинт `GET /debug-env` — **ещё не проверяли результат**

### Текущий server.py на HF Space
Проверено — файл актуальный (с `_get_gemini_key`). Код правильный.

### Текущий Dockerfile на HF Space
```dockerfile
FROM python:3.9
RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH"
WORKDIR /app
COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --upgrade -r requirements.txt
COPY --chown=user server.py .
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "7860"]
```

Dockerfile чистый — нет ENV/ARG для GEMINI_API_KEY, которые могли бы затереть секрет.

## Диагностика

### Эндпоинт `/models` возвращает:
```json
[
  {"id": "groq-scout", "available": true},
  {"id": "gemini-flash", "available": false}
]
```

### Документация HF
Секреты в Docker Spaces должны быть доступны через `os.environ` автоматически. Никаких дополнительных объявлений в README не нужно.

### Следующий шаг (НЕ ВЫПОЛНЕН)
Проверить диагностический эндпоинт после деплоя:
```
https://dmitry-402859-space.hf.space/debug-env
```
Он вернёт `has_gemini: true/false` и список названий env-переменных с KEY/TOKEN/SECRET в имени.

## Гипотезы

1. **HF не передаёт секреты в Docker-контейнер** при текущей конфигурации Dockerfile
2. **Секрет сохранился с пустым значением** — UI показывает что он есть, но значение пустое
3. **Нужна переменная (Variable), а не секрет (Secret)** — Variables точно передаются как build ARG, поведение Secrets в Docker Spaces отличается

## Возможные решения (проверить по порядку)

### Решение A — проверить debug-env
После деплоя последнего коммита открыть `/debug-env`. Если `has_gemini: false` — секрет не передаётся в контейнер.

### Решение B — пересоздать секрет
Удалить `GEMINI_API_KEY` в HF Space Secrets → создать заново → Restart Space.

### Решение C — добавить как Variable (не Secret)
HF Space → Settings → **New variable** (не secret) → `GEMINI_API_KEY` = ключ.
Variable публична в метаданных репозитория, но для тестирования подойдёт.
Если Variable работает — проблема именно в механизме Secrets для Docker Spaces.

### Решение D — читать из файла Docker secret
HF Docker Spaces иногда монтируют секреты как файлы вместо env vars:
```python
def _get_gemini_key() -> str:
    key = os.environ.get("GEMINI_API_KEY", "")
    if key:
        return key
    try:
        with open("/run/secrets/GEMINI_API_KEY") as f:
            return f.read().strip()
    except OSError:
        pass
    return ""
```

### Решение E — спросить сообщество HF
Создать issue/тему на discuss.huggingface.co: "Docker Space secret not available via os.environ after factory rebuild"

## Файлы проекта

| Файл | Описание |
|------|----------|
| `server/server.py` | Бэкенд FastAPI, функция `_get_gemini_key()` |
| `.github/workflows/deploy-hf.yml` | Автодеплой на HF Space |
| `js/api.js` | Фронтенд, `loadAvailableModels()` заполняет dropdown |
| `CONTEXT.md` | Полный технический контекст проекта |

# Scriptorium — Расшифровка рукописных документов

Веб-приложение для автоматической расшифровки рукописных текстов с помощью мультимодальных языковых моделей.

## О проекте

Scriptorium создан в рамках проекта «Цифровая кафедра». Основная задача — упростить работу историков, архивистов и исследователей с рукописными документами: письмами, дневниками, архивными материалами.

Пользователь загружает изображение или PDF, выбирает OCR-модель, нажимает «Распознать» — модель переводит рукопись в редактируемый текст. Результат можно поправить прямо в браузере и экспортировать в Word, PDF или TXT.

## Возможности

- Загрузка изображений (JPG, PNG, TIFF) и многостраничных PDF
- Выбор OCR-модели из трёх вариантов (Groq Scout / Groq Maverick / Gemini Flash)
- Редактор с цветовой разметкой источника каждого слова (OCR / база почерков / сокращения)
- Реальный confidence per-word через logprobs (Groq) — честная подсветка сомнительных слов
- Серверная санация: убирает LaTeX-обёртки (`$1891$`→`1891`), Markdown-разметку, дубликаты строк
- Настройка порога уверенности, яркости и контраста
- Крупный предпросмотр выбранного файла + сетка миниатюр
- Экспорт в DOCX, PDF, TXT
- Drag & Drop загрузка файлов

## Архитектура

```
браузер (статика на GitHub Pages)
    ↕ HTTPS
FastAPI-сервер (HuggingFace Space: dmitry-402859-space.hf.space)
    ├── Groq API  (llama-4-scout / llama-4-maverick)
    └── Gemini API (gemini-2.0-flash)
```

**Фронтенд** — чистый HTML/CSS/JS без фреймворков, хостится на GitHub Pages.

**Бэкенд** — FastAPI-сервер (`server/server.py`), задеплоен на HuggingFace Space.

## Доступные модели

| ID | Название | Провайдер | Когда использовать |
|----|----------|-----------|--------------------|
| `groq-scout` | Llama 4 Scout | Groq | Быстрое распознавание чистых сканов |
| `groq-maverick` | Llama 4 Maverick | Groq | Качественный результат, сложные рукописи |
| `gemini-flash` | Gemini 2.0 Flash | Google | Исторические рукописи, кириллица |

## Структура файлов

```
scriptorium/
├── index.html          ← SPA: landing, auth, dashboard, editor, profile
├── 404.html            ← редирект для SPA-маршрутизации
├── css/style.css       ← все стили
├── js/
│   ├── api.js          ← подключение к OCR-серверу, loadAvailableModels
│   ├── auth.js         ← авторизация и навигация
│   ├── dashboard.js    ← загрузка файлов, превью, экспорт
│   ├── editor.js       ← OCR-конвейер, рендер слов, grip-resize
│   └── router.js       ← URL-маршрутизация (History API)
└── server/
    ├── server.py       ← FastAPI + Groq/Gemini routing
    └── requirements.txt
```

## Запуск

### 1. Бэкенд локально

```bash
cd server
pip install -r requirements.txt
GROQ_API_KEY=gsk_xxx python server.py
# Опционально: GEMINI_API_KEY=AIza_xxx
```

Сервер запустится на `http://localhost:7860`.

### 2. Фронтенд

```js
// js/api.js, строка 5:
var SPACE_URL = 'http://localhost:7860';
```

### 3. Деплой на HuggingFace Space

1. `git push` — файлы `server/server.py` и `server/requirements.txt`
2. HuggingFace Space → Settings → Variables and secrets → добавить:
   - `GROQ_API_KEY` (обязательно — получить на [console.groq.com](https://console.groq.com))
   - `GEMINI_API_KEY` (опционально — получить на [aistudio.google.com/apikey](https://aistudio.google.com/apikey))
3. Restart Space, проверить: `curl https://dmitry-402859-space.hf.space/health`

## Технологии

| Компонент | Технология |
|-----------|-----------|
| Фронтенд | HTML5, CSS3, Vanilla JS (без фреймворков) |
| OCR-провайдеры | Groq API, Google Gemini API |
| OCR-модели | Llama 4 Scout, Llama 4 Maverick, Gemini 2.0 Flash |
| Сервер | FastAPI + httpx + Pillow |
| Хостинг фронтенда | GitHub Pages |
| Хостинг бэкенда | HuggingFace Space (CPU Basic) |
| PDF-рендеринг | PDF.js v3.11.174 (CDN) |

# Scriptorium — Расшифровка рукописных документов

Веб-приложение для автоматической расшифровки рукописных текстов с помощью нейронной сети Qwen2.5-VL через HuggingFace Inference API.

## О проекте

Scriptorium создан в рамках проекта «Цифровая кафедра». Основная задача — упростить работу историков, архивистов и исследователей с рукописными документами: письмами, дневниками, архивными материалами.

Пользователь загружает изображение или PDF, нажимает «Распознать» — модель переводит рукопись в редактируемый текст. Результат можно поправить прямо в браузере и экспортировать в Word, PDF или TXT.

Приложение имеет публичный лендинг (SaaS-стиль) с описанием инструментов и кнопками входа/регистрации. Визуальный стиль: светлая тема, синий акцент (#2563eb).

## Возможности

- Загрузка изображений (JPG, PNG, TIFF) и многостраничных PDF
- Распознавание текста через модель Qwen2.5-VL-3B (HuggingFace Inference API)
- Редактор с цветовой разметкой источника каждого слова (OCR / база почерков / сокращения)
- Настройка порога уверенности, яркости и контраста документа
- Архив расшифрованных документов
- Экспорт в DOCX, PDF, TXT
- Пакетная обработка нескольких документов
- Публичный лендинг с описанием инструментов
- URL-маршрутизация: `/`, `/login`, `/home`, `/archive`, `/ocr`, `/profile`

## Архитектура

```
браузер (статика на GitHub Pages)
    ↕ HTTPS
FastAPI-сервер (любой хостинг / локально)
    ↕ HuggingFace Inference API
Qwen2.5-VL-3B-Instruct
```

**Фронтенд** — чистый HTML/CSS/JS без фреймворков, хостится на GitHub Pages.

**Бэкенд** — FastAPI-сервер (`server/server.py`). Не выполняет модель локально — делегирует распознавание в HuggingFace Inference API. Можно запустить локально или задеплоить на любой платформе.

## Структура файлов

```
scriptorium/          ← фронтенд (GitHub Pages)
├── index.html        ← 5 экранов: landing, auth, dashboard, editor, profile
├── 404.html          ← редирект для SPA-маршрутизации
├── css/style.css
├── js/
│   ├── api.js        ← подключение к OCR-серверу
│   ├── auth.js       ← авторизация и навигация (goTo, SCREEN_PATHS)
│   ├── dashboard.js  ← загрузка файлов, архив, экспорт
│   ├── editor.js     ← редактор и viewport
│   └── router.js     ← URL-маршрутизация (History API)
└── server/
    ├── server.py         ← FastAPI-сервер, вызывает HuggingFace Inference API
    └── requirements.txt  ← зависимости Python
```

### Маршруты

| URL | Экран |
|-----|-------|
| `/` | Лендинг (публичный) |
| `/login` | Форма входа |
| `/register` | Форма регистрации |
| `/home` | Dashboard — мои документы |
| `/archive` | Dashboard — архив |
| `/export` | Dashboard — история экспорта |
| `/batch` | Dashboard — пакетная обработка |
| `/ocr` | Редактор OCR |
| `/profile` | Профиль пользователя |

### Workflow при изменении логики сервера

```
Правишь server/server.py → git push → перезапускаешь сервер
```

## Запуск

### 1. Бэкенд

1. Получи HuggingFace API-токен на [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) (тип: Read)
2. Установи зависимости и запусти сервер:

```bash
cd server
pip install -r requirements.txt
HF_TOKEN=hf_ваш_токен python server.py
```

Сервер запустится на `http://localhost:7860`.

### 2. Фронтенд

Вставь URL сервера в `js/api.js`, строка 6:

```js
var SPACE_URL = 'http://localhost:7860';
```

Открой сайт на GitHub Pages — готово.

> Для публичного доступа задеплой сервер на HuggingFace Spaces, Render, Railway или любой VPS и вставь постоянный URL.

## Технологии

| Компонент | Технология |
|-----------|-----------|
| Фронтенд | HTML5, CSS3, Vanilla JS (без фреймворков) |
| OCR-модель | [Qwen2.5-VL-3B-Instruct](https://huggingface.co/Qwen/Qwen2.5-VL-3B-Instruct) |
| Сервер | FastAPI + uvicorn |
| OCR API | HuggingFace Inference API |
| Хостинг фронтенда | GitHub Pages |
| Хостинг бэкенда | Любой сервер / локально |

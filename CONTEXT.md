# Scriptorium — Технический контекст проекта

Этот документ описывает архитектурные решения, стек, структуру кода и нюансы реализации. Предназначен для быстрого введения в проект.

---

## 1. Обзор

Scriptorium — SPA для распознавания рукописных документов. Пользователь загружает изображение/PDF, выбирает OCR-модель, получает текст с цветовой разметкой confidence per-word. Результат экспортируется в DOCX/PDF/TXT.

**Hosting:**
- Фронтенд: GitHub Pages (статика, URL `/<path>` через `404.html` редирект)
- Бэкенд: HuggingFace Space `dmitry-402859-space.hf.space` (CPU Basic, 16 GB RAM)

---

## 2. Фронтенд

### Стек
- Vanilla HTML/CSS/JS — без фреймворков, без сборщиков
- PDF.js v3.11.174 через CDN (рендеринг PDF-страниц в canvas)
- Один файл `index.html` — 5 экранов через CSS `display` переключение

### Экраны (в index.html)
| ID | URL | Описание |
|----|-----|----------|
| `screen-landing` | `/` | Публичный лендинг |
| `screen-auth` | `/login`, `/register` | Форма входа/регистрации |
| `screen-dashboard` | `/home`, `/archive`, ... | Dashboard |
| `screen-editor` | `/ocr` | Редактор OCR |
| `screen-profile` | `/profile` | Профиль |

### Файлы JS (порядок подключения важен)
1. `dashboard.js` — глобальное состояние (`uploadedDocs`, `currentDocId`), загрузка файлов, экспорт
2. `api.js` — `loadAvailableModels()`, `callServer()`, `textToWordObjects()`
3. `editor.js` — OCR-пайплайн, рендер слов, ползунки, grip-resize
4. `auth.js` — навигация (`goTo()`), экраны
5. `router.js` — History API, URL ↔ экраны

### Layout `/ocr` (`.workspace`)

```
.ws-left (420px, flex column)
  .ws-left-top    — кнопка загрузки + #engineSelect
  .ws-preview     — крупный preview (240px height), img или canvas
  .ws-files-grid  — grid 4×N, миниатюры 64×64, flex: 1, scroll
  .ws-context     — контекст для ИИ
    .ws-context-grip   — drag handle (6px, cursor: ns-resize) СВЕРХУ
    .ws-context-inner  — label + textarea
      #ocrContext — textarea, resize: none (grip управляет высотой)

.ws-right (flex: 1)
  .ws-right-top   — кнопки Распознать / ⚙ / Экспорт
  .ws-advanced    — ползунки (grid 110px/1fr/50px — без сдвигов)
  .ws-text-panel  — результат: stateEmpty / stateLoading / textContent
```

### Grip resize (editor.js)
Grip тянется вверх → textarea растёт: `newH = startH + (startY - currentY)`. Обратная дельта, потому что grip сверху.

### Confidence и подсветка слов
- Каждое слово — `<span class="tw tw-ocr" data-conf="87">` 
- `conf < confidenceThreshold` → `.conf-low` (жёлтый фон)
- `conf < confidenceThreshold * 0.65` → `.conf-vlow` (красный фон)
- Slider «Порог уверенности» вызывает `updateConfidence(val)` — перерисовывает классы без перезапуска OCR

### Источники слов (source)
| Значение | Цвет | Откуда |
|----------|------|--------|
| `ocr` | белый | прямо из модели |
| `hwdb` | синий | замена из `HW_DB` (editor.js) |
| `abbr` | фиолетовый | расшифровка из `ABBR_DB` (editor.js) |
| `uncertain` | красный | уверенность < 40% |

---

## 3. Бэкенд

### Стек
- Python 3.x, FastAPI + uvicorn
- httpx — для вызовов Groq и Gemini REST API (SDK не нужен)
- Pillow — препроцессинг изображений

### Эндпоинты
| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/health` | Healthcheck (используется HF Space) |
| `GET` | `/models` | Список моделей с флагом `available` |
| `POST` | `/predict` | OCR: `{image, context, model_id}` → `{corrected, words[]}` |

### Модели
| ID | Модель | Провайдер |
|----|--------|-----------|
| `groq-scout` | `meta-llama/llama-4-scout-17b-16e-instruct` | Groq |
| `groq-maverick` | `meta-llama/llama-4-maverick-17b-128e-instruct` | Groq |
| `gemini-flash` | `gemini-2.0-flash` | Google Gemini REST API |

### OCR Pipeline (server.py)
1. **Декодирование** — base64 → PIL Image
2. **Препроцессинг** (`_preprocess`):
   - Ресайз до 2048px если больше
   - Если изображение «жёлтое» (`_looks_yellow`: `(R+G) > B*2.6`) → `autocontrast` + обесцвечивание (`Color(0.3)`)
3. **Ресайз → JPEG** — сохранить обратно в base64 для отправки
4. **Вызов модели** — `_call_groq()` или `_call_gemini()`
5. **Санация** (`_sanitize_output`) — убрать markdown/LaTeX артефакты
6. **Logprobs → words** (`_tokens_to_words`) — только для Groq

### Системный промпт (SYSTEM_PROMPT)
Жёсткий запрет на: преамбулы, Markdown, LaTeX (`$1891$`→`1891`), замену маркеров списков на `*`. Требования: сохранять переносы строк, дореформенную орфографию, ставить `[?]` для нечитаемых фрагментов, не дублировать строки.

### Санация текста (`_sanitize_output`)
Regex-фильтры поверх промпта — страховка на случай нарушений модели:
- Срезает preambula-строки (`## Текст с изображения:`)
- Снимает `**bold**`, `*italic*`, `_italic_`
- Конвертирует `$1891$` → `1891`, `$\ldots$` → `...`
- Заменяет `* bullet` → `• bullet`
- Удаляет соседние дубликаты строк

### Logprobs (только Groq)
Groq возвращает `choices[0].logprobs.content[i].{token, logprob}`. Функция `_tokens_to_words` итерирует по символам каждого токена:
- `\n` → flush текущего слова с `lineBreak=True`
- ` ` → flush текущего слова
- иначе → накапливать символ + `min(confidence)` токена
Confidence: `round(math.exp(logprob) * 100)`, capped [1, 99].

Gemini не поддерживает logprobs → возвращает `words: null` → фронтенд использует fallback (хардкод 80%).

### ENV-переменные (HuggingFace Space Secrets)
| Переменная | Обязательно | Где получить |
|------------|-------------|--------------|
| `GROQ_API_KEY` | Да | [console.groq.com](https://console.groq.com) |
| `GEMINI_API_KEY` | Нет (только для gemini-flash) | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |

---

## 4. Workflow

### Изменение логики OCR
```
Правишь server/server.py
→ git push
→ HuggingFace Space автоматически пересобирается (~2-5 мин)
→ Проверить: curl https://dmitry-402859-space.hf.space/health
```

### Изменение UI
```
Правишь index.html / css/style.css / js/*.js
→ git push
→ GitHub Pages обновляется через ~1 мин
→ Ctrl+Shift+R в браузере (GitHub Pages агрессивно кеширует CSS/JS)
```

### Отладка OCR
F12 → Network → POST `/predict`:
- Request: проверить `model_id`, `context`, длину `image`
- Response: проверить `corrected` (текст), `words` (null или массив)

---

## 5. Известные ограничения

- **Gemini без logprobs** — confidence всегда 80% для слов, распознанных через Gemini
- **Groq logprobs и визуальные токены** — logprobs отражают текстовые токены, для image-токенов logprob недоступен; это норма
- **PDF preview** — использует PDF.js, первая страница; для больших PDF может быть медленно
- **HuggingFace Space cold start** — первый запрос после простоя может занять 30-60 сек
- **Groq rate limits** — free tier: ~30 RPM для vision-моделей; при превышении `/predict` вернёт 502

---

## 6. Что НЕ трогать

- `index.html` — секции landing, auth, dashboard, profile, export modal, toast
- `js/auth.js`, `js/router.js` — навигация работает корректно
- `HW_DB`, `ABBR_DB` в `editor.js` — словари коррекции
- `404.html` — SPA-редирект для GitHub Pages
- `icon.svg`
- CSS-переменные в `:root` и стили лендинга
- `GET /health` на бэкенде

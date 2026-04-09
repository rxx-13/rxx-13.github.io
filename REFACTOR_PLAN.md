# ПРОМПТ-ПЛАН: Рефакторинг Scriptorium в SaaS-стиль

## РЕЗЮМЕ ПРОЕКТА

**Стек:** Чистый HTML + CSS + Vanilla JS (SPA без фреймворков)
**Структура:** Один `index.html` с 4 экранами (`screen-auth`, `screen-dashboard`, `screen-editor`, `screen-profile`), переключаемыми через CSS-класс `.active`. Роутинг — History API (`router.js`).

**Ключевые файлы:**
| Файл | Роль | Строк |
|---|---|---|
| `css/style.css` | ВСЕ стили (обёрнуты в `<style>`), CSS-переменные, адаптив | ~1200 |
| `index.html` | Вся HTML-разметка: auth, dashboard, editor, profile, модалы | ~383 |
| `js/editor.js` | Viewport, OCR-пайплайн, рендер слов, тулбар | ~705 |
| `js/dashboard.js` | Загрузка файлов, архив, экспорт, пакетная обработка | ~567 |
| `js/auth.js` | Формы входа/регистрации, валидация, навигация | ~130 |
| `js/router.js` | URL-маршрутизация, popstate | ~121 |
| `js/api.js` | OCR-запрос к серверу (Colab/ngrok) | ~77 |

**Текущий стиль:** Тёмная «рукописная» тема — тёмно-синий (`#1e2d4a`) навбар, золотые (`#b8860b`) акценты, пергаментный фон (`#f5f0e8`), шрифт Playfair Display (засечки) + DM Sans. Атмосфера — архив старых документов.

**Целевой стиль:** SaaS-инструмент (Notion, Smallpdf, ILovePDF) — светлый холодный фон, фиолетовый акцент, Inter/без засечек, чистые карточки, один CTA, минимализм.

---

## ФАЙЛЫ ДЛЯ ИЗМЕНЕНИЯ

### 1. `css/style.css` — ГЛАВНЫЙ ФАЙЛ (90% визуальных изменений)
- **`:root` переменные** (строки 2–27): заменить всю палитру
- **Шрифты** `body` (строка 34): заменить font-family
- **Auth screen** (строки 55–207): фон, карточка, кнопки, поля
- **Top nav** (строки 209–249): фон, лого, кнопки, аватар
- **Dashboard** (строки 251–416): sidebar, upload-zone, карточки, статистика
- **Editor** (строки 429–768): тулбар, pipeline-bar, legend-bar, панели, viewport
- **Word origins** (строки 793–826): цвета подсветки слов
- **Toast, Stats, Modal** (строки 839–914)
- **Адаптив** (строки 942–1200): обновить цвета в медиазапросах

### 2. `index.html` — HTML-разметка
- **Строка 7**: заменить Google Fonts ссылку (Playfair+DM Sans → Inter)
- **Строки 22–78** (Auth): обновить текст hero, структуру CTA
- **Строки 82–108** (Dashboard sidebar): убрать эмодзи из иконок, заменить на SVG или CSS-иконки
- **Строки 198–221** (Editor toolbar): убрать эмодзи из кнопок
- **Строки 354–371** (Export modal): обновить иконки опций

### 3. JS-файлы — МИНИМАЛЬНЫЕ правки (только inline-стили)
- `js/dashboard.js`: строки, где создаются элементы с `style.cssText` и inline-цветами (ссылки на `var(--gold)`, `var(--navy)` и т.д.)
- `js/editor.js`: inline-стили в динамически создаваемых элементах

---

## ПОШАГОВЫЕ ИНСТРУКЦИИ

### ШАГ 1. Шрифты — `index.html` строка 7

Заменить ссылку Google Fonts:
```
БЫЛО:  Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500
СТАЛО: Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500
```

### ШАГ 2. CSS-переменные — `css/style.css` строки 2–27

Заменить **весь блок `:root`**:
```css
:root {
  --ink: #1a1a2e;
  --ink-light: #4a4a5a;
  --bg: #f8f9fb;
  --bg-dark: #f0f1f5;
  --white: #ffffff;
  --primary: #7c3aed;
  --primary-light: #8b5cf6;
  --primary-pale: #ede9fe;
  --primary-dark: #6d28d9;
  --red: #ef4444;
  --muted: #9ca3af;
  --muted-light: #d1d5db;
  --success: #10b981;
  --success-pale: #d1fae5;
  --warning: #f59e0b;
  --warning-pale: #fef3c7;
  --error: #ef4444;
  --error-pale: #fee2e2;
  --border: #e5e7eb;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
  --shadow-lg: 0 12px 32px rgba(0,0,0,0.12);
  --radius: 8px;
  --radius-lg: 12px;
}
```

### ШАГ 3. Базовые стили — `css/style.css` строки 30–38

```css
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  background: var(--bg);
  color: var(--ink);
}
```

### ШАГ 4. Auth screen — `css/style.css` строки 55–207

Переработать:
- `#screen-auth`: фон с `var(--navy)` (тёмно-синий) → `var(--bg)` (светлый) или мягкий градиент `linear-gradient(135deg, #f8f9fb 0%, #ede9fe 100%)`
- `.auth-bg`: убрать radial-gradient-ы рукописной тематики, заменить на минималистичный паттерн или убрать совсем
- `.auth-logo .logo-word`: `font-family` → `'Inter', sans-serif`, `color` → `var(--ink)`, убрать золотой цвет
- `.auth-logo .logo-sub`: `color` → `var(--muted)`
- `.auth-card`: `background` → `var(--white)`, `border` → `1px solid var(--border)`, `box-shadow` → `var(--shadow-md)`, убрать `backdrop-filter`
- `.auth-tabs`, `.auth-tab`: фон/цвета → серые/фиолетовые (`.auth-tab.active` — `color: var(--primary)`, `border-bottom: 2px solid var(--primary)`)
- `.field input`: `background` → `var(--white)`, `border` → `1px solid var(--border)`, `color` → `var(--ink)`, `:focus border-color` → `var(--primary)`
- `.field label`: `color` → `var(--ink-light)`
- `.auth-btn`: `background` → `var(--primary)`, `color` → `white`, убрать gradient
- `.auth-divider`: линии → `var(--border)`, текст → `var(--muted)`
- `.oauth-btn`: `border` → `1px solid var(--border)`, `color` → `var(--ink)`
- `.field-error`, `.form-error`: оставить красный, но обновить оттенок на `var(--error)`

### ШАГ 5. Top nav — `css/style.css` строки 209–249

- `.topnav`: `background` → `var(--white)`, `border-bottom` → `1px solid var(--border)`
- `.nav-logo`: `font-family` → `'Inter', sans-serif`, `font-weight: 700`, `color` → `var(--ink)`, `font-size: 18px`
- `.nav-btn`: `border` → `1px solid var(--border)`, `color` → `var(--ink-light)`, убрать uppercase, убрать letter-spacing
- `.nav-btn.primary`: `background` → `var(--primary)`, `color` → `white`, `border-color` → `var(--primary)`
- `.nav-btn:hover`: `background` → `var(--bg-dark)`
- `.nav-avatar`: `background` → `var(--primary)`, `color` → `white`

### ШАГ 6. Dashboard — `css/style.css` строки 251–416

- `#screen-dashboard`: `background` → `var(--bg)`
- `.dash-sidebar`: `background` → `var(--white)`, `border-right` → `1px solid var(--border)`
- `.sidebar-item.active`: `background` → `var(--primary-pale)`, `color` → `var(--primary)`
- `.sidebar-item:hover`: `background` → `var(--bg-dark)`
- `.dash-title`: `font-family` → `'Inter', sans-serif`, `font-weight: 700`, `font-size: 26px`
- `.upload-zone`: `background` → `var(--white)`, `border` → `2px dashed var(--border)`, при ховере `border-color` → `var(--primary)`
- `.upload-zone:hover .upload-btn`: `background` → `var(--primary)`, `color` → `white`
- `.upload-btn`: `background` → `var(--primary)`, `color` → `white`
- `.doc-card`: `background` → `var(--white)`, при ховере `border-color` → `var(--primary-light)`
- `.doc-thumb`: `background` → `var(--bg-dark)`
- `.status-ready`, `.status-processing`, `.status-queue`: адаптировать цвета через новые переменные
- `.doc-list-item:hover`: `border-color` → `var(--primary-light)`, `background` → `var(--primary-pale)`
- `.doc-list-action`: `background` → `var(--primary)`, `color` → `white`
- `.progress-fill`: `background` → `linear-gradient(90deg, var(--primary) 0%, var(--primary-light) 100%)`
- `.stat-card.accent`: `background` → `var(--primary)`, `border-color` → `var(--primary)`
- `.stat-card.accent .stat-value`: `color` → `white`
- `.stat-card.accent .stat-label`: `color` → `rgba(255,255,255,0.8)`
- `.stat-value`: `font-family` → `'Inter', sans-serif`, `font-weight: 700`

### ШАГ 7. Editor toolbar + pipeline — `css/style.css` строки 429–516

- `.editor-toolbar`: `background` → `var(--white)`, `border-bottom` → `1px solid var(--border)`
- `.tool-btn.primary`: `background` → `var(--primary)`, `color` → `white`, `border-color` → `var(--primary)`
- `.tool-btn.primary:hover`: `background` → `var(--primary-dark)`
- `.tool-btn:hover`: `border-color` → `var(--primary)`, `color` → `var(--primary)`
- `.confidence-slider::-webkit-slider-thumb`: `border` → `2px solid var(--primary)`
- `.pipeline-bar`: `background` → `var(--ink)` (оставить тёмной — это прогресс-бар)
- `.pipeline-step.active`: `color` → `var(--primary-light)`
- `.pipeline-step.active .ps-dot`: `background` → `var(--primary)`

### ШАГ 8. Editor panels — `css/style.css` строки 541–768

- `.image-panel`: `background` → `#1e1e2e` (тёмный нейтральный, не коричневый `#1a1612`)
- `.image-panel` border-right: `border-right: 2px solid var(--border)` (вместо золотого)
- `.panel-header` (image): оставить тёмным, но убрать тёплые оттенки
- `.panel-tool:hover`: `color` → `var(--primary-light)`, `border-color` → `var(--primary)`
- `.panel-tool.active`: `background` → `rgba(124,58,237,0.28)`, `color` → `var(--primary-light)`, `border-color` → `var(--primary)`
- `#wordHighlight`: `background` → `rgba(124,58,237,0.25)`, `border` → `1.5px solid var(--primary-light)`
- `.page-thumb.active`: `border-color` → `var(--primary-light)`
- `.page-thumb:hover`: `border-color` → `var(--primary)`
- `.img-ctrl-slider::-webkit-slider-thumb`: `background` → `var(--primary-light)`
- `.text-panel .panel-header`: `background` → `var(--bg-dark)`
- `.text-panel .panel-tool:hover`: `background` → `var(--primary-pale)`, `color` → `var(--primary)`

### ШАГ 9. Word origins (текстовая подсветка) — `css/style.css` строки 793–826

Оставить функционально, но сделать чуть мягче:
- `.tw.sel`: `outline: 2px solid var(--primary)`
- `.tw-ocr`, `.tw-hwdb`, `.tw-abbr`, `.tw-uncertain`: оставить без изменений (функциональные цвета)
- `.tw[data-tip]:hover::after`: `background` → `var(--ink)`, `color` → `white`

### ШАГ 10. Toast, Stats, Modal — `css/style.css` строки 839–914

- `.toast`: `background` → `var(--ink)`, `color` → `white`, `border-left: 3px solid var(--primary)`
- `.stat-value`: `font-family` → `'Inter', sans-serif`
- `.modal`: box-shadow и border → через переменные
- `.modal-title`: `font-family` → `'Inter', sans-serif`, `font-weight: 700`
- `.export-option:hover`: `border-color` → `var(--primary)`, `background` → `var(--primary-pale)`
- `.proc-spinner`: `border-top-color` → `var(--primary)`

### ШАГ 11. Адаптивные стили — `css/style.css` строки 942–1200

Пройти по всем `@media` блокам и заменить:
- Все ссылки на `var(--gold)` → `var(--primary)`
- Все ссылки на `var(--navy)` → `var(--primary)` или `var(--ink)` (контекстно)
- Все ссылки на `var(--parchment)` → `var(--white)` или `var(--bg)`
- `.sidebar-item.active` в мобильных: `background` → `var(--primary-pale)`, `border-top` → `3px solid var(--primary)`

### ШАГ 12. HTML-разметка — `index.html`

12a. **Строка 7**: Заменить Google Fonts URL на Inter + JetBrains Mono

12b. **Строки 22–78** (Auth):
- Изменить текст `.logo-sub` с "Расшифровка рукописных документов" → "Умная расшифровка рукописей" (короче, SaaS-стиль)

12c. **Строки 82–108** (Dashboard sidebar): заменить эмодзи-иконки на SVG inline-иконки или оставить (опционально — не критично для MVP, эмодзи допустимы в SaaS-стиле)

12d. **Строка 87** (nav-avatar): `style="cursor:pointer;"` → inline стиль `И` — останется динамически (из JS), не трогать

### ШАГ 13. Inline-стили в JS — `js/dashboard.js`

Найти и заменить все цветовые ссылки в строковых литералах:
- `var(--gold)` → `var(--primary)`
- `var(--navy)` → `var(--primary)`
- `var(--parchment)` → `white`
- `var(--rust)` → `var(--error)`

### ШАГ 14. Inline-стили в JS — `js/editor.js`

- Строка 352: `#d4a842` → `var(--primary)` (selection rectangle stroke color)
- Строка 354: `#d4a842` → `var(--primary)` (selection corner points)

### ШАГ 15. Inline-стили в `index.html`

Пройти по inline `style=""` в HTML и заменить:
- `var(--gold)` → `var(--primary)`
- `var(--navy)` → `var(--primary)`
- `var(--ink-light)`, `var(--muted-light)`, `var(--muted)` — оставить, они перемаппились через CSS-переменные
- Строка 349: `background:#b03a2e` (кнопка "Выйти" в профиле) → `background:var(--error)`

---

## ПОРЯДОК ВЫПОЛНЕНИЯ

```
Шаг 1  → Шрифты (index.html) — нет зависимостей
Шаг 2  → CSS-переменные — ФУНДАМЕНТ, все остальные шаги зависят от него
Шаг 3  → Базовые стили body — зависит от Шага 2
Шаг 4  → Auth screen — зависит от Шагов 2–3
Шаг 5  → Top nav — зависит от Шага 2
Шаг 6  → Dashboard — зависит от Шагов 2, 5
Шаг 7  → Editor toolbar — зависит от Шага 2
Шаг 8  → Editor panels — зависит от Шагов 2, 7
Шаг 9  → Word origins — зависит от Шага 2
Шаг 10 → Toast/Stats/Modal — зависит от Шага 2
Шаг 11 → Адаптив — ПОСЛЕДНИЙ CSS-шаг (перезаписывает предыдущие)
Шаг 12 → HTML правки — параллельно с CSS
Шаг 13 → JS dashboard.js — после Шага 2 (зависит от новых переменных)
Шаг 14 → JS editor.js — после Шага 2
Шаг 15 → HTML inline-стили — последний
```

**Рекомендуемые батчи:**
- **Батч A** (Шаги 1–3): фундамент — шрифты + переменные + body
- **Батч B** (Шаги 4–6): экраны Auth + Nav + Dashboard
- **Батч C** (Шаги 7–10): Editor + компоненты
- **Батч D** (Шаги 11–15): адаптив + HTML + JS inline-стили

---

## ЧТО НЕ ТРОГАТЬ

- **`js/api.js`** — серверная логика OCR, никакого UI
- **`js/router.js`** — маршрутизация, чистая логика
- **`js/auth.js`** — логика валидации и навигации (кроме inline-цветов, если есть)
- **`404.html`** — редирект-скрипт для GitHub Pages
- **`colab/`** — серверная часть (Python notebook + Flask)
- **`README.md`** — документация
- **Всю бизнес-логику в JS** — загрузка файлов, OCR-пайплайн, экспорт DOCX/PDF/TXT, пакетная обработка, viewport zoom/pan/rotate
- **HTML-структуру экранов** — id элементов, вложенность, data-атрибуты (JS зависит от них)
- **Функциональные цвета word origins** — зелёный OCR, синий HWDB, фиолетовый ABBR, красный uncertain (они информационные)

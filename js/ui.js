/**
 * ui.js — управление интерфейсом.
 * Знает про DOM, не знает про обработку изображений.
 */

// ─── Элементы ────────────────────────────────────────────────────────────────

const queueEl     = document.getElementById('queue');
const logEl       = document.getElementById('log');
const processBtn  = document.getElementById('processBtn');
const clearBtn    = document.getElementById('clearBtn');

// ─── Лог ─────────────────────────────────────────────────────────────────────

/**
 * Добавляет строку в лог-панель.
 * @param {string} text
 * @param {'ok'|'info'|'warn'|''} [cls]
 */
export function addLog(text, cls = '') {
  logEl.classList.add('visible');
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = text;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

/** Очищает лог и скрывает панель. */
export function clearLog() {
  logEl.innerHTML = '';
  logEl.classList.remove('visible');
}

// ─── Очередь ─────────────────────────────────────────────────────────────────

/**
 * Перерисовывает список файлов.
 * @param {File[]} files
 */
export function renderQueue(files) {
  queueEl.innerHTML = '';

  if (!files.length) {
    processBtn.disabled    = true;
    clearBtn.style.display = 'none';
    return;
  }

  processBtn.disabled    = false;
  clearBtn.style.display = 'block';

  files.forEach((f, i) => {
    const item = document.createElement('div');
    item.className = 'queue-item';
    item.id        = `item-${i}`;

    const img       = document.createElement('img');
    img.className   = 'thumb';
    img.src         = URL.createObjectURL(f);

    const info      = document.createElement('div');
    info.className  = 'item-info';
    info.innerHTML  = `
      <div class="item-name">${escapeHtml(f.name)}</div>
      <div class="item-meta">${(f.size / 1024).toFixed(1)} KB · ${f.type.split('/')[1].toUpperCase()}</div>
    `;

    const status    = document.createElement('div');
    status.className = 'item-status status-waiting';
    status.textContent = 'ожидание';
    status.id        = `status-${i}`;

    item.append(img, info, status);
    queueEl.appendChild(item);
  });
}

/**
 * Обновляет статус-бейдж одного элемента очереди.
 * @param {number} index
 * @param {'status-waiting'|'status-working'|'status-done'} cls
 * @param {string} text
 * @param {Function|null} [onClick]
 */
export function setStatus(index, cls, text, onClick = null) {
  const el = document.getElementById(`status-${index}`);
  if (!el) return;
  el.className   = `item-status ${cls}`;
  el.textContent = text;
  el.onclick     = onClick;
}

/**
 * Заменяет превью-миниатюру обработанным результатом.
 * @param {number} index
 * @param {Blob} blob
 */
export function updateThumb(index, blob) {
  const thumb = document.querySelector(`#item-${index} .thumb`);
  if (thumb) thumb.src = URL.createObjectURL(blob);
}

// ─── Кнопки ──────────────────────────────────────────────────────────────────

/**
 * Переводит главную кнопку в режим «Скачать все».
 * @param {Function} onDownloadAll
 */
export function switchToDownloadAll(onDownloadAll) {
  processBtn.textContent = '⬇ Скачать все';
  processBtn.disabled    = false;
  processBtn.onclick     = onDownloadAll;
}

/**
 * Сбрасывает главную кнопку в исходное состояние.
 * @param {Function} onProcess
 */
export function resetProcessBtn(onProcess) {
  processBtn.textContent = 'Обработать стикеры';
  processBtn.disabled    = false;
  processBtn.onclick     = onProcess;
}

// ─── Утилиты ─────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

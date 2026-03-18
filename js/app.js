/**
 * app.js — точка входа.
 * Связывает UI и обработку изображений, управляет состоянием приложения.
 */

import { loadImage, autoCrop, resize512, compressBlob } from './image.js';
import {
  addLog, clearLog,
  renderQueue, setStatus, updateThumb,
  switchToDownloadAll, resetProcessBtn,
} from './ui.js';

// ─── Состояние ────────────────────────────────────────────────────────────────

/** @type {File[]} */
let files = [];

/** @type {Record<number, { blob: Blob, outName: string }>} */
let results = {};

// ─── DOM-элементы ────────────────────────────────────────────────────────────

const thresholdInput = document.getElementById('threshold');
const thresholdVal   = document.getElementById('thresholdVal');
const fileInput      = document.getElementById('fileInput');
const dropzone       = document.getElementById('dropzone');
const fmtSelect      = document.getElementById('fmt');
const processBtn     = document.getElementById('processBtn');
const clearBtn       = document.getElementById('clearBtn');
const canvas         = document.getElementById('canvas');

// ─── Настройки ────────────────────────────────────────────────────────────────

thresholdInput.addEventListener('input', () => {
  thresholdVal.textContent = thresholdInput.value;
});

// ─── Загрузка файлов ──────────────────────────────────────────────────────────

function addFiles(newFiles) {
  const images = [...newFiles].filter(f => f.type.startsWith('image/'));
  files.push(...images);
  renderQueue(files);
}

// Drag & drop
dropzone.addEventListener('dragover',  e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
dropzone.addEventListener('dragleave', ()  => dropzone.classList.remove('drag-over'));
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  addFiles(e.dataTransfer.files);
});

// Выбор через диалог
fileInput.addEventListener('change', () => addFiles(fileInput.files));

// ─── Очистка ──────────────────────────────────────────────────────────────────

clearBtn.addEventListener('click', () => {
  files   = [];
  results = {};
  clearLog();
  renderQueue(files);
  fileInput.value = '';
  resetProcessBtn(processAll);
});

// ─── Скачивание ───────────────────────────────────────────────────────────────

function downloadBlob(blob, name) {
  const a     = document.createElement('a');
  a.href      = URL.createObjectURL(blob);
  a.download  = name;
  a.click();
}

function downloadAll() {
  Object.values(results).forEach(({ blob, outName }, idx) => {
    setTimeout(() => downloadBlob(blob, outName), idx * 200);
  });
}

// ─── Обработка ───────────────────────────────────────────────────────────────

async function processAll() {
  processBtn.disabled = true;
  clearLog();

  const tolerance = parseInt(thresholdInput.value, 10);
  const fmt       = fmtSelect.value;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    setStatus(i, 'status-working', '⚙ обработка');
    addLog(`→ ${file.name}`, 'info');

    try {
      // 1. Загрузка
      const img = await loadImage(file);
      addLog(`  исходник: ${img.naturalWidth}×${img.naturalHeight} · ${(file.size / 1024).toFixed(1)} KB`);

      // 2. Обрезка
      const { cropped, cw, ch, left, top, trimRight, trimBottom } = autoCrop(img, canvas, tolerance);
      addLog(`  обрезка: убрано L=${left} T=${top} R=${trimRight} B=${trimBottom} → ${cw}×${ch}`);

      // 3. Ресайз
      const { nw, nh } = resize512(cropped, cw, ch, canvas);
      if (nw !== cw || nh !== ch) addLog(`  ресайз: ${cw}×${ch} → ${nw}×${nh}`);

      // 4. Сжатие
      const { blob, label } = await compressBlob(canvas, fmt);
      const ext     = blob.type === 'image/png' ? 'png' : 'webp';
      const outName = file.name.replace(/\.[^.]+$/, '') + '_sticker.' + ext;

      results[i] = { blob, outName };
      addLog(`  ✓ ${label} · ${(blob.size / 1024).toFixed(1)} KB · ${nw}×${nh}`, 'ok');

      // Обновляем превью и статус
      updateThumb(i, blob);
      setStatus(i, 'status-done', '⬇ скачать', () => downloadBlob(blob, outName));

    } catch (err) {
      addLog(`  ✗ ошибка: ${err.message}`, 'warn');
      setStatus(i, 'status-waiting', '✗ ошибка');
    }
  }

  addLog('Готово!', 'ok');
  switchToDownloadAll(downloadAll);
}

// ─── Инициализация ────────────────────────────────────────────────────────────

processBtn.addEventListener('click', processAll);

/**
 * image.js — чистые функции обработки изображений.
 * Не знает ничего про DOM кроме canvas, который передаётся аргументом.
 */

/**
 * Загружает File в HTMLImageElement.
 * @param {File} file
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Не удалось загрузить: ${file.name}`));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Умная обрезка фоновых границ.
 * Определяет цвет фона по медиане 4 угловых пикселей,
 * затем обрезает всё похожее на него по периметру.
 *
 * @param {HTMLImageElement} img
 * @param {HTMLCanvasElement} canvas  — рабочий canvas
 * @param {number} tolerance          — допустимое отклонение цвета (0–255)
 * @returns {{ cropped: ImageData, cw: number, ch: number,
 *             left: number, top: number,
 *             trimRight: number, trimBottom: number }}
 */
export function autoCrop(img, canvas, tolerance) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const ctx = canvas.getContext('2d');

  canvas.width  = w;
  canvas.height = h;
  ctx.drawImage(img, 0, 0);

  const data = ctx.getImageData(0, 0, w, h).data;

  // Читаем RGBA угловых пикселей
  function px(x, y) {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  }

  // Медиана 4 углов по каждому каналу → цвет фона
  const corners = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)];
  const bg = [0, 1, 2].map(c => {
    const vals = corners.map(p => p[c]).sort((a, b) => a - b);
    return vals[Math.floor(vals.length / 2)];
  });

  function isBg(x, y) {
    const i = (y * w + x) * 4;
    if (data[i + 3] < 30) return true; // прозрачный пиксель — тоже фон
    return Math.max(
      Math.abs(data[i]     - bg[0]),
      Math.abs(data[i + 1] - bg[1]),
      Math.abs(data[i + 2] - bg[2])
    ) <= tolerance;
  }

  let top = 0, bottom = h - 1, left = 0, right = w - 1;

  /* eslint-disable no-labels */
  outer: for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (!isBg(x, y)) { top = y; break outer; }

  outer: for (let y = h - 1; y >= 0; y--)
    for (let x = 0; x < w; x++) if (!isBg(x, y)) { bottom = y; break outer; }

  outer: for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++) if (!isBg(x, y)) { left = x; break outer; }

  outer: for (let x = w - 1; x >= 0; x--)
    for (let y = 0; y < h; y++) if (!isBg(x, y)) { right = x; break outer; }
  /* eslint-enable no-labels */

  const cw = right - left + 1;
  const ch = bottom - top + 1;
  const cropped = ctx.getImageData(left, top, cw, ch);

  return { cropped, cw, ch, left, top, trimRight: w - right - 1, trimBottom: h - bottom - 1 };
}

/**
 * Ресайзит ImageData так, чтобы максимальная сторона = 512px.
 * Записывает результат в переданный canvas.
 *
 * @param {ImageData} imageData
 * @param {number} cw  — ширина imageData
 * @param {number} ch  — высота imageData
 * @param {HTMLCanvasElement} canvas
 * @returns {{ nw: number, nh: number }}
 */
export function resize512(imageData, cw, ch, canvas) {
  const MAX = 512;
  const ctx = canvas.getContext('2d');

  let nw = cw, nh = ch;
  if (Math.max(cw, ch) > MAX) {
    if (cw >= ch) { nw = MAX;  nh = Math.round(ch * MAX / cw); }
    else          { nh = MAX;  nw = Math.round(cw * MAX / ch); }
  }

  // Переносим imageData на временный canvas, затем масштабируем
  const tmp = document.createElement('canvas');
  tmp.width  = cw;
  tmp.height = ch;
  tmp.getContext('2d').putImageData(imageData, 0, 0);

  canvas.width  = nw;
  canvas.height = nh;
  ctx.drawImage(tmp, 0, 0, nw, nh);

  return { nw, nh };
}

/**
 * Сжимает содержимое canvas в Blob ≤ maxBytes.
 * Стратегия: PNG → WebP с понижением качества → WebP с уменьшением разрешения.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {'auto'|'png'|'webp'} fmt
 * @param {number} [maxBytes=524288]  — 512 * 1024
 * @returns {Promise<{ blob: Blob, label: string }>}
 */
export async function compressBlob(canvas, fmt, maxBytes = 512 * 1024) {
  const ctx = canvas.getContext('2d');
  const toBlob = (format, quality) =>
    new Promise(res => canvas.toBlob(res, format, quality));

  // --- PNG ---
  if (fmt === 'png' || fmt === 'auto') {
    const blob = await toBlob('image/png');
    if (blob.size <= maxBytes) return { blob, label: 'PNG' };
  }

  // --- WebP с подбором качества ---
  if (fmt === 'webp' || fmt === 'auto') {
    for (let q = 0.95; q >= 0.10; q -= 0.05) {
      const blob = await toBlob('image/webp', q);
      if (blob.size <= maxBytes) return { blob, label: `WebP q=${Math.round(q * 100)}` };
    }
  }

  // --- Fallback: уменьшаем разрешение ---
  const origW = canvas.width;
  const origH = canvas.height;

  for (let s = 0.85; s >= 0.30; s -= 0.10) {
    const tmp = document.createElement('canvas');
    tmp.width  = Math.round(origW * s);
    tmp.height = Math.round(origH * s);
    tmp.getContext('2d').drawImage(canvas, 0, 0, tmp.width, tmp.height);

    canvas.width  = tmp.width;
    canvas.height = tmp.height;
    ctx.drawImage(tmp, 0, 0);

    const blob = await toBlob('image/webp', 0.6);
    if (blob.size <= maxBytes) return { blob, label: `WebP small (${tmp.width}×${tmp.height})` };
  }

  // Последний шанс
  const blob = await toBlob('image/webp', 0.1);
  return { blob, label: 'WebP min' };
}

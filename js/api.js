// ════════════════════════════════════════════════════════
//  api.js — OCR через Gradio (Qwen2.5-VL в Colab)
// ════════════════════════════════════════════════════════

// Замени на актуальный URL из Colab (истекает ~72 ч):
var SPACE_URL = 'https://316aaa2d26d1f6ed0b.gradio.live';

// ── ГЛАВНАЯ ФУНКЦИЯ OCR ────────────────────────────────
// Отправляет страницу документа на сервер, получает текст
async function runHuggingFaceOCR(docId, pageIdx) {
  var doc  = uploadedDocs[docId];
  var page = doc.pages[pageIdx];

  setLoadingMsg('Отправка на сервер…', 'Подключение к Gradio');

  // Gradio 4.x принимает base64 dataURL строкой напрямую
  var imageData = page.dataUrl; // "data:image/jpeg;base64,..."

  var json;
  try {
    json = await gradioPredict(SPACE_URL, imageData);
  } catch (e) {
    throw new Error(
      'Нет связи с Gradio-сервером. ' +
      'Проверь SPACE_URL в js/api.js и убедись, что Colab запущен.\nДетали: ' + e.message
    );
  }

  // Gradio возвращает: { data: ["текст"] } или { data: [{ corrected: "текст" }] }
  var result = json.data && json.data[0];
  if (!result) throw new Error('Пустой ответ от сервера');

  var text = (typeof result === 'string')
    ? result
    : (result.corrected || result.text || JSON.stringify(result));

  if (!text || !text.trim()) throw new Error('Модель не распознала текст');

  setLoadingMsg('Текст получен', 'Обрабатываем результат…');
  return textToWordObjects(text);
}

// ── GRADIO API (поддержка v3 / v4 / v5) ───────────────
async function gradioPredict(baseUrl, imageData) {
  // ── Gradio 5.x: POST /run/predict (sync mode без SSE) ──
  var r5 = await fetch(baseUrl + '/run/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: [imageData],
      fn_index: 0,
      session_hash: Math.random().toString(36).slice(2, 10)
    })
  }).catch(function(e) {
    console.log('Gradio 5.x /run/predict попытка #1 ошибка:', e.message);
    throw e;
  });

  if (r5.ok) {
    var ct5 = r5.headers.get('content-type') || '';
    if (ct5.includes('application/json')) {
      try {
        var j5 = await r5.json();
        if (j5.data) return { data: j5.data };
      } catch (e) {
        console.log('Ошибка парса JSON Gradio 5.x:', e.message);
      }
    }
  }

  // ── Градио 4.x: POST /run/predict (попытка #2) ──
  console.log('Попытка Gradio 4.x /run/predict...');
  var r4 = await fetch(baseUrl + '/run/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [imageData], fn_index: 0, session_hash: Math.random().toString(36).slice(2, 10) })
  }).catch(function(e) {
    console.log('Gradio 4.x ошибка:', e.message);
    return { ok: false, status: 0 };
  });

  if (r4.ok) {
    var ct4 = r4.headers.get('content-type') || '';
    if (ct4.includes('application/json')) {
      try {
        var j4 = await r4.json();
        console.log('Gradio 4.x успех:', j4);
        return j4;
      } catch (e) {
        console.log('Ошибка парса JSON Gradio 4.x:', e.message);
      }
    }
  }

  // ── Gradio 3.x: POST /api/predict (попытка #3) ──
  console.log('Попытка Gradio 3.x /api/predict...');
  var r3 = await fetch(baseUrl + '/api/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [imageData], fn_index: 0 })
  }).catch(function(e) {
    console.log('Gradio 3.x ошибка:', e.message);
    return { ok: false, status: 0 };
  });

  if (r3.ok) {
    var j3 = await r3.json();
    console.log('Gradio 3.x успех:', j3);
    return j3;
  }

  console.error('Все эндпоинты вернули ошибку. r5.status=' + r5.status + ', r4.status=' + r4.status + ', r3.status=' + r3.status);
  throw new Error('Gradio-сервер не ответил. Проверь консоль F12 → Console для подробностей');
}

// ── КОНВЕРТАЦИЯ ТЕКСТА В МАССИВ СЛОВ ──────────────────
// Движок word-per-word pipeline ожидает объекты:
// { word, confidence, source, bbox, lineBreak }
function textToWordObjects(text) {
  var words = [];
  var lines = text.split('\n');

  lines.forEach(function(line, lineIdx) {
    var lineWords = line.split(/\s+/).filter(function(w){ return w.length > 0; });
    var isLastLine = (lineIdx === lines.length - 1);

    lineWords.forEach(function(word, wordIdx) {
      words.push({
        word:       word,
        confidence: 80,    // Qwen не даёт confidence per-word — ставим 80%
        source:     'ocr',
        bbox:       null,  // координаты недоступны без детектора слов
        lineBreak:  (wordIdx === lineWords.length - 1) && !isLastLine
      });
    });
  });

  if (words.length === 0) throw new Error('Текст не обнаружен на изображении');
  return words;
}

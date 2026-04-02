// ════════════════════════════════════════════════════════
//  api.js — OCR через Gradio (Qwen2.5-VL в Colab)
// ════════════════════════════════════════════════════════

// Замени на актуальный URL из Colab (истекает ~72 ч):
var SPACE_URL = 'https://e0fdb2e06b169cc0a3.gradio.live';

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
  // ── Gradio 5.x: POST /call/predict → event_id, затем GET SSE ──
  var r5 = await fetch(baseUrl + '/call/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [imageData] })
  });

  if (r5.ok) {
    var ct5 = r5.headers.get('content-type') || '';
    if (ct5.includes('application/json')) {
      var j5 = await r5.json();
      var eventId = j5.event_id;
      if (eventId) {
        // Читаем SSE-стрим до process_completed
        var sseResp = await fetch(baseUrl + '/call/predict/' + eventId);
        var sseText = await sseResp.text();
        // SSE: ищем последнюю строку data: {...}
        var lines = sseText.split('\n');
        for (var i = lines.length - 1; i >= 0; i--) {
          if (lines[i].startsWith('data: ')) {
            var payload = JSON.parse(lines[i].slice(6));
            if (payload.msg === 'process_completed' && payload.output) {
              return payload.output;   // { data: [...] }
            }
          }
        }
        throw new Error('Gradio 5.x: process_completed не найден в SSE-ответе');
      }
    }
  }

  // ── Gradio 4.x: POST /run/predict ──
  var sessionHash = Math.random().toString(36).slice(2, 10);
  var r4 = await fetch(baseUrl + '/run/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [imageData], fn_index: 0, session_hash: sessionHash })
  });
  if (r4.ok) {
    var ct4 = r4.headers.get('content-type') || '';
    if (ct4.includes('application/json')) return r4.json();
  }

  // ── Gradio 3.x: POST /api/predict ──
  var r3 = await fetch(baseUrl + '/api/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [imageData], fn_index: 0 })
  });
  if (r3.ok) return r3.json();

  var errText = await r3.text().catch(function(){ return String(r3.status); });
  throw new Error('Все эндпоинты вернули ошибку. Последний ответ ' + r3.status + ': ' + errText.slice(0, 200));
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

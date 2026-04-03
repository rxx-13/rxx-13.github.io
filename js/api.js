// ════════════════════════════════════════════════════════
//  api.js — OCR через Gradio (Qwen2.5-VL в Colab)
// ════════════════════════════════════════════════════════

// Замени на актуальный URL из Colab (истекает ~72 ч):
var SPACE_URL = 'https://77558cb0a579ef9633.gradio.live';

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
      'Нет связи с сервером. ' +
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

// ── FLASK API (POST /predict) ──────────────────────────
async function gradioPredict(baseUrl, imageData) {
  var resp = await fetch(baseUrl + '/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageData })
  });

  if (!resp.ok) {
    throw new Error('Сервер вернул ' + resp.status + '. Убедись что Colab запущен.');
  }

  var json = await resp.json();
  // Flask возвращает { corrected: "текст" } напрямую
  return { data: [json] };
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

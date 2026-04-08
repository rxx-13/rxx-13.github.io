// ════════════════════════════════════════════════════════
//  api.js — OCR через Flask-сервер (Qwen2.5-VL в Colab)
// ════════════════════════════════════════════════════════

// Вставь сюда URL из вывода ячейки 4 в Colab (ngrok-ссылка):
var SPACE_URL = 'https://77558cb0a579ef9633.gradio.live';

// ── ГЛАВНАЯ ФУНКЦИЯ OCR ────────────────────────────────
// Отправляет страницу документа на сервер, получает текст
async function runHuggingFaceOCR(docId, pageIdx) {
  var doc  = uploadedDocs[docId];
  var page = doc.pages[pageIdx];

  setLoadingMsg('Отправка на сервер…', 'Подключение к Colab');

  var json;
  try {
    json = await callServer(SPACE_URL, page.dataUrl);
  } catch (e) {
    throw new Error(
      'Нет связи с сервером. ' +
      'Проверь SPACE_URL в js/api.js и убедись, что Colab запущен.\nДетали: ' + e.message
    );
  }

  // Сервер возвращает: { corrected: "текст" }
  var text = (json.corrected || json.text || '').trim();
  if (!text) throw new Error('Модель не распознала текст');

  setLoadingMsg('Текст получен', 'Обрабатываем результат…');
  return textToWordObjects(text);
}

// ── ЗАПРОС К СЕРВЕРУ ──────────────────────────────────
// POST /predict  →  { image: "data:image/jpeg;base64,..." }
// ответ:          { corrected: "текст" }
async function callServer(baseUrl, imageData) {
  var resp = await fetch(baseUrl + '/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageData })
  });

  if (!resp.ok) {
    var body = await resp.text().catch(function(){ return ''; });
    throw new Error('HTTP ' + resp.status + ': ' + body.slice(0, 200));
  }

  return resp.json();
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
        confidence: 80,
        source:     'ocr',
        bbox:       null,
        lineBreak:  (wordIdx === lineWords.length - 1) && !isLastLine
      });
    });
  });

  if (words.length === 0) throw new Error('Текст не обнаружен на изображении');
  return words;
}

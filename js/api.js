// ════════════════════════════════════════════════════════
//  api.js — OCR через HuggingFace Space (Qwen2.5-VL)
// ════════════════════════════════════════════════════════

// После деплоя замени на свой URL:
// https://ВАШ_НИК-scriptorium-ocr.hf.space
var SPACE_URL = 'https://ВАШ_НИК-scriptorium-ocr.hf.space';

// ── ГЛАВНАЯ ФУНКЦИЯ OCR ────────────────────────────────
// Отправляет страницу документа на Space, получает текст
async function runHuggingFaceOCR(docId, pageIdx) {
  var doc  = uploadedDocs[docId];
  var page = doc.pages[pageIdx];

  setLoadingMsg('Отправка на сервер…', 'Подключение к HuggingFace Space');

  var response;
  try {
    response = await fetch(SPACE_URL + '/api/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [{
          path: page.dataUrl,        // base64 dataURL
          mime_type: page.mediaType  // image/jpeg или image/png
        }]
      })
    });
  } catch (e) {
    throw new Error(
      'Нет связи с HuggingFace Space. ' +
      'Проверь SPACE_URL в js/api.js. Детали: ' + e.message
    );
  }

  if (!response.ok) {
    var errText = await response.text().catch(function(){ return ''; });
    throw new Error('Ошибка сервера ' + response.status + ': ' + errText.slice(0, 200));
  }

  var json = await response.json();

  // Gradio возвращает: { data: [ { corrected: "текст" } ] }
  var result = json.data && json.data[0];
  if (!result) throw new Error('Пустой ответ от Space');

  var text = (typeof result === 'string')
    ? result
    : (result.corrected || result.text || '');

  if (!text || !text.trim()) throw new Error('Модель не распознала текст');

  setLoadingMsg('Текст получен', 'Обрабатываем результат…');
  return textToWordObjects(text);
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

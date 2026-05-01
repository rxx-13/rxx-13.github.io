// ════════════════════════════════════════════════════════
//  api.js — OCR через FastAPI-сервер (Groq / Gemini)
// ════════════════════════════════════════════════════════

var SPACE_URL = 'https://dmitry-402859-space.hf.space'

// ── СПИСОК МОДЕЛЕЙ ────────────────────────────────────
// Загружает GET /models и заполняет #engineSelect
async function loadAvailableModels() {
  try {
    var resp = await fetch(SPACE_URL + '/models');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var models = await resp.json();
    window.AVAILABLE_MODELS = models;

    var sel = document.getElementById('engineSelect');
    if (!sel) return;
    sel.innerHTML = '';
    models.forEach(function(m) {
      var opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.label + (!m.available ? ' (нет ключа)' : '');
      opt.disabled = !m.available;
      sel.appendChild(opt);
    });
    // Выбрать первую доступную модель
    var first = models.find(function(m) { return m.available; });
    if (first) sel.value = first.id;
  } catch(e) {
    console.warn('Не удалось загрузить список моделей:', e.message);
    // Оставить fallback-опцию из HTML
  }
}

window.addEventListener('DOMContentLoaded', loadAvailableModels);

// ── ГЛАВНАЯ ФУНКЦИЯ OCR ────────────────────────────────
async function runHuggingFaceOCR(docId, pageIdx, context) {
  var doc  = uploadedDocs[docId];
  var page = doc.pages[pageIdx];

  var sel = document.getElementById('engineSelect');
  var modelId = sel ? sel.value : 'groq-scout';

  setLoadingMsg('Отправка на сервер…', 'Подключение к серверу');

  var json;
  try {
    json = await callServer(SPACE_URL, page.dataUrl, context, modelId);
  } catch (e) {
    throw new Error(
      'Нет связи с сервером. ' +
      'Проверь SPACE_URL в js/api.js и убедись, что сервер запущен.\nДетали: ' + e.message
    );
  }

  var text = (json.corrected || json.text || '').trim();
  if (!text) throw new Error('Модель не распознала текст');

  setLoadingMsg('Текст получен', 'Обрабатываем результат…');
  return textToWordObjects(text, json.words);
}

// ── ЗАПРОС К СЕРВЕРУ ──────────────────────────────────
async function callServer(baseUrl, imageData, context, modelId) {
  var resp = await fetch(baseUrl + '/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: imageData,
      context: context || '',
      model_id: modelId || 'groq-scout'
    })
  });

  if (!resp.ok) {
    var body = await resp.text().catch(function(){ return ''; });
    throw new Error('HTTP ' + resp.status + ': ' + body.slice(0, 200));
  }

  return resp.json();
}

// ── КОНВЕРТАЦИЯ ТЕКСТА В МАССИВ СЛОВ ──────────────────
function textToWordObjects(text, serverWords) {
  // Использовать слова с реальным confidence если сервер прислал
  if (Array.isArray(serverWords) && serverWords.length) {
    var result = serverWords.map(function(w) {
      return {
        word:       w.word,
        confidence: w.confidence != null ? w.confidence : 80,
        source:     'ocr',
        bbox:       null,
        lineBreak:  w.lineBreak || false
      };
    });
    if (result.length === 0) throw new Error('Текст не обнаружен на изображении');
    return result;
  }

  // Fallback: разбить по \n и пробелам
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

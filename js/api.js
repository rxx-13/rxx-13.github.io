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

// ── GRADIO API (поддержка v5 с очередью) ──────────────
async function gradioPredict(baseUrl, imageData) {
  var sessionHash = Math.random().toString(36).slice(2, 15);

  // ── Градio 5.50.0: POST /gradio_api/queue/join (с префиксом!) ──
  console.log('Попытка Gradio 5.x /gradio_api/queue/join...');
  var queueResp = await fetch(baseUrl + '/gradio_api/queue/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: [imageData],
      fn_index: 0,
      session_hash: sessionHash
    })
  }).catch(function(e) {
    console.log('Gradio 5.x ошибка:', e.message);
    return null;
  });

  if (queueResp && queueResp.ok) {
    try {
      var queueData = await queueResp.json();
      console.log('Queue join ответ:', queueData);
      var hash = queueData.hash;

      if (hash) {
        // Читаем SSE-стрим с результатом
        var sseResp = await fetch(baseUrl + '/gradio_api/queue/data?session_hash=' + sessionHash);
        var sseText = await sseResp.text();
        var lines = sseText.split('\n');

        for (var i = 0; i < lines.length; i++) {
          if (lines[i].startsWith('data:')) {
            try {
              var payload = JSON.parse(lines[i].slice(5));
              console.log('SSE событие:', payload.msg);
              if (payload.msg === 'process_completed' && payload.output) {
                console.log('✅ Gradio 5.x результат:', payload.output);
                return { data: payload.output.data };
              }
            } catch (e) {}
          }
        }
        throw new Error('process_completed не найден в SSE-стриме');
      }
    } catch (e) {
      console.log('❌ Ошибка обработки /queue/join:', e.message);
    }
  }

  // ── Градио 4.x: POST /run/predict (fallback) ──
  console.log('Попытка Gradio 4.x /run/predict...');
  var r4 = await fetch(baseUrl + '/run/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [imageData], fn_index: 0, session_hash: sessionHash })
  }).catch(function(e) {
    console.log('Gradio 4.x ошибка:', e.message);
    return null;
  });

  if (r4 && r4.ok) {
    try {
      var j4 = await r4.json();
      console.log('✅ Gradio 4.x успех:', j4);
      return j4;
    } catch (e) {
      console.log('Ошибка парса JSON:', e.message);
    }
  }

  // ── Gradio 3.x: POST /api/predict (fallback) ──
  console.log('Попытка Gradio 3.x /api/predict...');
  var r3 = await fetch(baseUrl + '/api/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [imageData], fn_index: 0 })
  }).catch(function(e) {
    console.log('Gradio 3.x ошибка:', e.message);
    return null;
  });

  if (r3 && r3.ok) {
    try {
      var j3 = await r3.json();
      console.log('✅ Gradio 3.x успех:', j3);
      return j3;
    } catch (e) {
      console.log('Ошибка парса JSON:', e.message);
    }
  }

  throw new Error('Все эндпоинты вернули ошибку. Проверь консоль F12 для подробностей.');
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

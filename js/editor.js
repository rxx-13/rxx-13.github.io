// ════════════════════════════════════════════════════════
//  editor.js — OCR-конвейер, рендер результата
// ════════════════════════════════════════════════════════

// ── ЗАГРУЗКА СТРАНИЦ ───────────────────────────────────
async function initPages(docId) {
  var doc = uploadedDocs[docId];
  if (!doc) return;
  if (doc.type === 'application/pdf') {
    await extractPdfPages(docId);
  } else {
    var mt = doc.dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
    doc.pages     = [{ dataUrl: doc.dataUrl, mediaType: mt }];
    doc.pageWords = [null];
  }
}

async function extractPdfPages(docId) {
  var doc = uploadedDocs[docId];
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    var binary = atob(doc.dataUrl.split(',')[1]);
    var bytes  = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    var pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    var n   = pdf.numPages;
    doc.pages     = [];
    doc.pageWords = new Array(n).fill(null);
    showToast('Загружаю ' + n + ' стр. PDF…', 4000);
    for (var p = 1; p <= n; p++) {
      var page     = await pdf.getPage(p);
      var viewport = page.getViewport({ scale: 2.0 });
      var cv       = document.createElement('canvas');
      cv.width  = viewport.width;
      cv.height = viewport.height;
      await page.render({ canvasContext: cv.getContext('2d'), viewport: viewport }).promise;
      doc.pages.push({ dataUrl: cv.toDataURL('image/jpeg', 0.92), mediaType: 'image/jpeg',
                       naturalW: cv.width, naturalH: cv.height });
    }
    showToast(n + ' страниц загружено');
  } catch(e) {
    showToast('Ошибка PDF: ' + e.message, 5000);
    doc.pages     = [];
    doc.pageWords = [];
  }
}

// ── TEXT STATE ─────────────────────────────────────────
function showTextState(state) {
  document.getElementById('stateEmpty').style.display   = state === 'empty'   ? 'flex'  : 'none';
  document.getElementById('stateLoading').style.display = state === 'loading' ? 'flex'  : 'none';
  document.getElementById('textContent').style.display  = state === 'result'  ? 'block' : 'none';
}

function setLoadingMsg(title, sub) {
  document.getElementById('loadingTitle').textContent    = title;
  document.getElementById('loadingSubtitle').textContent = sub || '';
}

function onEngineChange(val) { /* в текущей версии только один движок */ }

// ── RECOGNIZE ──────────────────────────────────────────
async function recognizeCurrentPage() {
  if (!currentDocId) { showToast('Выберите файл для распознавания'); return; }
  var doc = uploadedDocs[currentDocId];
  if (!doc.dataUrl) { showToast('Файл ещё загружается, подождите'); return; }

  var btn = document.getElementById('recognizeBtn');
  btn.disabled = true;
  showTextState('loading');
  setLoadingMsg('Запуск…', '');

  try {
    if (!doc.pages) await initPages(currentDocId);
    var context = document.getElementById('ocrContext').value;
    var words   = await runPipeline(currentDocId, currentPage, null, context);
    if (doc.pageWords) doc.pageWords[currentPage] = words;
    renderWords(words, currentPage);
  } catch(e) {
    showTextState('empty');
    showToast(e.message, 5000);
    console.error(e);
  } finally {
    btn.disabled = false;
  }
}

// ── PIPELINE ───────────────────────────────────────────
async function runPipeline(docId, pageIdx, cropSel, context) {
  var doHW   = document.getElementById('stageHW').checked;
  var doAbbr = document.getElementById('stageAbbr').checked;

  setLoadingMsg('OCR-распознавание…', 'Qwen2.5-VL на HuggingFace');
  var words = await runHuggingFaceOCR(docId, pageIdx, context);

  setLoadingMsg('База почерков…', '');
  if (doHW) words = applyHandwritingDB(words);

  setLoadingMsg('Сокращения…', '');
  if (doAbbr) words = applyAbbreviations(words);

  return words;
}

// ── БАЗА ПОЧЕРКОВ ──────────────────────────────────────
var HW_DB = {
  'тго':  { fix: 'его',       note: 'База почерков: «тго»→«его»' },
  'nо':   { fix: 'по',        note: 'База почерков: лат. n→п' },
  'nри':  { fix: 'при',       note: 'База почерков' },
  'вь':   { fix: 'въ',        note: 'База почерков: ь→ъ' },
  'вб':   { fix: 'въ',        note: 'База почерков' },
  'l':    { fix: 'і',         note: 'База почерков: l→і' },
  'г-нь': { fix: 'господинъ', note: 'База почерков' },
  'г-жа': { fix: 'госпожа',   note: 'База почерков' }
};

function applyHandwritingDB(words) {
  return words.map(function(w) {
    var lower = w.word.toLowerCase().replace(/[.,!?;:]/g, '');
    var entry = HW_DB[lower];
    if (entry && entry.fix && w.confidence < 85)
      return Object.assign({}, w, { word: entry.fix, source: 'hwdb',
        confidence: Math.min(w.confidence + 20, 90), hwNote: entry.note });
    return w;
  });
}

// ── БАЗА СОКРАЩЕНИЙ ────────────────────────────────────
var ABBR_DB = {
  'г.':'год / город','гг.':'годы','т.е.':'то есть','т.к.':'так как',
  'т.п.':'тому подобное','и т.д.':'и так далее','и пр.':'и прочее',
  'и др.':'и другие','проф.':'профессор','акад.':'академик','д-р':'доктор',
  'руб.':'рублей','коп.':'копеек','ст.':'статья / станция',
  'губ.':'губерния','у.':'уезд','вол.':'волость',
  'стр.':'страница','арх.':'архив','ф.':'фонд','оп.':'опись',
  'д.':'дело / деревня','л.':'лист','лл.':'листы','об.':'оборот',
  'н.э.':'нашей эры','им.':'имени','тов.':'товарищ',
  'г-нъ':'господинъ','е.и.в.':'его императорское величество',
  'янв.':'январь','фев.':'февраль','мар.':'март','апр.':'апрель',
  'авг.':'август','сент.':'сентябрь','окт.':'октябрь',
  'нояб.':'ноябрь','дек.':'декабрь'
};

function applyAbbreviations(words) {
  return words.map(function(w) {
    var key = w.word.toLowerCase();
    var exp = ABBR_DB[key] || ABBR_DB[key.replace(/[.,]+$/, '') + '.'];
    if (exp) return Object.assign({}, w, { source: 'abbr', abbrExpansion: exp,
      confidence: Math.max(w.confidence, 88) });
    return w;
  });
}

// ── РЕНДЕР СЛОВ ────────────────────────────────────────
var confidenceThreshold = 60;

function renderWords(words, pageIdx) {
  showTextState('result');
  var container = document.getElementById('textContent');
  container.innerHTML = '';

  var srcClass = { ocr: 'ocr', hwdb: 'hwdb', abbr: 'abbr', uncertain: 'uncertain' };
  var para = document.createElement('p');
  para.style.marginBottom = '12px';

  words.forEach(function(w, idx) {
    var span = document.createElement('span');
    span.className    = 'tw tw-' + (srcClass[w.source] || 'ocr');
    span.dataset.idx  = idx;
    span.dataset.conf = w.confidence;
    span.dataset.src  = w.source;
    span.textContent  = w.word;

    if (w.confidence < confidenceThreshold)
      span.classList.add(w.confidence < confidenceThreshold * 0.65 ? 'conf-vlow' : 'conf-low');

    var tip = srcLabel(w.source) + ' · ' + w.confidence + '%';
    if (w.hwNote)        tip += ' · ' + w.hwNote;
    if (w.abbrExpansion) tip += ' · «' + w.abbrExpansion + '»';
    span.setAttribute('data-tip', tip);

    para.appendChild(span);

    if (w.lineBreak) {
      container.appendChild(para);
      para = document.createElement('p');
      para.style.marginBottom = '12px';
    } else {
      para.appendChild(document.createTextNode(' '));
    }
  });
  if (para.childNodes.length) container.appendChild(para);
}

function srcLabel(src) {
  var L = { ocr: 'OCR', hwdb: 'База почерков', abbr: 'Сокращение', uncertain: 'Не распознано' };
  return L[src] || src;
}

// ── CONFIDENCE & SLIDERS ───────────────────────────────
function updateConfidence(val) {
  confidenceThreshold = parseInt(val);
  document.getElementById('confVal').textContent = val + '%';
  document.querySelectorAll('.tw').forEach(function(el) {
    var conf = parseInt(el.dataset.conf);
    el.classList.remove('conf-low', 'conf-vlow');
    if (conf < confidenceThreshold)
      el.classList.add(conf < confidenceThreshold * 0.65 ? 'conf-vlow' : 'conf-low');
  });
}

function updateSliderLabel(sliderId, labelId, neutral) {
  var val = parseInt(document.getElementById(sliderId).value);
  var lbl = document.getElementById(labelId);
  if (!lbl) return;
  lbl.textContent = val + '%';
  lbl.classList.toggle('changed', val !== neutral);
}

// ── ADVANCED PANEL ─────────────────────────────────────
function toggleAdvanced() {
  var panel = document.getElementById('wsAdvanced');
  panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
}

// ── КОПИРОВАНИЕ ────────────────────────────────────────
function copyRecognizedText() {
  var words = Array.from(document.querySelectorAll('.tw')).map(function(el){ return el.textContent; });
  if (!words.length) { showToast('Нет текста'); return; }
  navigator.clipboard.writeText(words.join(' ')).then(function(){ showToast('Скопировано'); });
}

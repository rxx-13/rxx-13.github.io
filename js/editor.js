// ════════════════════════════════════════════════════════
//  editor.js — Редактор, viewport, OCR-конвейер
// ════════════════════════════════════════════════════════

// ── VIEWPORT STATE ─────────────────────────────────────
var vp = {
  scale: 1, tx: 0, ty: 0,
  imgW: 0, imgH: 0,
  rotation: 0,
  mode: 'pan',
  dragging: false,
  dragStartX: 0, dragStartY: 0, dragTX: 0, dragTY: 0,
  selStart: null, sel: null
};

// ── ОТКРЫТИЕ РЕДАКТОРА ─────────────────────────────────
async function openEditor(docId) {
  currentDocId = docId;
  currentPage  = 0;
  var doc = uploadedDocs[docId];
  goTo('editor');
  vpInit();
  document.getElementById('editorDocName').textContent = doc ? doc.name : 'Документ';
  vpClear();
  await initPages(docId);
  await showPage(0);
  showTextState('empty');
}

// ── ЗАГРУЗКА СТРАНИЦ ───────────────────────────────────
async function initPages(docId) {
  var doc = uploadedDocs[docId];
  if (!doc) return;
  if (doc.type === 'application/pdf') {
    await extractPdfPages(docId);
  } else {
    var mt = doc.dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
    doc.pages = [{ dataUrl: doc.dataUrl, mediaType: mt }];
    doc.pageWords = [null];
    buildPageThumbs(1);
    setPageCounter(0, 1);
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
    doc.pages = []; doc.pageWords = new Array(n).fill(null);
    showToast('Загружаю ' + n + ' стр. PDF…', 4000);
    for (var p = 1; p <= n; p++) {
      var page = await pdf.getPage(p);
      var viewport = page.getViewport({ scale: 2.0 });
      var cv = document.createElement('canvas');
      cv.width = viewport.width; cv.height = viewport.height;
      await page.render({ canvasContext: cv.getContext('2d'), viewport: viewport }).promise;
      doc.pages.push({ dataUrl: cv.toDataURL('image/jpeg', 0.92), mediaType: 'image/jpeg',
                       naturalW: cv.width, naturalH: cv.height });
    }
    buildPageThumbs(n); setPageCounter(0, n);
    showToast('✅ ' + n + ' страниц загружено');
  } catch(e) {
    showToast('⚠️ Ошибка PDF: ' + e.message, 5000);
    doc.pages = []; doc.pageWords = [];
  }
}

// ── VIEWPORT ИНИЦИАЛИЗАЦИЯ ─────────────────────────────
function vpInit() {
  var viewport = document.getElementById('imageViewport');
  if (!viewport || viewport._vpInited) return;
  viewport._vpInited = true;
  viewport.addEventListener('wheel',      onVpWheel,      { passive: false });
  viewport.addEventListener('mousedown',  onVpMouseDown);
  viewport.addEventListener('mousemove',  onVpMouseMove);
  viewport.addEventListener('mouseup',    onVpMouseUp);
  viewport.addEventListener('mouseleave', onVpMouseUp);
  viewport.addEventListener('touchstart', onVpTouchStart, { passive: false });
  viewport.addEventListener('touchmove',  onVpTouchMove,  { passive: false });
  viewport.addEventListener('touchend',   onVpTouchEnd);
}

function vpClear() {
  var img = document.getElementById('docImageEl');
  var cv  = document.getElementById('docCanvas');
  if (img) { img.src = ''; img.style.display = 'none'; }
  if (cv)  cv.style.display = 'none';
  document.getElementById('vpEmpty').style.display = 'flex';
  vp.imgW = 0; vp.imgH = 0; vp.scale = 1; vp.tx = 0; vp.ty = 0;
}

async function showPage(pageIdx) {
  var doc = uploadedDocs[currentDocId];
  if (!doc || !doc.pages || !doc.pages[pageIdx]) return;

  currentPage = pageIdx;
  var page    = doc.pages[pageIdx];
  var imgEl   = document.getElementById('docImageEl');
  var vpEmpty = document.getElementById('vpEmpty');

  await new Promise(function(resolve) {
    imgEl.onload = function() {
      vp.imgW = imgEl.naturalWidth;
      vp.imgH = imgEl.naturalHeight;
      if (page.naturalW) vp.imgW = page.naturalW;
      if (page.naturalH) vp.imgH = page.naturalH;

      // Размер канвасов под изображение
      var oc = document.getElementById('overlayCanvas');
      var sc = document.getElementById('selCanvas');
      if (oc) { oc.width = vp.imgW; oc.height = vp.imgH; }
      if (sc) { sc.width = vp.imgW; sc.height = vp.imgH; }

      imgEl.style.display = 'block';
      if (vpEmpty) vpEmpty.style.display = 'none';
      vpFit();
      resolve();
    };
    if (imgEl.src === page.dataUrl && imgEl.complete) { imgEl.onload(); return; }
    imgEl.src = page.dataUrl;
  });

  // Подсветить активный thumb
  document.querySelectorAll('.page-thumb').forEach(function(t, i) {
    t.classList.toggle('active', i === pageIdx);
  });
  setPageCounter(pageIdx, doc.pages.length);

  // Показать распознанный текст, если есть
  if (doc.pageWords && doc.pageWords[pageIdx]) {
    renderWords(doc.pageWords[pageIdx], pageIdx);
  } else {
    showTextState('empty');
  }
}

// ── PAGE NAV ───────────────────────────────────────────
function buildPageThumbs(n) {
  var row    = document.getElementById('pageThumbs');
  var topBar = document.getElementById('pageNavTop');
  var strip  = document.getElementById('pageNavStrip');
  row.innerHTML = '';
  if (topBar) topBar.style.display = (n >= 1) ? 'flex' : 'none';
  if (strip)  strip.style.display  = (n >= 1) ? 'flex' : 'none';

  var doc = uploadedDocs[currentDocId];
  for (var i = 0; i < n; i++) {
    var thumb = document.createElement('div');
    thumb.className = 'page-thumb' + (i === 0 ? ' active' : '');
    thumb.id = 'pthumb-' + i;
    thumb.onclick = (function(idx){ return function(){ goToPage(idx); }; })(i);
    if (doc && doc.pages && doc.pages[i]) {
      var img = document.createElement('img');
      img.src = doc.pages[i].dataUrl; thumb.appendChild(img);
    }
    var numEl = document.createElement('div');
    numEl.className = 'page-thumb-num'; numEl.textContent = i + 1;
    thumb.appendChild(numEl);
    if (doc && doc.pageWords && doc.pageWords[i]) thumb.classList.add('done-thumb');
    row.appendChild(thumb);
  }

  var totalLbl = document.getElementById('pageTotalLabel');
  if (totalLbl) totalLbl.textContent = '/ ' + n;
  var fb = document.getElementById('firstPageBtn');
  var lb = document.getElementById('lastPageBtn');
  if (fb) fb.disabled = (n <= 1);
  if (lb) lb.disabled = (n <= 1);
  document.getElementById('prevPageBtn').disabled = true;
  document.getElementById('nextPageBtn').disabled = (n <= 1);
}

function setPageCounter(idx, total) {
  var inp = document.getElementById('pageInputEl');
  if (inp) { inp.value = idx + 1; inp.max = total; }
  var totalLbl = document.getElementById('pageTotalLabel');
  if (totalLbl) totalLbl.textContent = '/ ' + total;
  document.getElementById('prevPageBtn').disabled = (idx === 0);
  document.getElementById('nextPageBtn').disabled = (idx >= total - 1);
}

async function goToPage(idx) {
  var doc = uploadedDocs[currentDocId];
  if (!doc || !doc.pages) return;
  idx = Math.max(0, Math.min(idx, doc.pages.length - 1));
  if (idx === currentPage) return;
  await showPage(idx);
}

function goToLastPage() {
  var doc = uploadedDocs[currentDocId];
  if (doc && doc.pages) goToPage(doc.pages.length - 1);
}

function goToPageFromInput(val) {
  var idx = parseInt(val) - 1;
  if (!isNaN(idx)) goToPage(idx);
}

function markThumbDone(idx) {
  var t = document.getElementById('pthumb-' + idx);
  if (t) t.classList.add('done-thumb');
}

// ── VIEWPORT TRANSFORM ─────────────────────────────────
function applyVpTransform() {
  var viewport = document.getElementById('imageViewport');
  var stage    = document.getElementById('imgStage');
  if (!stage || !viewport) return;

  var vw = viewport.clientWidth, vh = viewport.clientHeight;
  var cx = vw / 2 + vp.tx - vp.imgW * vp.scale / 2;
  var cy = vh / 2 + vp.ty - vp.imgH * vp.scale / 2;

  stage.style.transform = 'translate(' + cx + 'px,' + cy + 'px) rotate(' + vp.rotation + 'deg) scale(' + vp.scale + ')';
  stage.style.transformOrigin = '0 0';

  var zl = document.getElementById('zoomLabel');
  if (zl) zl.textContent = Math.round(vp.scale * 100) + '%';
}

function vpFit() {
  var viewport = document.getElementById('imageViewport');
  if (!viewport || !vp.imgW || !vp.imgH) return;
  var vw = viewport.clientWidth, vh = viewport.clientHeight;
  vp.scale = Math.min(vw / vp.imgW, vh / vp.imgH) * 0.92;
  vp.tx = 0; vp.ty = 0;
  applyVpTransform();
}

function vFit()  { vpFit(); }
function vZoom(delta) { vp.scale = Math.max(0.1, Math.min(8, vp.scale + delta)); applyVpTransform(); }
function vRotate(deg) { vp.rotation = (vp.rotation + deg + 360) % 360; applyVpTransform(); }

// ── WHEEL ZOOM ─────────────────────────────────────────
function onVpWheel(e) {
  e.preventDefault();
  var factor   = e.deltaY < 0 ? 1.12 : 0.88;
  var viewport = document.getElementById('imageViewport');
  var rect     = viewport.getBoundingClientRect();
  var mx = e.clientX - rect.left - viewport.clientWidth  / 2;
  var my = e.clientY - rect.top  - viewport.clientHeight / 2;
  vp.tx = mx + (vp.tx - mx) * factor;
  vp.ty = my + (vp.ty - my) * factor;
  vp.scale = Math.max(0.1, Math.min(8, vp.scale * factor));
  applyVpTransform();
}

// ── MOUSE ──────────────────────────────────────────────
function onVpMouseDown(e) {
  if (e.button !== 0) return;
  if (vp.mode === 'pan') {
    vp.dragging = true;
    vp.dragStartX = e.clientX; vp.dragStartY = e.clientY;
    vp.dragTX = vp.tx; vp.dragTY = vp.ty;
    document.getElementById('imageViewport').classList.add('dragging');
  } else if (vp.mode === 'select') {
    var pt = vpClientToImage(e.clientX, e.clientY);
    if (!pt) return;
    vp.selStart = pt; vp.sel = null; clearSelCanvas();
  }
}

function onVpMouseMove(e) {
  if (vp.mode === 'pan' && vp.dragging) {
    vp.tx = vp.dragTX + (e.clientX - vp.dragStartX);
    vp.ty = vp.dragTY + (e.clientY - vp.dragStartY);
    applyVpTransform();
  } else if (vp.mode === 'select' && vp.selStart) {
    var pt = vpClientToImage(e.clientX, e.clientY);
    if (!pt) return;
    vp.sel = { x: Math.min(vp.selStart.x, pt.x), y: Math.min(vp.selStart.y, pt.y),
               w: Math.abs(pt.x - vp.selStart.x),  h: Math.abs(pt.y - vp.selStart.y) };
    drawSelRect(vp.sel);
  }
}

function onVpMouseUp(e) {
  if (vp.mode === 'pan' && vp.dragging) {
    vp.dragging = false;
    document.getElementById('imageViewport').classList.remove('dragging');
  } else if (vp.mode === 'select' && vp.selStart) {
    vp.selStart = null;
    if (vp.sel && vp.sel.w > 4 && vp.sel.h > 4) {
      document.getElementById('btnRecognizeSel').style.display = 'flex';
      document.getElementById('btnClearSel').style.display = 'flex';
      showToast('Область выделена — нажмите ⚡ для распознавания', 3000);
    } else { vp.sel = null; clearSelCanvas(); }
  }
}

// ── TOUCH ──────────────────────────────────────────────
var _touchDist = 0, _scaleAtPinch = 1;

function onVpTouchStart(e) {
  if (e.touches.length === 1) {
    var t = e.touches[0];
    vp.dragging = true;
    vp.dragStartX = t.clientX; vp.dragStartY = t.clientY;
    vp.dragTX = vp.tx; vp.dragTY = vp.ty;
  } else if (e.touches.length === 2) {
    _touchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                            e.touches[0].clientY - e.touches[1].clientY);
    _scaleAtPinch = vp.scale;
  }
  e.preventDefault();
}

function onVpTouchMove(e) {
  e.preventDefault();
  if (e.touches.length === 1 && vp.dragging) {
    var t = e.touches[0];
    vp.tx = vp.dragTX + (t.clientX - vp.dragStartX);
    vp.ty = vp.dragTY + (t.clientY - vp.dragStartY);
    applyVpTransform();
  } else if (e.touches.length === 2) {
    var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                       e.touches[0].clientY - e.touches[1].clientY);
    vp.scale = Math.max(0.1, Math.min(8, _scaleAtPinch * d / _touchDist));
    applyVpTransform();
  }
}

function onVpTouchEnd() { vp.dragging = false; }

// ── COORDS ─────────────────────────────────────────────
function vpClientToImage(cx, cy) {
  var viewport = document.getElementById('imageViewport');
  var rect = viewport.getBoundingClientRect();
  var vw = viewport.clientWidth, vh = viewport.clientHeight;
  var stageX = (cx - rect.left) - (vw / 2 + vp.tx - vp.imgW * vp.scale / 2);
  var stageY = (cy - rect.top)  - (vh / 2 + vp.ty - vp.imgH * vp.scale / 2);
  var imgX = stageX / vp.scale, imgY = stageY / vp.scale;
  if (imgX < 0 || imgY < 0 || imgX > vp.imgW || imgY > vp.imgH) return null;
  return { x: imgX, y: imgY };
}

// ── SELECTION ──────────────────────────────────────────
function drawSelRect(sel) {
  var sc = document.getElementById('selCanvas');
  var ctx = sc.getContext('2d');
  ctx.clearRect(0, 0, sc.width, sc.height);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, sc.width, sc.height);
  ctx.clearRect(sel.x, sel.y, sel.w, sel.h);
  ctx.strokeStyle = '#d4a842'; ctx.lineWidth = 2; ctx.setLineDash([6, 3]);
  ctx.strokeRect(sel.x, sel.y, sel.w, sel.h);
  ctx.fillStyle = '#d4a842';
  [[sel.x,sel.y],[sel.x+sel.w,sel.y],[sel.x,sel.y+sel.h],[sel.x+sel.w,sel.y+sel.h]].forEach(function(pt){
    ctx.fillRect(pt[0]-4, pt[1]-4, 8, 8);
  });
}

function clearSelCanvas() {
  var sc = document.getElementById('selCanvas');
  if (sc) sc.getContext('2d').clearRect(0, 0, sc.width, sc.height);
}

function clearSelection() {
  vp.sel = null; vp.selStart = null; clearSelCanvas();
  document.getElementById('btnRecognizeSel').style.display = 'none';
  document.getElementById('btnClearSel').style.display = 'none';
}

// ── WORD HIGHLIGHT ─────────────────────────────────────
function showWordHighlight(bbox) {
  if (!bbox) return;
  var wh = document.getElementById('wordHighlight');
  wh.style.left   = bbox.x0 + 'px'; wh.style.top    = bbox.y0 + 'px';
  wh.style.width  = (bbox.x1 - bbox.x0) + 'px';
  wh.style.height = (bbox.y1 - bbox.y0) + 'px';
  wh.style.display = 'block';
  wh.classList.remove('visible');
  void wh.offsetWidth;
  wh.classList.add('visible');
  setTimeout(function(){ wh.classList.remove('visible'); }, 2200);
}

function clearHighlight() {
  var wh = document.getElementById('wordHighlight');
  if (wh) { wh.classList.remove('visible'); wh.style.display = 'none'; }
}

// ── FILTERS ────────────────────────────────────────────
function applyImgFilter() {
  var b = document.getElementById('sliderBright').value;
  var c = document.getElementById('sliderContrast').value;
  var f = 'brightness(' + b + '%) contrast(' + c + '%)';
  var img = document.getElementById('docImageEl');
  var cv  = document.getElementById('docCanvas');
  if (img) img.style.filter = f;
  if (cv)  cv.style.filter  = f;
}

function updateSliderLabel(sliderId, labelId, neutral) {
  var val = parseInt(document.getElementById(sliderId).value);
  var lbl = document.getElementById(labelId);
  if (!lbl) return;
  lbl.textContent = val + '%';
  lbl.classList.toggle('changed', val !== neutral);
}

// ── PIPELINE UI ────────────────────────────────────────
function pipelineShow()  { document.getElementById('pipelineBar').classList.add('visible'); }
function pipelineHide()  { document.getElementById('pipelineBar').classList.remove('visible'); }
function pipelineReset() { ['ocr','hw','abbr'].forEach(function(s){ pipelineSet(s,'idle'); }); pipelineMsg(''); }
function pipelineSet(stage, state) {
  var el = document.getElementById('ps-' + stage);
  if (!el) return;
  el.classList.remove('active','done');
  if (state === 'active') el.classList.add('active');
  if (state === 'done')   el.classList.add('done');
}
function pipelineMsg(msg) {
  var el = document.getElementById('pipelineMsg');
  if (el) el.textContent = msg;
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
  var btn = document.getElementById('recognizeBtn');
  btn.disabled = true;
  pipelineShow(); pipelineReset();
  showTextState('loading');
  try {
    var words = await runPipeline(currentDocId, currentPage, null);
    var doc = uploadedDocs[currentDocId];
    if (doc && doc.pageWords) doc.pageWords[currentPage] = words;
    markThumbDone(currentPage);
    renderWords(words, currentPage);
    updateStats();
  } catch(e) {
    showTextState('empty');
    showToast('❌ ' + e.message, 5000);
    console.error(e);
  } finally {
    btn.disabled = false;
    pipelineHide();
  }
}

async function recognizeAllPages() {
  var doc = uploadedDocs[currentDocId];
  if (!doc || !doc.pages) { await recognizeCurrentPage(); return; }
  var btn = document.getElementById('recognizeAllBtn');
  btn.disabled = true;
  var n = doc.pages.length;
  showToast('⚡ Распознаю ' + n + ' страниц…', 30000);
  for (var i = 0; i < n; i++) {
    await goToPage(i);
    pipelineShow(); pipelineReset(); showTextState('loading');
    try {
      var words = await runPipeline(currentDocId, i, null);
      doc.pageWords[i] = words; markThumbDone(i);
      if (i === currentPage) renderWords(words, i);
    } catch(e) { console.warn('Page', i, e.message); }
    pipelineHide();
  }
  btn.disabled = false;
  showToast('✅ Все страницы распознаны');
  updateStats();
}

async function recognizeSelection() {
  if (!vp.sel || vp.sel.w < 4 || vp.sel.h < 4) { showToast('⚠️ Сначала выделите область'); return; }
  var doc = uploadedDocs[currentDocId];
  if (!doc || !doc.pages) return;

  var sel  = vp.sel, page = doc.pages[currentPage];
  var cv   = document.createElement('canvas');
  cv.width = Math.round(sel.w); cv.height = Math.round(sel.h);
  var img  = new Image();
  img.src  = page.dataUrl;
  await new Promise(function(r){ img.onload = r; if (img.complete) r(); });
  cv.getContext('2d').drawImage(img, sel.x, sel.y, sel.w, sel.h, 0, 0, sel.w, sel.h);
  var croppedUrl = cv.toDataURL('image/jpeg', 0.95);

  var btn = document.getElementById('recognizeBtn');
  btn.disabled = true;
  pipelineShow(); pipelineReset(); showTextState('loading');

  try {
    var origPage = doc.pages[currentPage];
    doc.pages[currentPage] = { dataUrl: croppedUrl, mediaType: 'image/jpeg',
                                naturalW: sel.w, naturalH: sel.h };
    var words = await runPipeline(currentDocId, currentPage, sel);
    doc.pages[currentPage] = origPage;

    var existing = (doc.pageWords && doc.pageWords[currentPage]) || [];
    doc.pageWords[currentPage] = existing.concat(words);
    renderWords(doc.pageWords[currentPage], currentPage);
    clearSelection();
    showToast('✅ Область распознана: ' + words.length + ' слов');
  } catch(e) {
    showTextState(doc.pageWords && doc.pageWords[currentPage] ? 'result' : 'empty');
    showToast('❌ ' + e.message, 5000);
  } finally {
    btn.disabled = false;
    pipelineHide();
  }
}

// ── PIPELINE ───────────────────────────────────────────
async function runPipeline(docId, pageIdx, cropSel) {
  var doHW   = document.getElementById('stageHW').checked;
  var doAbbr = document.getElementById('stageAbbr').checked;

  // ШАГ 1: OCR через HuggingFace Space
  pipelineSet('ocr', 'active'); pipelineMsg('OCR (Qwen AI)…');
  setLoadingMsg('OCR-распознавание…', 'Qwen2.5-VL на HuggingFace');
  var words = await runHuggingFaceOCR(docId, pageIdx);
  pipelineSet('ocr', 'done');

  // ШАГ 2: База почерков (локально)
  pipelineSet('hw', 'active'); pipelineMsg('База почерков…');
  setLoadingMsg('База почерков', 'Коррекция по словарю рукописных форм');
  await sleep(150);
  if (doHW) words = applyHandwritingDB(words);
  pipelineSet('hw', 'done');

  // ШАГ 3: Сокращения (локально)
  pipelineSet('abbr', 'active'); pipelineMsg('Сокращения…');
  setLoadingMsg('База сокращений', 'Расшифровка устаревших сокращений');
  await sleep(120);
  if (doAbbr) words = applyAbbreviations(words);
  pipelineSet('abbr', 'done');
  pipelineMsg('Готово ✓');

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
  document.getElementById('textPanelTitle').textContent =
    'Стр. ' + (pageIdx + 1) + ' — ' + words.length + ' слов';

  var counts = { ocr: 0, hwdb: 0, abbr: 0, uncertain: 0 };
  words.forEach(function(w){ if (counts[w.source] !== undefined) counts[w.source]++; });
  document.getElementById('pageStats').textContent =
    'OCR:' + counts.ocr + ' · Почерк:' + counts.hwdb + ' · Сокр:' + counts.abbr + ' · ?:' + counts.uncertain;

  var srcClass = { ocr: 'ocr', hwdb: 'hwdb', abbr: 'abbr', uncertain: 'uncertain' };
  var para = document.createElement('p');
  para.style.marginBottom = '12px';

  words.forEach(function(w, idx) {
    var span = document.createElement('span');
    span.className = 'tw tw-' + (srcClass[w.source] || 'ocr');
    span.dataset.idx  = idx;
    span.dataset.conf = w.confidence;
    span.dataset.src  = w.source;
    span.textContent  = w.word;
    if (w.bbox) span.dataset.bbox = JSON.stringify(w.bbox);

    span.onclick = (function(i, bbox){ return function(){ selectWord(i, bbox); }; })(idx, w.bbox);

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

// ── WORD → IMAGE SYNC ──────────────────────────────────
function selectWord(idx, bbox) {
  document.querySelectorAll('.tw').forEach(function(el){ el.classList.remove('sel'); });
  var el = document.querySelector('[data-idx="' + idx + '"]');
  if (el) { el.classList.add('sel'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }

  if (bbox) {
    showWordHighlight(bbox);
  } else if (el && el.dataset.bbox) {
    try { showWordHighlight(JSON.parse(el.dataset.bbox)); } catch(e) {}
  } else {
    // Приблизительное позиционирование по индексу
    var all  = document.querySelectorAll('.tw').length;
    var frac = idx / Math.max(all - 1, 1);
    showWordHighlight({
      x0: Math.round(vp.imgW * 0.05), y0: Math.round(vp.imgH * (0.08 + frac * 0.84)),
      x1: Math.round(vp.imgW * 0.80), y1: Math.round(vp.imgH * (0.08 + frac * 0.84) + vp.imgH * 0.025)
    });
  }
}

function updateConfidence(val) {
  confidenceThreshold = parseInt(val);
  document.getElementById('confVal').textContent = val + '%';
  document.querySelectorAll('.tw').forEach(function(el) {
    var conf = parseInt(el.dataset.conf);
    el.classList.remove('conf-low','conf-vlow');
    if (conf < confidenceThreshold)
      el.classList.add(conf < confidenceThreshold * 0.65 ? 'conf-vlow' : 'conf-low');
  });
}

function copyRecognizedText() {
  var words = Array.from(document.querySelectorAll('.tw')).map(function(el){ return el.textContent; });
  if (!words.length) { showToast('⚠️ Нет текста'); return; }
  navigator.clipboard.writeText(words.join(' ')).then(function(){ showToast('📋 Скопировано'); });
}

// ── MODE ───────────────────────────────────────────────
function setMode(m) {
  vp.mode = m;
  var viewport = document.getElementById('imageViewport');
  viewport.classList.toggle('mode-pan',    m === 'pan');
  viewport.classList.toggle('mode-select', m === 'select');
  document.getElementById('btnModePan').classList.toggle('active',    m === 'pan');
  document.getElementById('btnModeSelect').classList.toggle('active', m === 'select');
  if (m === 'pan') clearSelection();
}

// ════════════════════════════════════════════════════════
//  dashboard.js — Загрузка файлов, архив, экспорт, пакет
// ════════════════════════════════════════════════════════

// ── ГЛОБАЛЬНОЕ СОСТОЯНИЕ ───────────────────────────────
var uploadedDocs   = {};   // { docId: { file, name, type, dataUrl, pages, pageWords } }
var currentDocId   = null;
var currentPage    = 0;
var archiveItems   = [];   // { docId, name, date, pages, text, pageWords }
var exportHistory  = [];   // { id, name, format, date, url }
var batchRunning   = false;
var batchCancelled = false;
var batchSkipped   = new Set();

// ── ВСПОМОГАТЕЛЬНЫЕ ───────────────────────────────────
function sleep(ms) { return new Promise(function(r){ setTimeout(r, ms); }); }

function svgToBase64(svgEl) {
  return new Promise(function(res, rej) {
    var data = new XMLSerializer().serializeToString(svgEl);
    var cv   = document.createElement('canvas');
    cv.width = 500; cv.height = 680;
    var img  = new Image();
    var blob = new Blob([data], { type: 'image/svg+xml' });
    var url  = URL.createObjectURL(blob);
    img.onload  = function(){ cv.getContext('2d').drawImage(img, 0, 0); URL.revokeObjectURL(url); res(cv.toDataURL('image/png').split(',')[1]); };
    img.onerror = rej;
    img.src = url;
  });
}

// ── ПАНЕЛИ ДАШБОРДА ────────────────────────────────────
function switchDashPanel(panel) {
  ['docs', 'archive', 'export', 'batch'].forEach(function(p) {
    var el  = document.getElementById('panel-' + p);
    var nav = document.getElementById('nav-' + p);
    if (el)  el.style.display  = (p === panel) ? 'flex' : 'none';
    if (nav) nav.classList.toggle('active', p === panel);
  });
  if (panel === 'archive') renderArchive();
  if (panel === 'export')  renderExportHistory();
  if (panel === 'batch')   renderBatchQueue();
}

// ── СТАТИСТИКА ─────────────────────────────────────────
function updateStats() {
  var docs  = Object.keys(uploadedDocs).length;
  var pages = 0;
  Object.keys(uploadedDocs).forEach(function(id) {
    var d = uploadedDocs[id];
    if (d && d.pageWords) d.pageWords.forEach(function(pw){ if (pw) pages++; });
  });
  var st = document.getElementById('statTotal');
  var sr = document.getElementById('statReady');
  var sp = document.getElementById('statPages');
  if (st) st.textContent = docs;
  if (sr) sr.textContent = archiveItems.length;
  if (sp) sp.textContent = pages;
  var runBtn = document.getElementById('batchRunBtn');
  if (runBtn && !batchRunning) runBtn.disabled = (docs === 0);
}

// ── ЗАГРУЗКА ФАЙЛОВ ────────────────────────────────────
var ACCEPTED = ['image/jpeg', 'image/png', 'application/pdf', 'image/tiff'];
var MAX_MB   = 50;

function handleFileInputChange(e) {
  processFiles(Array.from(e.target.files));
  e.target.value = '';
}

function processFiles(files) {
  files.filter(function(f) {
    if (!ACCEPTED.includes(f.type)) { showToast('Формат не поддерживается: ' + f.name); return false; }
    if (f.size > MAX_MB * 1024 * 1024) { showToast('Файл слишком большой: ' + f.name); return false; }
    return true;
  }).forEach(addFileCard);
}

function addFileCard(file) {
  var id     = 'doc-' + Date.now() + Math.random().toString(36).slice(2, 6);
  var sizeMB = (file.size / 1024 / 1024).toFixed(1);
  var ext    = file.name.split('.').pop().toUpperCase();
  var isPdf  = file.type === 'application/pdf';

  uploadedDocs[id] = { file: file, name: file.name, type: file.type, dataUrl: null, pages: null, pageWords: null };

  var grid = document.getElementById('docGrid');
  var card = document.createElement('div');
  card.className = 'doc-card';
  card.id = id;
  card.innerHTML =
    '<div class="doc-thumb" id="thumb-' + id + '">' + (isPdf ? 'PDF' : ' ') +
    '<div class="doc-status-badge status-processing" id="badge-' + id + '">Загрузка…</div></div>' +
    '<div class="doc-info"><div class="doc-name" title="' + file.name + '">' + file.name + '</div>' +
    '<div class="doc-meta">' + ext + ' · ' + sizeMB + ' МБ</div>' +
    '<div class="progress-bar" id="pb-' + id + '" style="margin-top:8px">' +
    '<div class="progress-fill" id="pf-' + id + '" style="width:0%"></div></div></div>';
  grid.insertBefore(card, grid.firstChild);
  updateStats();

  var reader = new FileReader();
  reader.onload = function(e2) {
    uploadedDocs[id].dataUrl = e2.target.result;
    if (!isPdf) {
      var t = document.getElementById('thumb-' + id);
      if (t) { t.style.background = 'url(' + e2.target.result + ') center/cover no-repeat'; t.childNodes[0].textContent = ''; }
    }
    animateCard(id, file);
  };
  reader.readAsDataURL(file);
}

function animateCard(id, file) {
  var steps = [
    { label: 'Читаю файл…',    pct: 30,  delay: 300 },
    { label: 'Декодирование…', pct: 65,  delay: 900 },
    { label: 'Готово к OCR',   pct: 100, delay: 1600 }
  ];
  steps.forEach(function(step) {
    setTimeout(function() {
      var pf    = document.getElementById('pf-' + id);
      var badge = document.getElementById('badge-' + id);
      var card  = document.getElementById(id);
      if (pf) pf.style.width = step.pct + '%';
      if (step.pct < 100) {
        if (badge) badge.textContent = step.label;
      } else {
        if (badge) { badge.textContent = 'Готово к OCR'; badge.className = 'doc-status-badge status-queue'; }
        var pb = document.getElementById('pb-' + id);
        if (pb) pb.style.display = 'none';
        if (card) {
          card.onclick = (function(i){ return function(){ openEditor(i); }; })(id);
          card.style.cursor = 'pointer';
        }
        showToast(file.name.slice(0, 24) + ' — нажмите для распознавания');
        updateStats();
        renderBatchQueue();
      }
    }, step.delay);
  });
}

// ── DRAG & DROP ────────────────────────────────────────
(function initDnD() {
  window.addEventListener('DOMContentLoaded', function() {
    var zone = document.getElementById('uploadZone');
    if (!zone) return;

    zone.addEventListener('dragenter', function(e) {
      e.preventDefault();
      zone.classList.add('drag-over');
      document.getElementById('dropLabel').style.display = 'block';
      document.getElementById('uploadBtnLabel').style.display = 'none';
    });
    zone.addEventListener('dragover', function(e) { e.preventDefault(); });
    zone.addEventListener('dragleave', function(e) {
      if (!zone.contains(e.relatedTarget)) {
        zone.classList.remove('drag-over');
        document.getElementById('dropLabel').style.display = 'none';
        document.getElementById('uploadBtnLabel').style.display = 'inline-block';
      }
    });
    zone.addEventListener('drop', function(e) {
      e.preventDefault();
      zone.classList.remove('drag-over');
      document.getElementById('dropLabel').style.display = 'none';
      document.getElementById('uploadBtnLabel').style.display = 'inline-block';
      processFiles(Array.from(e.dataTransfer.files));
    });
    document.addEventListener('dragover', function(e) { e.preventDefault(); });
    document.addEventListener('drop', function(e) {
      e.preventDefault();
      var dash = document.getElementById('screen-dashboard');
      if (dash && dash.classList.contains('active')) processFiles(Array.from(e.dataTransfer.files));
    });
  });
})();

// ── АРХИВ ──────────────────────────────────────────────
function saveToArchive() {
  var doc = uploadedDocs[currentDocId];
  if (!doc) { showToast('Нет открытого документа'); return; }
  var words = doc.pageWords ? doc.pageWords.filter(Boolean) : [];
  if (!words.length) { showToast('Сначала распознайте документ'); return; }

  var fullText = words.map(function(pw) {
    return pw.map(function(w){ return w.word; }).join(' ');
  }).join('\n\n--- Страница ---\n\n');

  var existing = archiveItems.findIndex(function(a){ return a.docId === currentDocId; });
  var item = { docId: currentDocId, name: doc.name, date: new Date().toLocaleString('ru-RU'),
               pages: words.length, text: fullText, pageWords: doc.pageWords };

  if (existing >= 0) { archiveItems[existing] = item; showToast('Архив обновлён: ' + doc.name); }
  else               { archiveItems.unshift(item);    showToast('Сохранено в архив: ' + doc.name); }
  updateStats();
}

function renderArchive() {
  var list  = document.getElementById('archiveList');
  var empty = document.getElementById('archiveEmpty');
  if (!archiveItems.length) {
    empty.style.display = 'flex'; list.style.display = 'none'; return;
  }
  empty.style.display = 'none'; list.style.display = 'block';
  list.innerHTML = '';
  archiveItems.forEach(function(item) {
    var row = document.createElement('div');
    row.className = 'doc-list-item'; row.style.cursor = 'default';
    row.innerHTML =
      '<div class="doc-list-icon" style="font-size:12px;font-weight:600;color:var(--muted);">TXT</div>' +
      '<div class="doc-list-info"><div class="doc-list-name">' + item.name + '</div>' +
      '<div class="doc-list-meta">' + item.pages + ' стр. · ' + item.date + '</div></div>' +
      '<div style="display:flex;gap:8px;">' +
      '<button type="button" class="doc-list-action" onclick="archiveDownloadTxt(\'' + item.docId + '\')">↓ TXT</button>' +
      '<button type="button" class="doc-list-action" style="background:var(--error);color:white;" ' +
        'onclick="archiveDelete(\'' + item.docId + '\')">✕</button></div>';
    list.appendChild(row);
  });
}

function archiveDownloadTxt(docId) {
  var item = archiveItems.find(function(a){ return a.docId === docId; });
  if (!item) return;
  var blob = new Blob([item.text], { type: 'text/plain;charset=utf-8' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href = url; a.download = item.name.replace(/\.[^.]+$/, '') + '_распознано.txt'; a.click();
  addExportHistory(item.name, 'TXT', url);
  showToast('Скачан TXT из архива');
}

function archiveDelete(docId) {
  archiveItems = archiveItems.filter(function(a){ return a.docId !== docId; });
  renderArchive(); updateStats(); showToast('Удалено из архива');
}

function archiveExportAll() {
  if (!archiveItems.length) { showToast('Архив пуст'); return; }
  archiveItems.forEach(function(item){ archiveDownloadTxt(item.docId); });
}

// ── ИСТОРИЯ ЭКСПОРТА ────────────────────────────────────
var exportIcons = { TXT: 'TXT', DOCX: 'DOC', PDF: 'PDF' };

function addExportHistory(name, format, url) {
  exportHistory.unshift({ id: Date.now(), name: name, format: format,
                          date: new Date().toLocaleString('ru-RU'), url: url });
  updateStats();
}

function renderExportHistory() {
  var list  = document.getElementById('exportHistoryList');
  var empty = document.getElementById('exportEmpty');
  if (!exportHistory.length) { empty.style.display = 'flex'; list.innerHTML = ''; return; }
  empty.style.display = 'none';
  list.innerHTML = '';
  exportHistory.forEach(function(item) {
    var row = document.createElement('div');
    row.className = 'doc-list-item';
    row.innerHTML =
      '<div class="doc-list-icon" style="font-size:12px;font-weight:600;color:var(--muted);">' + (exportIcons[item.format] || 'FILE') + '</div>' +
      '<div class="doc-list-info"><div class="doc-list-name">' + item.name + '</div>' +
      '<div class="doc-list-meta">' + item.format + ' · ' + item.date + '</div></div>' +
      '<a class="doc-list-action" href="' + item.url + '" download>↓ Скачать</a>';
    list.appendChild(row);
  });
}

function clearExportHistory() {
  exportHistory = []; renderExportHistory(); showToast('История экспорта очищена');
}

// ── ПАКЕТНАЯ ОБРАБОТКА ─────────────────────────────────
function renderBatchQueue() {
  var ids    = Object.keys(uploadedDocs);
  var qEl    = document.getElementById('batchQueue');
  var empty  = document.getElementById('batchQueueEmpty');
  var runBtn = document.getElementById('batchRunBtn');
  if (!ids.length) {
    empty.style.display = 'block'; qEl.style.display = 'none';
    if (runBtn) runBtn.disabled = true; return;
  }
  empty.style.display = 'none'; qEl.style.display = 'block';
  if (runBtn) runBtn.disabled = batchRunning;
  qEl.innerHTML = '';

  ids.forEach(function(id) {
    var doc       = uploadedDocs[id];
    var donePages = doc.pageWords ? doc.pageWords.filter(Boolean).length : 0;
    var totalPages= doc.pages ? doc.pages.length : '?';
    var isSkipped = batchSkipped.has(id);
    var isRunning = batchRunning && currentDocId === id;

    var statusText, statusColor;
    if (isSkipped)      { statusText = '⊘ Пропущен';   statusColor = 'var(--muted)'; }
    else if (isRunning) { statusText = 'Обработка…';   statusColor = 'var(--warning)'; }
    else if (donePages > 0 && donePages >= (doc.pages ? doc.pages.length : 1))
                        { statusText = 'Готово — ' + donePages + '/' + totalPages + ' стр.'; statusColor = 'var(--success)'; }
    else if (donePages > 0)
                        { statusText = donePages + '/' + totalPages + ' стр.'; statusColor = 'var(--warning)'; }
    else                { statusText = 'Ожидает';      statusColor = 'var(--muted)'; }

    var row = document.createElement('div');
    row.id = 'batch-row-' + id;
    row.style.cssText = 'display:flex;align-items:center;gap:14px;padding:12px 20px;border-bottom:1px solid var(--border);' + (isSkipped ? 'opacity:0.45;' : '');
    row.innerHTML =
      '<div style="font-size:12px;font-weight:600;color:var(--muted);flex-shrink:0;">' + (doc.type === 'application/pdf' ? 'PDF' : 'IMG') + '</div>' +
      '<div style="flex:1;min-width:0;">' +
      '<div style="font-size:13px;font-weight:500;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + doc.name + '</div>' +
      '<div style="font-size:11px;color:' + statusColor + ';margin-top:2px;" id="batch-status-' + id + '">' + statusText + '</div>' +
      '<div class="progress-bar" id="batch-pb-' + id + '" style="margin-top:6px;display:none;">' +
      '<div class="progress-fill" id="batch-pf-' + id + '" style="width:0%"></div></div></div>' +
      '<button type="button" onclick="batchSkipDoc(\'' + id + '\')" ' +
        'style="width:26px;height:26px;flex-shrink:0;background:none;border:1px solid var(--border);border-radius:4px;cursor:pointer;font-size:13px;color:var(--muted);">⊘</button>' +
      '<button type="button" onclick="openEditor(\'' + id + '\')" ' +
        'style="padding:5px 12px;background:var(--primary);color:white;border:none;border-radius:var(--radius);font-size:11px;cursor:pointer;flex-shrink:0;">Открыть</button>';
    qEl.appendChild(row);
  });
}

function batchSkipDoc(id) { batchSkipped.add(id); renderBatchQueue(); }
function cancelBatch() { if (batchRunning) { batchCancelled = true; showToast('Отмена…', 2000); } }

async function runBatchAll() {
  var ids = Object.keys(uploadedDocs);
  if (!ids.length) { showToast('⚠️ Нет документов'); return; }

  batchRunning = true; batchCancelled = false;
  var runBtn = document.getElementById('batchRunBtn');
  var cancelBtn = document.getElementById('batchCancelBtn');
  if (runBtn)    { runBtn.disabled = true; runBtn.textContent = 'Обработка…'; }
  if (cancelBtn) cancelBtn.style.display = 'inline-flex';

  var processed = 0;

  for (var i = 0; i < ids.length; i++) {
    if (batchCancelled) break;
    var id  = ids[i];
    var doc = uploadedDocs[id];
    if (batchSkipped.has(id)) continue;

    var statusEl = document.getElementById('batch-status-' + id);
    if (statusEl) { statusEl.textContent = 'Обработка…'; statusEl.style.color = 'var(--warning)'; }
    currentDocId = id;

    try {
      if (!doc.pages) await initPages(id);
      var n = doc.pages ? doc.pages.length : 1;
      if (!doc.pageWords) doc.pageWords = new Array(n).fill(null);

      for (var p = 0; p < n; p++) {
        if (batchCancelled || batchSkipped.has(id)) break;
        currentPage = p;
        pipelineShow(); pipelineReset();
        var words = await runPipeline(id, p, null);
        doc.pageWords[p] = words;
        var done = doc.pageWords.filter(Boolean).length;
        var pf = document.getElementById('batch-pf-' + id);
        var pb = document.getElementById('batch-pb-' + id);
        if (pf) pf.style.width = Math.round(done / n * 100) + '%';
        if (pb) pb.style.display = 'block';
        pipelineHide();
      }

      if (!batchCancelled && !batchSkipped.has(id)) {
        if (statusEl) { statusEl.textContent = 'Готово — ' + n + ' стр.'; statusEl.style.color = 'var(--success)'; }
        processed++;
      }
    } catch(e) {
      if (statusEl) { statusEl.textContent = e.message; statusEl.style.color = 'var(--error)'; }
      pipelineHide();
    }
  }

  batchRunning = false; batchCancelled = false; batchSkipped.clear();
  if (runBtn)    { runBtn.disabled = false; runBtn.textContent = 'Запустить все'; }
  if (cancelBtn) cancelBtn.style.display = 'none';
  updateStats(); renderBatchQueue();
  showToast('Пакетная обработка завершена — ' + processed + ' документов');
}

// ── ЭКСПОРТ TXT ────────────────────────────────────────
function exportTxt() {
  var words = Array.from(document.querySelectorAll('.tw'));
  if (!words.length) { showToast('Нет текста'); return; }
  var docName = currentDocId && uploadedDocs[currentDocId]
    ? uploadedDocs[currentDocId].name.replace(/\.[^.]+$/, '') : 'документ';
  var lines = [], line = [];
  words.forEach(function(w) {
    line.push(w.textContent);
    var next = words[words.indexOf(w) + 1];
    if (!next || next.parentElement !== w.parentElement) { lines.push(line.join(' ')); line = []; }
  });
  if (line.length) lines.push(line.join(' '));
  var blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  var url  = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = docName + '_распознано.txt'; a.click();
  addExportHistory(docName + '.txt', 'TXT', url);
  showToast('Скачан TXT');
}

// ── ЭКСПОРТ DOCX ───────────────────────────────────────
function exportDocx() {
  var words = Array.from(document.querySelectorAll('.tw'));
  if (!words.length) { showToast('Нет текста'); return; }
  var docName = currentDocId && uploadedDocs[currentDocId]
    ? uploadedDocs[currentDocId].name.replace(/\.[^.]+$/, '') : 'документ';

  function xmlEsc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function colorForSrc(src, conf) {
    if (src === 'uncertain' || conf < 40) return 'C0392B';
    if (src === 'hwdb') return '1565C0';
    if (src === 'abbr') return '6A1B9A';
    return null;
  }

  var paragraphs = [], curLine = [];
  words.forEach(function(w) {
    curLine.push({ text: w.textContent, src: w.dataset.src || 'ocr', conf: parseInt(w.dataset.conf) || 90 });
    var next = words[words.indexOf(w) + 1];
    if (!next || next.parentElement !== w.parentElement) { paragraphs.push(curLine.slice()); curLine = []; }
  });
  if (curLine.length) paragraphs.push(curLine);

  var bodyXml = paragraphs.map(function(para) {
    if (!para.length) return '<w:p/>';
    var runs = para.map(function(w, i) {
      var color = colorForSrc(w.src, w.conf);
      var colorTag = color ? '<w:color w:val="' + color + '"/>' : '';
      var text = xmlEsc(i > 0 ? ' ' + w.text : w.text);
      return '<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>' +
             '<w:sz w:val="24"/>' + colorTag + '</w:rPr>' +
             '<w:t xml:space="preserve">' + text + '</w:t></w:r>';
    }).join('');
    return '<w:p><w:pPr><w:spacing w:line="360" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr>' + runs + '</w:p>';
  }).join('');

  var documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body>' + bodyXml +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701"/></w:sectPr>' +
    '</w:body></w:document>';

  var relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>';

  var wordRelsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';

  var stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:docDefaults><w:rPrDefault><w:rPr>' +
    '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>' +
    '<w:sz w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>';

  var contentTypesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '</Types>';

  buildDocxZip({
    '[Content_Types].xml':          contentTypesXml,
    '_rels/.rels':                  relsXml,
    'word/document.xml':            documentXml,
    'word/styles.xml':              stylesXml,
    'word/_rels/document.xml.rels': wordRelsXml
  }, docName + '_распознано.docx', 'DOCX', docName);
}

function buildDocxZip(files, filename, format, docName) {
  var enc = new TextEncoder(), centralDir = [], parts = [], offset = 0;
  function u16(n){ var b=new Uint8Array(2); b[0]=n&0xFF; b[1]=(n>>8)&0xFF; return b; }
  function u32(n){ var b=new Uint8Array(4); b[0]=n&0xFF; b[1]=(n>>8)&0xFF; b[2]=(n>>16)&0xFF; b[3]=(n>>24)&0xFF; return b; }
  function concat(){
    var args=Array.from(arguments), len=args.reduce(function(a,b){return a+b.length;},0);
    var out=new Uint8Array(len), pos=0;
    args.forEach(function(a){ out.set(a,pos); pos+=a.length; }); return out;
  }
  var CRC_TABLE=(function(){ var t=new Uint32Array(256); for(var i=0;i<256;i++){ var c=i; for(var j=0;j<8;j++) c=(c&1)?0xEDB88320^(c>>>1):c>>>1; t[i]=c; } return t; })();
  function crc32(data){ var crc=0xFFFFFFFF; for(var i=0;i<data.length;i++) crc=(crc>>>8)^CRC_TABLE[(crc^data[i])&0xFF]; return (crc^0xFFFFFFFF)>>>0; }

  Object.keys(files).forEach(function(name) {
    var nameBytes=enc.encode(name), data=enc.encode(files[name]), crc=crc32(data);
    var localHdr=concat(new Uint8Array([0x50,0x4B,0x03,0x04]),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(nameBytes.length),u16(0),nameBytes,data);
    centralDir.push({name:nameBytes,crc:crc,size:data.length,offset:offset});
    parts.push(localHdr); offset+=localHdr.length;
  });
  var cdStart=offset;
  var cdParts=centralDir.map(function(e){ return concat(new Uint8Array([0x50,0x4B,0x01,0x02]),u16(20),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(e.crc),u32(e.size),u32(e.size),u16(e.name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(e.offset),e.name); });
  var cdSize=cdParts.reduce(function(a,b){return a+b.length;},0);
  var n16=centralDir.length;
  var eocd=concat(new Uint8Array([0x50,0x4B,0x05,0x06]),u16(0),u16(0),u16(n16),u16(n16),u32(cdSize),u32(cdStart),u16(0));
  var allParts=parts.concat(cdParts).concat([eocd]);
  var totalLen=allParts.reduce(function(a,b){return a+b.length;},0);
  var zip=new Uint8Array(totalLen); var pos2=0;
  allParts.forEach(function(p){ zip.set(p,pos2); pos2+=p.length; });
  var blob=new Blob([zip],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a'); a.href=url; a.download=filename; a.click();
  addExportHistory(docName, format, url);
  showToast('✅ Скачан DOCX');
}

// ── ЭКСПОРТ PDF ────────────────────────────────────────
function exportPdf() {
  var words = Array.from(document.querySelectorAll('.tw'));
  if (!words.length) { showToast('⚠️ Нет текста'); return; }
  var docName = currentDocId && uploadedDocs[currentDocId]
    ? uploadedDocs[currentDocId].name.replace(/\.[^.]+$/, '') : 'документ';

  function colorForSrc(src, conf) {
    if (src === 'uncertain' || conf < 40) return '#c0392b';
    if (src === 'hwdb') return '#1565C0';
    if (src === 'abbr') return '#6A1B9A';
    return '#111';
  }
  function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  var paragraphs = [], curLine = [];
  words.forEach(function(w) {
    curLine.push({ text: w.textContent, src: w.dataset.src || 'ocr', conf: parseInt(w.dataset.conf) || 90 });
    var next = words[words.indexOf(w) + 1];
    if (!next || next.parentElement !== w.parentElement) { paragraphs.push(curLine.slice()); curLine = []; }
  });
  if (curLine.length) paragraphs.push(curLine);

  var bodyHtml = paragraphs.map(function(para) {
    if (!para.length) return '<p>&nbsp;</p>';
    return '<p>' + para.map(function(w) {
      return '<span style="color:' + colorForSrc(w.src, w.conf) + '">' + esc(w.text) + '</span>';
    }).join(' ') + '</p>';
  }).join('');

  var html = '<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>' + esc(docName) + '</title>' +
    '<style>body{font-family:"Times New Roman",serif;font-size:13pt;line-height:1.8;margin:2.5cm 3cm;}' +
    'h1{font-size:14pt;font-weight:bold;margin-bottom:0.3cm;}p{margin:0 0 0.2cm;text-align:justify;}' +
    '@media print{@page{size:A4;margin:2cm 2.5cm;}.no-print{display:none!important;}}</style></head><body>' +
    '<button class="no-print" onclick="window.print()" style="position:fixed;top:16px;right:16px;padding:10px 24px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;">Сохранить как PDF</button>' +
    '<h1>' + esc(docName) + '</h1>' + bodyHtml +
    '<script>window.addEventListener("load",function(){window.print();});<\/script></body></html>';

  var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  var url  = URL.createObjectURL(blob);
  window.open(url, '_blank');
  addExportHistory(docName, 'PDF', url);
  showToast('📄 Откроется диалог печати — выберите «Сохранить как PDF»');
}

// ── МОДАЛЫ ─────────────────────────────────────────────
function openExport()  { document.getElementById('exportModal').classList.add('open'); }
function closeExport(e){
  if (!e || e.target === document.getElementById('exportModal'))
    document.getElementById('exportModal').classList.remove('open');
}
function saveProject() { showToast('💾 Проект сохранён'); }

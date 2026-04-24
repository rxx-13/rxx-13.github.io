// ════════════════════════════════════════════════════════
//  dashboard.js — Загрузка файлов, экспорт
// ════════════════════════════════════════════════════════

// ── ГЛОБАЛЬНОЕ СОСТОЯНИЕ ───────────────────────────────
var uploadedDocs = {};   // { docId: { file, name, type, dataUrl, pages, pageWords } }
var currentDocId = null;
var currentPage  = 0;

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
  var id = 'doc-' + Date.now() + Math.random().toString(36).slice(2, 6);
  var isPdf = file.type === 'application/pdf';
  uploadedDocs[id] = { file: file, name: file.name, type: file.type,
                       dataUrl: null, pages: null, pageWords: null };

  var list = document.getElementById('wsFileList');
  var empty = list.querySelector('.ws-file-empty');
  if (empty) empty.remove();

  var row = document.createElement('div');
  row.className = 'ws-file-row';
  row.id = id;
  row.innerHTML =
    '<div class="ws-file-thumb" id="thumb-' + id + '">' + (isPdf ? 'PDF' : '') + '</div>' +
    '<div class="ws-file-info">' +
      '<div class="ws-file-name" title="' + file.name + '">' + file.name + '</div>' +
      '<div class="ws-file-meta">' + (file.size / 1024 / 1024).toFixed(1) + ' МБ</div>' +
    '</div>';
  row.onclick = function() { selectFile(id); };
  list.insertBefore(row, list.firstChild);

  var reader = new FileReader();
  reader.onload = function(e2) {
    uploadedDocs[id].dataUrl = e2.target.result;
    if (!isPdf) {
      var t = document.getElementById('thumb-' + id);
      if (t) { t.style.background = 'url(' + e2.target.result + ') center/cover no-repeat'; t.textContent = ''; }
    }
  };
  reader.readAsDataURL(file);

  selectFile(id);
  showToast(file.name.slice(0, 28) + ' загружен');
}

function selectFile(id) {
  document.querySelectorAll('.ws-file-row').forEach(function(r) { r.classList.remove('active'); });
  var row = document.getElementById(id);
  if (row) row.classList.add('active');
  currentDocId = id;
  currentPage  = 0;
}

// ── DRAG & DROP на экран редактора ────────────────────
(function initDnD() {
  window.addEventListener('DOMContentLoaded', function() {
    document.addEventListener('dragover', function(e) { e.preventDefault(); });
    document.addEventListener('drop', function(e) {
      e.preventDefault();
      var editor = document.getElementById('screen-editor');
      if (editor && editor.classList.contains('active')) {
        processFiles(Array.from(e.dataTransfer.files));
      }
    });
  });
})();

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
  var a    = document.createElement('a');
  a.href = url; a.download = docName + '_распознано.txt'; a.click();
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
      var color    = colorForSrc(w.src, w.conf);
      var colorTag = color ? '<w:color w:val="' + color + '"/>' : '';
      var text     = xmlEsc(i > 0 ? ' ' + w.text : w.text);
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
  }, docName + '_распознано.docx');
}

function buildDocxZip(files, filename) {
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
  showToast('Скачан DOCX');
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
  showToast('Откроется диалог печати — выберите «Сохранить как PDF»');
}

// ── МОДАЛЫ ─────────────────────────────────────────────
function openExport()  { document.getElementById('exportModal').classList.add('open'); }
function closeExport(e) {
  if (!e || e.target === document.getElementById('exportModal'))
    document.getElementById('exportModal').classList.remove('open');
}

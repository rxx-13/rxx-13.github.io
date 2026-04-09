// ════════════════════════════════════════════════════════
//  auth.js — Навигация, toast
// ════════════════════════════════════════════════════════

// ── НАВИГАЦИЯ ─────────────────────────────────────────
var SCREEN_PATHS = { landing: '/', dashboard: '/home', editor: '/ocr' };

function goTo(id) {
  document.querySelectorAll('.screen').forEach(function(s) {
    s.classList.remove('active');
  });
  document.getElementById('screen-' + id).classList.add('active');
  if (id === 'dashboard') currentDocId = null;
  var path = SCREEN_PATHS[id] || '/';
  if (window.location.pathname !== path) history.pushState(null, '', path);
}

// ── TOAST ─────────────────────────────────────────────
var _toastTimer;
function showToast(msg, dur) {
  var el = document.getElementById('toastEl');
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function() { el.style.display = 'none'; }, dur || 2800);
}

// ── ИНИЦИАЛИЗАЦИЯ ─────────────────────────────────────
window.addEventListener('DOMContentLoaded', function() {
  window.addEventListener('resize', function() {
    if (typeof vp !== 'undefined' && vp.imgW) vpFit();
  });
});

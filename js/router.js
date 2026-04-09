// ════════════════════════════════════════════════════════
//  router.js — URL-маршрутизация (History API)
//  Загружается последним, после всех остальных скриптов.
// ════════════════════════════════════════════════════════

// ── Таблица маршрутов ─────────────────────────────────
var ROUTES = {
  '/':        { screen: 'dashboard', panel: 'docs' },
  '/login':   { screen: 'dashboard', panel: 'docs' },
  '/home':    { screen: 'dashboard', panel: 'docs' },
  '/archive': { screen: 'dashboard', panel: 'archive' },
  '/export':  { screen: 'dashboard', panel: 'export' },
  '/batch':   { screen: 'dashboard', panel: 'batch' },
  '/ocr':     { screen: 'editor' },
  '/profile': { screen: 'profile' }
};

var PANEL_PATHS = {
  docs:    '/home',
  archive: '/archive',
  export:  '/export',
  batch:   '/batch'
};

// Авторизация не требуется — гостевой режим по умолчанию
window._isLoggedIn      = true;
window._pendingRoute    = null;
window._currentUserName = 'Пользователь';

// ── handleRoute — читает URL, показывает нужный экран ─
function handleRoute() {
  var path  = window.location.pathname;
  var route = ROUTES[path] || ROUTES['/'];

  _showScreen(route.screen);
  if (route.screen === 'dashboard' && route.panel) {
    window._origSwitchDashPanel(route.panel);
  }
}

// ── Внутренний показ экрана (без pushState) ──────────
function _showScreen(id) {
  document.querySelectorAll('.screen').forEach(function(s) {
    s.classList.remove('active');
  });
  var t = document.getElementById('screen-' + id);
  if (t) t.classList.add('active');
  if (id === 'dashboard' && typeof currentDocId !== 'undefined') currentDocId = null;
  if (id === 'profile') _renderProfile();
}

// ── Рендер страницы профиля ───────────────────────────
function _renderProfile() {
  var name = window._currentUserName || 'Гость';
  var nameEl = document.getElementById('profileName');
  var initEl = document.getElementById('profileInit');
  var docsEl = document.getElementById('profileDocs');
  var archEl = document.getElementById('profileArchive');
  var pagesEl = document.getElementById('profilePages');
  if (nameEl)  nameEl.textContent  = name;
  if (initEl)  initEl.textContent  = name.charAt(0).toUpperCase();
  var docs  = Object.keys(uploadedDocs  || {}).length;
  var arch  = (archiveItems || []).length;
  var pages = 0;
  Object.keys(uploadedDocs || {}).forEach(function(id) {
    var d = uploadedDocs[id];
    if (d && d.pageWords) d.pageWords.forEach(function(pw){ if (pw) pages++; });
  });
  if (docsEl)  docsEl.textContent  = docs;
  if (archEl)  archEl.textContent  = arch;
  if (pagesEl) pagesEl.textContent = pages;
  document.querySelectorAll('.nav-avatar').forEach(function(a) {
    a.textContent = name.charAt(0).toUpperCase();
  });
}

// ── popstate — кнопки «Назад» / «Вперёд» в браузере ──
window.addEventListener('popstate', handleRoute);

// ── DOMContentLoaded ──────────────────────────────────
window.addEventListener('DOMContentLoaded', function() {
  // Сохраняем оригинальный switchDashPanel до обёртки
  window._origSwitchDashPanel = window.switchDashPanel;

  // Обёртка: switchDashPanel теперь обновляет URL
  window.switchDashPanel = function(panel) {
    window._origSwitchDashPanel(panel);
    var path = PANEL_PATHS[panel] || '/home';
    if (window.location.pathname !== path) {
      history.pushState(null, '', path);
    }
  };

  // GitHub Pages 404.html redirect trick:
  // 404.html кодирует путь в ?p=/home и редиректит сюда
  var params = new URLSearchParams(window.location.search);
  var redir = params.get('p');
  if (redir) {
    history.replaceState(null, '', redir);
  }

  // Начальный маршрут
  handleRoute();
});

// ════════════════════════════════════════════════════════
//  router.js — URL-маршрутизация (History API)
//  Загружается последним, после всех остальных скриптов.
// ════════════════════════════════════════════════════════

// ── Таблица маршрутов ─────────────────────────────────
var ROUTES = {
  '/':        { screen: 'landing' },
  '/home':    { screen: 'dashboard', panel: 'docs' },
  '/archive': { screen: 'dashboard', panel: 'archive' },
  '/export':  { screen: 'dashboard', panel: 'export' },
  '/batch':   { screen: 'dashboard', panel: 'batch' },
  '/ocr':     { screen: 'editor' }
};

var PANEL_PATHS = {
  docs:    '/home',
  archive: '/archive',
  export:  '/export',
  batch:   '/batch'
};

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

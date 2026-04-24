// ════════════════════════════════════════════════════════
//  router.js — URL-маршрутизация (History API)
//  Загружается последним, после всех остальных скриптов.
// ════════════════════════════════════════════════════════

var ROUTES = {
  '/':    { screen: 'landing' },
  '/ocr': { screen: 'editor' }
};

function handleRoute() {
  var path  = window.location.pathname;
  var route = ROUTES[path] || ROUTES['/'];
  _showScreen(route.screen);
}

function _showScreen(id) {
  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
  var t = document.getElementById('screen-' + id);
  if (t) t.classList.add('active');
}

window.addEventListener('popstate', handleRoute);

window.addEventListener('DOMContentLoaded', function() {
  // GitHub Pages 404.html redirect trick:
  // 404.html кодирует путь в ?p=/ocr и редиректит сюда
  var params = new URLSearchParams(window.location.search);
  var redir = params.get('p');
  if (redir) history.replaceState(null, '', redir);
  handleRoute();
});

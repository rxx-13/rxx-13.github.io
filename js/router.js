// ════════════════════════════════════════════════════════
//  router.js — Хэш-навигация
//  URL: /scriptorium/#home, /#archive, /#ocr, /#profile …
// ════════════════════════════════════════════════════════

var ROUTES = {
  '':        { screen: 'auth' },
  'login':   { screen: 'auth' },
  'home':    { screen: 'dashboard', panel: 'docs'    },
  'archive': { screen: 'dashboard', panel: 'archive' },
  'export':  { screen: 'dashboard', panel: 'export'  },
  'batch':   { screen: 'dashboard', panel: 'batch'   },
  'ocr':     { screen: 'editor'  },
  'profile': { screen: 'profile' }
};

// Публичная функция навигации — вызывай отовсюду: navigate('archive')
function navigate(hash) {
  if (window.location.hash === '#' + hash) {
    _applyRoute(hash); // принудительный рендер при повторном клике
  } else {
    window.location.hash = hash;
  }
}

function _applyRoute(hash) {
  var route = ROUTES[hash] || null;

  if (!route) {
    // Неизвестный маршрут → домой (или логин)
    navigate(window._loggedIn ? 'home' : 'login');
    return;
  }

  // Защита: неавторизованным доступ только к auth
  if (route.screen !== 'auth' && !window._loggedIn) {
    navigate('login');
    return;
  }

  _activateScreen(route.screen);

  if (route.screen === 'dashboard' && route.panel) {
    switchDashPanel(route.panel);
  }

  if (route.screen === 'profile') {
    _renderProfile();
  }
}

function _activateScreen(id) {
  document.querySelectorAll('.screen').forEach(function(s) {
    s.classList.remove('active');
  });
  var el = document.getElementById('screen-' + id);
  if (el) el.classList.add('active');
  // При уходе из редактора сбрасываем активный документ
  if (id !== 'editor') currentDocId = null;
}

function _renderProfile() {
  var name = window._currentUser || 'Гость';
  var initial = name.charAt(0).toUpperCase();

  var els = {
    avatar:   document.getElementById('profileAvatar'),
    avatarLg: document.getElementById('profileAvatarLg'),
    name:     document.getElementById('profileName'),
    docs:     document.getElementById('pStatDocs'),
    archive:  document.getElementById('pStatArchive'),
    exports:  document.getElementById('pStatExport')
  };

  if (els.avatar)   els.avatar.textContent   = initial;
  if (els.avatarLg) els.avatarLg.textContent = initial;
  if (els.name)     els.name.textContent     = name;

  // Статистика из глобальных переменных dashboard.js
  if (els.docs)    els.docs.textContent    = Object.keys(uploadedDocs || {}).length;
  if (els.archive) els.archive.textContent = (archiveItems || []).length;
  if (els.exports) els.exports.textContent = (exportHistory || []).length;
}

// ── Слушатели ──────────────────────────────────────────
window.addEventListener('hashchange', function() {
  _applyRoute(window.location.hash.replace(/^#/, ''));
});

document.addEventListener('DOMContentLoaded', function() {
  _applyRoute(window.location.hash.replace(/^#/, ''));
});

// ════════════════════════════════════════════════════════
//  auth.js — Авторизация, навигация, toast
// ════════════════════════════════════════════════════════

// ── СОСТОЯНИЕ СЕССИИ ──────────────────────────────────
window._loggedIn = false;
window._currentUser = '';

// ── НАВИГАЦИЯ ─────────────────────────────────────────
// Совместимость со старыми вызовами goTo('dashboard') / goTo('editor')
function goTo(id) {
  var map = { dashboard: 'home', editor: 'ocr', auth: 'login' };
  navigate(map[id] || id);
}

function logout() {
  window._loggedIn = false;
  window._currentUser = '';
  navigate('login');
}

function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(function(t, i) {
    t.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'register'));
  });
  document.getElementById('form-login').classList.toggle('active', tab === 'login');
  document.getElementById('form-register').classList.toggle('active', tab === 'register');
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

// ── ВАЛИДАЦИЯ ФОРМ ────────────────────────────────────
function fieldErr(id, msg) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  var inp = el.parentElement && el.parentElement.querySelector('input');
  if (inp) inp.classList.toggle('invalid', !!msg);
}

function formErr(id, msg) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('visible', !!msg);
}

function clearFormErrors(ids) {
  ids.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) { el.textContent = ''; el.classList.remove('visible'); }
  });
  document.querySelectorAll('.field input.invalid').forEach(function(el) {
    el.classList.remove('invalid');
  });
}

// ── ВХОД ──────────────────────────────────────────────
function submitLogin() {
  clearFormErrors(['loginEmailErr', 'loginPasswordErr', 'loginFormErr']);
  var email = (document.getElementById('loginEmail').value || '').trim();
  var pass  = (document.getElementById('loginPassword').value || '');
  var valid = true;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldErr('loginEmailErr', 'Введите корректный email'); valid = false;
  }
  if (!pass || pass.length < 6) {
    fieldErr('loginPasswordErr', 'Минимум 6 символов'); valid = false;
  }
  if (!valid) return;

  // Демо: любой валидный email/пароль работает
  finishLogin(email.split('@')[0]);
}

// ── РЕГИСТРАЦИЯ ────────────────────────────────────────
function submitRegister() {
  clearFormErrors(['regNameErr', 'regEmailErr', 'regPasswordErr', 'regPassword2Err', 'regFormErr']);
  var name  = (document.getElementById('regName').value || '').trim();
  var email = (document.getElementById('regEmail').value || '').trim();
  var pass  = (document.getElementById('regPassword').value || '');
  var pass2 = (document.getElementById('regPassword2').value || '');
  var valid = true;

  if (!name || name.length < 2) { fieldErr('regNameErr', 'Введите имя (мин. 2 символа)'); valid = false; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { fieldErr('regEmailErr', 'Некорректный email'); valid = false; }
  if (!pass || pass.length < 8) { fieldErr('regPasswordErr', 'Минимум 8 символов'); valid = false; }
  if (pass && pass2 !== pass)   { fieldErr('regPassword2Err', 'Пароли не совпадают'); valid = false; }
  if (!valid) return;

  finishLogin(name.split(' ')[0]);
}

// ── ВХОД КАК ГОСТЬ ────────────────────────────────────
function loginAsGuest() {
  finishLogin('Гость');
}

// ── ЗАВЕРШЕНИЕ ВХОДА ───────────────────────────────────
function finishLogin(displayName) {
  window._loggedIn = true;
  window._currentUser = displayName;

  var initial = displayName.charAt(0).toUpperCase();
  document.querySelectorAll('.nav-avatar').forEach(function(a) {
    a.textContent = initial;
  });
  var sub = document.getElementById('dashSubtitle');
  if (sub) sub.textContent = 'Добро пожаловать, ' + displayName + '!';
  navigate('home');
}

// ── ИНИЦИАЛИЗАЦИЯ КНОПОК ──────────────────────────────
window.addEventListener('DOMContentLoaded', function() {
  var guest = document.getElementById('btnGuestLogin');
  if (guest) guest.onclick = function(e) { e.preventDefault(); loginAsGuest(); };

  window.addEventListener('resize', function() {
    if (typeof vp !== 'undefined' && vp.imgW) vpFit();
  });
});

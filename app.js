/* Проверка книги «Первый шаг в сметное дело», версия 2: одна страница книги на экране.
   Без библиотек и сборки. Данные: window.BOOK (data.js). */
(function () {
'use strict';

var BOOK = window.BOOK;
var CODE_HASH = '6643937a9f491b9f36f443348d80b62a998468c30140e9ad2d5eab07ab3580bd'; // SHA-256 кода доступа
var API_URL = 'https://yfsvmyvyaplzlhucweov.supabase.co/rest/v1/book_feedback';
var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlmc3ZteXZ5YXBsemxodWN3ZW92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNjAwNTksImV4cCI6MjEwNzczNjA1OX0.0IU1EgPwDq2N-oesHlSJNRepDMEb-jToFewqF5J4jvM';
var LS_STATE = 'asdbook:' + BOOK.version + ':v2state';
var LS_AUTH = 'asdbook:auth';

/* ---------- данные ---------- */
var PAGES = [], CH = {};
BOOK.chapters.forEach(function (ch) {
  CH[ch.id] = ch; ch.first = null;
  ch.pages.forEach(function (p) { p.ch = ch; p.idx = PAGES.length; if (ch.first === null) ch.first = p.idx; PAGES.push(p); });
});
var NP = PAGES.length;
var PBN = {}; PAGES.forEach(function (p) { PBN[p.n] = p; });
var BLK = {}; PAGES.forEach(function (p) { p.blocks.forEach(function (b) { BLK[b.id] = b; }); });

/* ---------- состояние ---------- */
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
var state = { name: '', pages: {}, drafts: {}, general: '', cur: 0, started: false, seenHelp: false, panel: false, sentNotes: {}, sentPages: {}, sentAt: null };
(function load() {
  var raw = lsGet(LS_STATE); if (!raw) return;
  try { var o = JSON.parse(raw); for (var k in state) if (o[k] !== undefined) state[k] = o[k]; } catch (e) {}
  if (!(state.cur >= 0 && state.cur < NP)) state.cur = 0;
})();
function save() { lsSet(LS_STATE, JSON.stringify(state)); }
function pg(n) { return state.pages[n] || (state.pages[n] = { ok: false, notes: [] }); }
function decided(n) { var r = state.pages[n]; return !!(r && (r.ok || r.notes.length)); }
function pstatus(n) { var r = state.pages[n]; if (r && r.notes.length) return 'has_notes'; if (r && r.ok) return 'verified'; return 'untouched'; }
function totals() {
  var d = 0, m = 0; PAGES.forEach(function (p) { if (decided(p.n)) d++; m += (state.pages[p.n] ? state.pages[p.n].notes.length : 0); });
  return { done: d, notes: m };
}
function chStatus(ch) { var d = 0; ch.pages.forEach(function (p) { if (decided(p.n)) d++; }); return d === ch.pages.length ? 'checked' : d ? 'partial' : 'untouched'; }
function draftOf(n) { return state.drafts[n] || (state.drafts[n] = { text: '', blocks: [], back: null }); }

/* ---------- мелочи ---------- */
function h(tag, attrs, kids) {
  var e = document.createElement(tag);
  if (attrs) for (var k in attrs) {
    var v = attrs[k]; if (v === null || v === undefined || v === false) continue;
    if (k === 'text') e.textContent = v; else if (k === 'class') e.className = v;
    else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
  }
  (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return e;
}
var root = document.getElementById('root');
var view = 'start', helpFrom = 'start', sendState = null;
function isHeading(t) { return t.length <= 90 && !/[.;:,]$/.test(t.trim()); }
function quoteOf(b) { var w = b.t.replace(/\s+/g, ' ').trim().split(' '); return w.slice(0, 7).join(' ') + (w.length > 7 ? '…' : ''); }
function newId() { return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function plural(n, a, b, c) { var m = n % 100, k = n % 10; if (m > 10 && m < 20) return c; if (k === 1) return a; if (k > 1 && k < 5) return b; return c; }
function logo(cls) { return h('img', { class: cls, src: './logo.png', alt: 'Академия Сметного Дела' }); }

/* ---------- SHA-256 ---------- */
/* ---------- SHA-256 (запасной вариант без crypto.subtle) ---------- */
function sha256Fallback(str) {
  var u = unescape(encodeURIComponent(str)), bytes = []; for (var q = 0; q < u.length; q++) bytes.push(u.charCodeAt(q));
  var K = [], H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], p = 2, c = 0;
  function isP(n) { for (var i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; }
  while (c < 64) { if (isP(p)) { K[c++] = (Math.pow(p, 1 / 3) * 4294967296) | 0; } p++; }
  var l = bytes.length * 8; bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
  bytes.push(0, 0, 0, 0, (l >>> 24) & 255, (l >>> 16) & 255, (l >>> 8) & 255, l & 255);
  function R(x, n) { return (x >>> n) | (x << (32 - n)); }
  for (var off = 0; off < bytes.length; off += 64) {
    var w = [], i;
    for (i = 0; i < 16; i++) w[i] = (bytes[off + 4 * i] << 24) | (bytes[off + 4 * i + 1] << 16) | (bytes[off + 4 * i + 2] << 8) | bytes[off + 4 * i + 3];
    for (i = 16; i < 64; i++) { var s0 = R(w[i - 15], 7) ^ R(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = R(w[i - 2], 17) ^ R(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
    var a = H[0], b = H[1], cc = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (i = 0; i < 64; i++) {
      var S1 = R(e, 6) ^ R(e, 11) ^ R(e, 25), ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      var S0 = R(a, 2) ^ R(a, 13) ^ R(a, 22), mj = (a & b) ^ (a & cc) ^ (b & cc), t2 = (S0 + mj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = cc; cc = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + cc) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
}
function sha256(str) {
  if (window.crypto && crypto.subtle && window.TextEncoder) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    }).catch(function () { return sha256Fallback(str); });
  }
  return Promise.resolve(sha256Fallback(str));
}


/* ---------- диктовка ---------- */
var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
var dict = null;
function stopDict() {
  if (!dict) return; var d = dict; dict = null; d.wanted = false;
  try { d.rec.stop(); } catch (e) {}
  d.btn.textContent = '🎤 Сказать голосом'; d.btn.setAttribute('aria-pressed', 'false'); d.live.hidden = true;
}
function setLive(live, msg, interim) {
  live.textContent = ''; live.hidden = false;
  live.appendChild(h('span', { class: 'dot', 'aria-hidden': 'true' })); live.appendChild(h('span', { text: msg }));
  live.appendChild(h('span', { class: 'interim', text: interim || '' }));
}
function toggleDict(ta, btn, live, onChange) {
  if (dict && dict.ta === ta) { stopDict(); return; }
  stopDict();
  var rec; try { rec = new SR(); } catch (e) { return; }
  rec.lang = 'ru-RU'; rec.continuous = true; rec.interimResults = true;
  var d = { rec: rec, ta: ta, btn: btn, live: live, wanted: true }; dict = d;
  btn.textContent = '⏹ Остановить запись'; btn.setAttribute('aria-pressed', 'true');
  setLive(live, 'Слушаю… говорите');
  rec.onresult = function (ev) {
    var fin = '', itr = '';
    for (var i = ev.resultIndex; i < ev.results.length; i++) { if (ev.results[i].isFinal) fin += ev.results[i][0].transcript; else itr += ev.results[i][0].transcript; }
    if (fin) {
      fin = fin.trim(); var v = ta.value;
      ta.value = v + (v && !/\s$/.test(v) ? ' ' : '') + fin; onChange();
    }
    var i2 = live.querySelector('.interim'); if (i2) i2.textContent = itr;
  };
  rec.onerror = function (ev) {
    if (ev.error === 'no-speech' || ev.error === 'aborted') return;
    var msg = (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') ? 'Браузер не разрешил микрофон. Нажмите на значок замка рядом с адресом страницы и разрешите микрофон. А пока можно написать.' : 'Не получилось записать голос. Можно написать текстом.';
    stopDict(); live.hidden = false; live.className = 'nospeech'; live.textContent = msg;
  };
  rec.onend = function () { if (dict === d && d.wanted) { try { rec.start(); } catch (e) { stopDict(); } } else if (dict === d) { stopDict(); } };
  live.className = 'live';
  try { rec.start(); } catch (e) { stopDict(); }
}
function voiceBlock(ta, onChange, label) {
  var live = h('div', { class: 'live', role: 'status', 'aria-live': 'polite', hidden: true });
  if (!SR) return { btn: null, live: h('div', { class: 'nospeech', text: 'Скажите голосом можно в Chrome, Edge или Safari. А пока напишите.' }) };
  var btn = h('button', { class: 'btn btn-rec', type: 'button', 'aria-pressed': 'false', text: label || '🎤 Сказать голосом' });
  btn.addEventListener('click', function () { toggleDict(ta, btn, live, onChange); });
  return { btn: btn, live: live };
}

/* ---------- отправка: payload ---------- */
function buildPayload(onlyNew) {
  var chapters = BOOK.chapters.map(function (ch) { return { id: ch.id, title: ch.title, status: chStatus(ch), chapter_comment: '' }; });
  var blocks = [], pages = [], idx = {};
  function addBlock(o, comment) {
    var key = o.id; var ex = idx[key];
    if (ex) { if (comment) ex.comment = ex.comment ? ex.comment + ' | ' + comment : comment; return; }
    if (comment) o.comment = comment; idx[key] = o; blocks.push(o);
  }
  PAGES.forEach(function (p) {
    var r = state.pages[p.n]; var st = pstatus(p.n);
    var notes = (r ? r.notes : []).filter(function (x) { return !(onlyNew && state.sentNotes[x.id]); });
    var pageNew = !(onlyNew && state.sentPages[p.n]);
    if (st === 'untouched') return;
    if (onlyNew && !notes.length && !(st === 'verified' && pageNew)) return;
    pages.push({ n: p.n, status: st, notes: notes.map(function (x) { return { text: x.text, blocks: x.blocks.slice(), quote: x.quote || '' }; }) });
    if (st === 'verified') p.blocks.forEach(function (b) { addBlock({ id: b.id, chapter: p.ch.id, page: p.n, status: 'accepted' }); });
    notes.forEach(function (x) {
      if (!x.blocks.length) addBlock({ id: 'page-' + (p.n < 10 ? '0' : '') + p.n, chapter: p.ch.id, page: p.n, status: 'comment', original: 'страница ' + (p.n < 10 ? '0' : '') + p.n + ' целиком' }, x.text);
      else x.blocks.forEach(function (id) { addBlock({ id: id, chapter: p.ch.id, page: p.n, status: 'comment', original: BLK[id].t }, x.text); });
    });
  });
  return { generated_at: new Date().toISOString(), contact: '', general_comment: (state.general || '').trim(), chapters: chapters, blocks: blocks, pages: pages };
}
function buildBody(onlyNew) { return { expert: state.name || '', version: BOOK.version, payload: buildPayload(onlyNew) }; }
function buildTxt() {
  var t = totals(), L = [];
  L.push('ПРАВКИ К КНИГЕ «' + BOOK.title.toUpperCase() + '», версия ' + BOOK.version);
  L.push('Эксперт: ' + (state.name || '—')); L.push('Дата: ' + new Date().toLocaleString('ru-RU'));
  L.push('Проверено страниц: ' + t.done + ' из ' + NP + '. Замечаний: ' + t.notes + '.');
  if ((state.general || '').trim()) { L.push(''); L.push('ОБЩИЙ КОММЕНТАРИЙ К КНИГЕ:'); L.push(state.general.trim()); }
  PAGES.forEach(function (p) {
    var r = state.pages[p.n]; if (!r || !r.notes.length) return;
    L.push(''); L.push('------------------------------------------------------------');
    L.push('СТРАНИЦА ' + p.n + ' · ' + p.ch.title);
    r.notes.forEach(function (x, i) {
      L.push(''); L.push('Замечание ' + (i + 1) + ':'); L.push(x.text);
      if (x.blocks.length) x.blocks.forEach(function (id) { L.push('  К абзацу: «' + BLK[id].t + '»'); });
    });
  });
  var ok = PAGES.filter(function (p) { return pstatus(p.n) === 'verified'; }).map(function (p) { return p.n; });
  L.push(''); L.push('Страницы, отмеченные как верные: ' + (ok.length ? ok.join(', ') : 'нет'));
  return L.join('\n') + '\n';
}
function download(name, text, mime) {
  var b = new Blob([text], { type: mime }), a = h('a', { href: URL.createObjectURL(b), download: name });
  document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
function sendNow(onlyNew) {
  var body = JSON.stringify(buildBody(onlyNew)); var ctrl = window.AbortController ? new AbortController() : null;
  var to = setTimeout(function () { if (ctrl) ctrl.abort(); }, 25000);
  return fetch(API_URL, { method: 'POST', headers: { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: body, signal: ctrl ? ctrl.signal : undefined })
    .then(function (r) { clearTimeout(to); if (!r.ok) throw new Error('http ' + r.status); })
    .catch(function (e) { clearTimeout(to); throw e; });
}

/* ---------- навигация ---------- */
function go(v) { stopDict(); view = v; render(); window.scrollTo(0, 0); }
function openPage(i) { state.cur = Math.max(0, Math.min(NP - 1, i)); state.panel = false; save(); go('page'); }
function next() { if (state.cur >= NP - 1) { state.panel = false; save(); go('final'); } else openPage(state.cur + 1); }
function render() {
  root.textContent = '';
  if (view === 'start') return renderStart();
  if (view === 'help') return renderHelp();
  if (view === 'toc') return renderToc();
  if (view === 'final') return renderFinal();
  renderPage();
}

/* ---------- вход ---------- */
var hashP = (function () { try { var s = (location.hash || '').replace(/^#/, ''); var p = new URLSearchParams(s); return { n: p.get('n') || '', k: p.get('k') || '' }; } catch (e) { return { n: '', k: '' }; } })();
function authed() { var a = lsGet(LS_AUTH); try { var o = JSON.parse(a); return !!o && o.ok === 1 && o.h === CODE_HASH.slice(0, 12); } catch (e) { return false; } }
if (hashP.n && !state.name) state.name = hashP.n.trim();
function stepsList() {
  var items = [['👁', 'Смотрите страницу книги и её текст.'], ['✓', 'Если всё верно, нажмите зелёную кнопку.'], ['✎', 'Если нужно исправить, нажмите «Есть что исправить», напишите или скажите голосом.']];
  return h('ol', { class: 'steps' }, items.map(function (it, i) { return h('li', null, [h('span', { class: 'ic', 'aria-hidden': 'true', text: it[0] }), h('span', null, [h('b', { text: 'Шаг ' + (i + 1) }), it[1]])]); }));
}
function renderStart() {
  var isAuth = authed(), name = state.name, first = !state.started;
  var f = h('form', { class: 'card', autocomplete: 'off' });
  f.appendChild(logo('logo'));
  f.appendChild(h('h1', { text: name ? 'Здравствуйте, ' + name + '!' : 'Здравствуйте!' }));
  var stopped = state.started && state.cur > 0;
  f.appendChild(h('p', { class: 'lead', text: stopped ? 'Вы остановились на странице ' + PAGES[state.cur].n + '. Продолжим с неё?' : 'Проверка книги «' + BOOK.title + '».' }));
  var nameIn, codeIn, err = h('p', { class: 'err', role: 'alert', hidden: true });
  if (!name) { nameIn = h('input', { type: 'text', autocomplete: 'name', placeholder: 'Например: Фирая Ярхамовна' }); f.appendChild(h('label', { class: 'field' }, [h('span', { text: 'Ваше имя' }), nameIn])); }
  if (!isAuth && !hashP.k) { codeIn = h('input', { type: 'password', autocomplete: 'off', placeholder: 'Код из письма' }); f.appendChild(h('label', { class: 'field' }, [h('span', { text: 'Код доступа' }), codeIn])); }
  if (!state.seenHelp && !stopped) f.appendChild(stepsList());
  f.appendChild(err);
  f.appendChild(h('button', { class: 'btn btn-green btn-xl', type: 'submit', text: stopped ? 'Продолжить' : 'Начать проверку' }));
  var links = h('div', { class: 'center mt' });
  if (state.seenHelp || stopped) links.appendChild(h('button', { class: 'link', type: 'button', text: 'Как это работает?', onclick: function () { helpFrom = 'start'; go('help'); } }));
  if (stopped) links.appendChild(h('button', { class: 'link', type: 'button', text: 'Начать с первой страницы', onclick: function () { state.cur = 0; save(); renderStartKeep(); } }));
  f.appendChild(links);
  function renderStartKeep() { render(); }
  f.addEventListener('submit', function (e) {
    e.preventDefault(); err.hidden = true;
    var nm = name || (nameIn ? nameIn.value.trim() : '');
    if (!nm) { err.textContent = 'Напишите, пожалуйста, ваше имя.'; err.hidden = false; nameIn.focus(); return; }
    var finish = function () {
      state.name = nm; state.started = true; state.seenHelp = true; save();
      try { history.replaceState(null, '', location.pathname + location.search); } catch (x) {}
      openPage(state.cur);
    };
    if (isAuth) return finish();
    var code = hashP.k || (codeIn ? codeIn.value.trim() : '');
    sha256(code).then(function (hx) {
      if (hx !== CODE_HASH) { err.textContent = 'Код не подошёл. Проверьте, пожалуйста, и попробуйте ещё раз.'; err.hidden = false; if (codeIn) codeIn.focus(); else { hashP.k = ''; render(); } return; }
      lsSet(LS_AUTH, JSON.stringify({ ok: 1, h: CODE_HASH.slice(0, 12) })); finish();
    });
  });
  root.appendChild(h('main', { class: 'start' }, [f]));
}
function renderHelp() {
  var c = h('div', { class: 'card' }, [logo('logo'), h('h1', { text: 'Как это работает' }), stepsList(),
    h('button', { class: 'btn btn-green btn-xl', text: 'Понятно', onclick: function () { state.seenHelp = true; save(); if (state.started) openPage(state.cur); else go('start'); } })]);
  root.appendChild(h('main', { class: 'start' }, [c]));
}

/* ---------- оглавление ---------- */
function renderToc() {
  var t = totals(), wrapEl = h('main', { class: 'toc' });
  var top = h('header', { class: 'top' }, [h('button', { class: 'btn btn-small', text: '✕ Закрыть', onclick: function () { go(state.started ? 'page' : 'start'); } }), h('div', { class: 'ttl', text: 'Оглавление' }), logo('logo-s')]);
  var ol = h('ol');
  BOOK.chapters.forEach(function (ch) {
    var st = chStatus(ch), d = ch.pages.filter(function (p) { return decided(p.n); }).length;
    var mark = h('span', { class: 'mark ' + (st === 'checked' ? 'done' : st === 'partial' ? 'part' : ''), 'aria-hidden': 'true', text: st === 'checked' ? '✓' : st === 'partial' ? d + '/' + ch.pages.length : '' });
    var f1 = ch.from, l1 = ch.to; var sub = ch.pages.length > 1 ? 'страницы ' + f1 + '–' + l1 : 'страница ' + f1;
    var stTxt = st === 'checked' ? ', проверена' : st === 'partial' ? ', проверено ' + d + ' из ' + ch.pages.length : '';
    var b = h('button', { class: (PAGES[state.cur].ch === ch ? 'cur' : ''), onclick: function () {
      var first = ch.first; for (var i = 0; i < ch.pages.length; i++) { if (!decided(ch.pages[i].n)) { first = ch.first + i; break; } }
      state.started = true; save(); openPage(first); } }, [mark, h('span', null, [ch.title, h('span', { class: 'sub', text: sub + stTxt })])]);
    ol.appendChild(h('li', null, [b]));
  });
  wrapEl.appendChild(h('h1', { text: 'Проверено страниц: ' + t.done + ' из ' + NP }));
  wrapEl.appendChild(ol);
  wrapEl.appendChild(h('div', { class: 'foot' }, [
    h('button', { class: 'btn btn-small', text: 'Отправить правки', onclick: function () { go('final'); } }),
    h('button', { class: 'link', text: 'Как это работает?', onclick: function () { helpFrom = 'toc'; go('help'); } })]));
  root.appendChild(top); root.appendChild(wrapEl);
}

/* ---------- страница книги ---------- */
function openLightbox(src) {
  var lb = h('div', { class: 'lb', role: 'dialog', 'aria-label': 'Страница книги крупно' }, [h('button', { class: 'btn btn-navy x', text: '✕ Закрыть', onclick: close }), h('img', { src: src, alt: 'Страница книги крупно' })]);
  function close() { lb.remove(); document.removeEventListener('keydown', esc); }
  function esc(e) { if (e.key === 'Escape') close(); }
  lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
  document.addEventListener('keydown', esc); document.body.appendChild(lb);
}
function askDelete(yes) {
  var d = h('div', { class: 'dlg', role: 'alertdialog' }, [h('div', null, [h('h2', { text: 'Вы точно хотите убрать замечание?' }), h('div', { class: 'row' }, [
    h('button', { class: 'btn btn-blue', text: 'Нет, оставить', onclick: function () { d.remove(); } }),
    h('button', { class: 'btn', text: 'Да, убрать', onclick: function () { d.remove(); yes(); } })])])]);
  document.body.appendChild(d); d.querySelector('button').focus();
}
function renderPage() {
  var p = PAGES[state.cur], r = pg(p.n), dr = draftOf(p.n), panelOpen = state.panel;
  var top = h('header', { class: 'top' }, [
    h('button', { class: 'btn btn-small', text: '☰ Оглавление', onclick: function () { go('toc'); } }),
    h('div', { class: 'ttl' }, ['Страница ' + p.n + ' книги', h('small', { text: (state.cur + 1) + ' из ' + NP + ' · ' + p.ch.title })]),
    logo('logo-s')]);
  var imgb = h('button', { class: 'imgbtn', type: 'button', 'aria-label': 'Увеличить страницу книги', onclick: function () { openLightbox(p.img); } }, [
    h('img', { src: p.img, alt: 'Страница ' + p.n + ' книги' }), h('span', { class: 'zoom', text: '🔍 Увеличить' })]);
  var left = h('div', { class: 'left' + (panelOpen ? ' free' : '') });
  var text = h('div', { class: 'text' + (panelOpen ? ' pick' : '') });
  if (!panelOpen) {
    if (r.notes.length) text.appendChild(h('div', { class: 'badge n', text: 'Замечаний на этой странице: ' + r.notes.length }));
    else if (r.ok) text.appendChild(h('div', { class: 'badge ok', text: '✓ Эта страница отмечена как верная' }));
  }
  var noted = {}; r.notes.forEach(function (x) { x.blocks.forEach(function (id) { noted[id] = 1; }); });
  var blkEls = {};
  p.blocks.forEach(function (b) {
    var el = h('p', { class: 'blk' + (isHeading(b.t) ? ' h' : '') + (noted[b.id] ? ' has' : '') + (panelOpen && dr.blocks.indexOf(b.id) >= 0 ? ' sel' : ''), text: b.t });
    blkEls[b.id] = el;
    if (panelOpen) { el.tabIndex = 0; el.setAttribute('role', 'button'); el.setAttribute('aria-pressed', dr.blocks.indexOf(b.id) >= 0 ? 'true' : 'false');
      var tgl = function () { var i = dr.blocks.indexOf(b.id); if (i >= 0) dr.blocks.splice(i, 1); else dr.blocks.push(b.id); el.classList.toggle('sel', i < 0); el.setAttribute('aria-pressed', i < 0 ? 'true' : 'false'); save(); P && P.refresh(); };
      el.addEventListener('click', tgl); el.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); tgl(); } }); }
    text.appendChild(el);
  });
  var P = null;
  if (panelOpen) { P = buildPanel(p, r, dr, blkEls); left.appendChild(P.el); }
  if (!(panelOpen && window.innerWidth < 1000)) left.appendChild(imgb);
  root.appendChild(top);
  root.appendChild(h('main', { class: 'wrap', id: 'main', tabindex: '-1' }, [h('div', { class: 'cols' }, [left, text])]));
  if (!panelOpen) {
    var hasN = r.notes.length > 0;
    var bar = h('div', { class: 'bar' }, [h('div', { class: 'bar-in' }, [
      h('button', { class: 'btn btn-grey back', text: '← Назад', disabled: state.cur === 0, onclick: function () { openPage(state.cur - 1); } }),
      h('button', { class: 'btn btn-green go', id: 'okBtn', text: hasN ? 'Дальше →' : '✓ Всё верно, дальше →', onclick: function () { if (!hasN) { r.ok = true; } save(); next(); } }),
      h('button', { class: 'btn btn-blue', text: '✎ Есть что исправить', onclick: function () { state.panel = true; save(); render(); setTimeout(function () { var t = document.getElementById('noteTa'); if (t) { window.scrollTo(0, 0); } }, 0); } })])]);
    root.appendChild(bar);
  }
  if (P) setTimeout(function () { window.scrollTo(0, 0); }, 0);
}
function buildPanel(p, r, dr, blkEls) {
  var ta = h('textarea', { id: 'noteTa', rows: 6, 'aria-label': 'Что нужно исправить', placeholder: 'Напишите здесь…' }); ta.value = dr.text || '';
  var quotes = h('div', { class: 'quotes' }), notesBox = h('div', { class: 'notes' });
  var err = h('p', { class: 'err', role: 'alert', hidden: true });
  var more = h('button', { class: 'btn', type: 'button', text: '+ Ещё замечание' });
  var vb = voiceBlock(ta, onType);
  function onType() { dr.text = ta.value; save(); err.hidden = true; vis(); }
  function vis() { more.hidden = !ta.value.trim(); }
  ta.addEventListener('input', onType);
  function refresh() {
    quotes.textContent = '';
    dr.blocks.forEach(function (id) { quotes.appendChild(h('div', { text: 'К абзацу: «' + quoteOf(BLK[id]) + '»' })); });
    notesBox.textContent = '';
    if (r.notes.length) {
      notesBox.appendChild(h('div', { class: 'tt', text: 'Уже добавлено замечаний: ' + r.notes.length }));
      r.notes.forEach(function (x, i) {
        var kids = [h('p', { text: (i + 1) + '. ' + x.text })];
        if (x.quote) kids.push(h('p', { class: 'q', text: 'К абзацу: «' + x.quote + '»' }));
        kids.push(h('div', { class: 'acts' }, [
          h('button', { class: 'btn btn-small', type: 'button', text: 'Изменить', onclick: function () { edit(i); } }),
          h('button', { class: 'btn btn-small', type: 'button', text: 'Удалить', onclick: function () { askDelete(function () { r.notes.splice(i, 1); save(); P.refresh(); }); } })]));
        notesBox.appendChild(h('div', { class: 'note' }, kids));
      });
    }
    vis();
  }
  function edit(i) {
    if (ta.value.trim() && !commit()) return;
    var x = r.notes.splice(i, 1)[0]; dr.text = x.text; dr.blocks = x.blocks.slice(); dr.back = x; save(); state.panel = true; render();
  }
  function commit() {
    var t = ta.value.trim(); if (!t) return false;
    var ids = dr.blocks.slice();
    r.notes.push({ id: dr.back ? dr.back.id : newId(), text: t, blocks: ids, quote: ids.map(function (id) { return quoteOf(BLK[id]); }).join(' / ') });
    dr.text = ''; dr.blocks = []; dr.back = null; r.ok = false; save(); return true;
  }
  more.addEventListener('click', function () { stopDict(); if (commit()) { state.panel = true; render(); setTimeout(function () { var t = document.getElementById('noteTa'); if (t) t.focus(); }, 0); } });
  var saveBtn = h('button', { class: 'btn btn-blue', type: 'button', text: 'Сохранить замечание и дальше →', onclick: function () {
    stopDict();
    if (ta.value.trim()) commit(); else if (!r.notes.length) { err.textContent = 'Напишите или скажите, что нужно исправить. Если исправлять нечего, нажмите «Отмена».'; err.hidden = false; return; }
    state.panel = false; save(); next(); } });
  var cancel = h('button', { class: 'link', type: 'button', text: 'Отмена, ничего не исправлять', onclick: function () {
    stopDict(); if (dr.back) { r.notes.push(dr.back); dr.back = null; dr.text = ''; dr.blocks = []; } state.panel = false; save(); render(); } });
  var rowKids = []; if (vb.btn) rowKids.push(vb.btn); rowKids.push(saveBtn);
  var el = h('section', { class: 'panel', 'aria-label': 'Замечание к странице' }, [
    h('h2', { text: 'Что нужно исправить на этой странице?' }),
    h('p', { class: 'hint', text: 'Можно написать, а можно сказать голосом. Если замечание к конкретному месту — нажмите на этот абзац в тексте, он подсветится, и мы запомним, к какому месту оно относится.' }),
    quotes, ta, vb.live, h('div', { class: 'row' }, rowKids), h('div', { class: 'center' }, [more]), err, notesBox, h('div', { class: 'center' }, [cancel])]);
  var P = { el: el, refresh: refresh }; refresh();
  return P;
}

/* ---------- финал ---------- */
function renderFinal() {
  var t = totals(), cont = h('main', { class: 'final' });
  var top = h('header', { class: 'top' }, [h('button', { class: 'btn btn-small', text: '☰ Оглавление', onclick: function () { go('toc'); } }), h('div', { class: 'ttl', text: 'Отправка правок' }), logo('logo-s')]);
  var sent = sendState === 'ok';
  if (sent) {
    cont.appendChild(h('h1', { text: 'Спасибо! Правки у нас.' }));
    cont.appendChild(h('p', { class: 'hint', text: 'Продолжайте, если хотите проверить дальше — новые замечания отправим отдельно.' }));
    cont.appendChild(h('button', { class: 'btn btn-green btn-xl', text: 'Продолжить проверку', onclick: function () { sendState = null; openPage(Math.min(state.cur, NP - 1)); } }));
  } else {
    cont.appendChild(h('h1', null, ['Вы проверили ' + t.done + ' ' + plural(t.done, 'страницу', 'страницы', 'страниц') + ' из ' + NP + '.', h('br'), 'Замечаний: ' + t.notes + '.']));
    var gta = h('textarea', { rows: 4, 'aria-label': 'Общий комментарий к книге', placeholder: 'Напишите здесь…' }); gta.value = state.general || '';
    var gv = voiceBlock(gta, function () { state.general = gta.value; save(); });
    gta.addEventListener('input', function () { state.general = gta.value; save(); });
    var msg = h('div', { role: 'status', 'aria-live': 'polite' });
    var sb = h('button', { class: 'btn btn-green btn-xl', text: 'Отправить правки нам' });
    sb.addEventListener('click', function () {
      stopDict(); sb.disabled = true; sb.textContent = 'Отправляем…'; msg.textContent = '';
      var onlyNew = !!state.sentAt;
      sendNow(onlyNew).then(function () {
        state.sentAt = new Date().toISOString();
        PAGES.forEach(function (p) { var r = state.pages[p.n]; if (!r) return; if (r.ok && !r.notes.length) state.sentPages[p.n] = 1; r.notes.forEach(function (x) { state.sentNotes[x.id] = 1; }); if (r.notes.length) state.sentPages[p.n] = 1; });
        save(); sendState = 'ok'; render(); window.scrollTo(0, 0);
      }).catch(function () {
        sb.disabled = false; sb.textContent = 'Отправить правки нам';
        var f = h('div', { class: 'fail' }, [h('p', { class: 'fp', text: 'Не получилось отправить. Нажмите «Скачать файл» и пришлите нам.' }), h('div', { class: 'dl' }, [
          h('button', { class: 'btn btn-navy btn-xl', text: 'Скачать файл', onclick: function () { download('pravki-knigi.txt', buildTxt(), 'text/plain;charset=utf-8'); setTimeout(function () { download('pravki-knigi.json', JSON.stringify(buildBody(false), null, 1), 'application/json'); }, 500); } })])]);
        msg.textContent = ''; msg.appendChild(f);
      });
    });
    cont.appendChild(sb);
    cont.appendChild(h('p', { class: 'hint', text: 'Можно отправить сейчас, даже если проверены не все страницы. Потом можно будет продолжить.' }));
    cont.appendChild(msg);
    var bx = h('div', { class: 'box' }, [h('b', { text: 'Общий комментарий к книге (можно голосом)' }), gta, gv.live, h('div', { class: 'row' }, gv.btn ? [gv.btn] : [])]);
    cont.appendChild(bx);
    cont.appendChild(h('div', { class: 'center mt' }, [h('button', { class: 'link', text: '← Вернуться к книге', onclick: function () { openPage(state.cur); } })]));
  }
  root.appendChild(top); root.appendChild(cont);
}

/* ---------- клавиатура ---------- */
document.addEventListener('keydown', function (e) {
  if (view !== 'page' || state.panel || document.querySelector('.lb,.dlg')) return;
  var a = document.activeElement, tag = a && a.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'ArrowRight' && state.cur < NP - 1) { openPage(state.cur + 1); }
  else if (e.key === 'ArrowLeft' && state.cur > 0) { openPage(state.cur - 1); }
  else if (e.key === 'Enter' && tag !== 'BUTTON' && tag !== 'A') { var b = document.getElementById('okBtn'); if (b) b.click(); }
});
window.addEventListener('beforeunload', save);

/* ---------- запуск ---------- */
var sendVerify = true;
if (state.started && authed()) { view = 'start'; }
render();
window.__core = { state: function () { return state; }, buildBody: buildBody, buildTxt: buildTxt, totals: totals, sha256: sha256, CODE_HASH: CODE_HASH, go: go, openPage: openPage, view: function () { return view; }, PAGES: PAGES };
})();

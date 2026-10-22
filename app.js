/* Проверка книги «Первый шаг в сметное дело» — приложение для эксперта.
   Без библиотек и сборки. Данные: window.BOOK (data.js). */
(function () {
'use strict';

var BOOK = window.BOOK;
var CODE_HASH = '6643937a9f491b9f36f443348d80b62a998468c30140e9ad2d5eab07ab3580bd'; // SHA-256 кода доступа
var API_URL = 'https://yfsvmyvyaplzlhucweov.supabase.co/rest/v1/book_feedback';
var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlmc3ZteXZ5YXBsemxodWN3ZW92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNjAwNTksImV4cCI6MjEwNzczNjA1OX0.0IU1EgPwDq2N-oesHlSJNRepDMEb-jToFewqF5J4jvM';
var LS_STATE = 'asdbook:' + BOOK.version + ':state';
var LS_AUTH = 'asdbook:auth';
var MAX_PAYLOAD = 400 * 1024;
var NOTE_NO_SPEECH = 'Диктовка работает в Chrome, Edge и Safari. Можно писать текстом.';

/* ---------- индекс данных ---------- */
var IDX = {}; var TOTAL = 0; var CHM = {};
BOOK.chapters.forEach(function (ch) {
  var n = 0;
  ch.pages.forEach(function (p) {
    p.blocks.forEach(function (b, i) { IDX[b.id] = { b: b, ch: ch, page: p.n, k: i + 1 }; n++; TOTAL++; });
  });
  ch.total = n; CHM[ch.id] = ch;
});

/* ---------- состояние ---------- */
var state = { name: '', blocks: {}, chapters: {}, general: '', contact: '', sent: null, ui: { ch: BOOK.chapters[0].id, help: true } };

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

function loadState() {
  var raw = lsGet(LS_STATE);
  if (raw) { try { var s = JSON.parse(raw); if (s && s.blocks) { state = Object.assign(state, s); state.ui = Object.assign({ ch: BOOK.chapters[0].id, help: true }, s.ui || {}); } } catch (e) {} }
}
var saveTimer = null;
function save() { state.savedAt = Date.now(); lsSet(LS_STATE, JSON.stringify(state)); }
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 250); }

function bs(id) { return state.blocks[id] || {}; }
function setB(id, patch) {
  var o = Object.assign({}, state.blocks[id] || {}, patch);
  Object.keys(o).forEach(function (k) { if (o[k] === null || o[k] === undefined || o[k] === false || (k === 'com' && o[k] === '') || (k === 'draft' && o[k] === '')) delete o[k]; });
  if (Object.keys(o).length) state.blocks[id] = o; else delete state.blocks[id];
  save();
}
function hasEdit(s) { return typeof s.edit === 'string'; }
function reviewed(s) { return !!(s.acc || hasEdit(s) || (s.com && s.com.trim())); }
function statusOf(s) {
  var e = hasEdit(s), c = !!(s.com && s.com.trim());
  if (e && c) return 'edited_comment';
  if (e) return 'edited';
  if (c) return 'comment';
  if (s.acc) return 'accepted';
  return 'none';
}
function chCounts(ch) {
  var r = 0;
  ch.pages.forEach(function (p) { p.blocks.forEach(function (b) { if (reviewed(bs(b.id))) r++; }); });
  return r;
}
function chStatus(ch) {
  var r = chCounts(ch), c = state.chapters[ch.id] || {};
  if (c.done || r === ch.total) return 'checked';
  if (r > 0 || (c.com && c.com.trim())) return 'partial';
  return 'untouched';
}
function totals() {
  var t = { reviewed: 0, accepted: 0, edited: 0, comments: 0, chChecked: 0 };
  Object.keys(IDX).forEach(function (id) {
    var s = bs(id), st = statusOf(s);
    if (st === 'none') return;
    t.reviewed++;
    if (st === 'accepted') t.accepted++;
    if (st === 'edited' || st === 'edited_comment') t.edited++;
    if (st === 'comment' || st === 'edited_comment') t.comments++;
  });
  BOOK.chapters.forEach(function (ch) { if (chStatus(ch) === 'checked') t.chChecked++; });
  return t;
}

/* ---------- словесный diff ---------- */
function diffWords(a, b) {
  var A = a.split(/\s+/).filter(Boolean), B = b.split(/\s+/).filter(Boolean);
  var s = 0; while (s < A.length && s < B.length && A[s] === B[s]) s++;
  var ea = A.length, eb = B.length; while (ea > s && eb > s && A[ea - 1] === B[eb - 1]) { ea--; eb--; }
  var am = A.slice(s, ea), bm = B.slice(s, eb), n = am.length, m = bm.length, ops = [], i, j;
  for (i = 0; i < s; i++) ops.push(['eq', A[i]]);
  if (n * m > 4000000) { am.forEach(function (w) { ops.push(['del', w]); }); bm.forEach(function (w) { ops.push(['ins', w]); }); }
  else {
    var dp = []; for (i = 0; i <= n; i++) { dp.push(new Uint16Array(m + 1)); }
    for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) dp[i][j] = am[i] === bm[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    i = 0; j = 0;
    while (i < n && j < m) {
      if (am[i] === bm[j]) { ops.push(['eq', am[i]]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push(['del', am[i]]); i++; }
      else { ops.push(['ins', bm[j]]); j++; }
    }
    while (i < n) ops.push(['del', am[i++]]);
    while (j < m) ops.push(['ins', bm[j++]]);
  }
  for (i = ea; i < A.length; i++) ops.push(['eq', A[i]]);
  // склеиваем подряд идущие
  var out = [];
  ops.forEach(function (o) { var l = out[out.length - 1]; if (l && l[0] === o[0]) l[1] += ' ' + o[1]; else out.push([o[0], o[1]]); });
  return out;
}
function renderDiff(el, a, b) {
  el.textContent = '';
  if (a.trim() === b.trim()) { var e = document.createElement('span'); e.className = 'diff-empty'; e.textContent = 'Изменений пока нет.'; el.appendChild(e); return; }
  var ops = diffWords(a, b);
  ops.forEach(function (o, k) {
    var n = document.createElement(o[0] === 'del' ? 'del' : o[0] === 'ins' ? 'ins' : 'span');
    if (o[0] === 'eq') n.className = 'same';
    n.textContent = o[1];
    el.appendChild(n);
    if (k < ops.length - 1) el.appendChild(document.createTextNode(' '));
  });
}

/* ---------- сборка payload ---------- */
function buildPayload(opts) {
  opts = opts || {};
  var chapters = BOOK.chapters.map(function (ch) {
    var c = state.chapters[ch.id] || {};
    return { id: ch.id, title: ch.title, status: chStatus(ch) === 'checked' ? 'checked' : chStatus(ch) === 'partial' ? 'partial' : 'untouched', chapter_comment: (c.com || '').trim() };
  });
  var blocks = [];
  BOOK.chapters.forEach(function (ch) {
    ch.pages.forEach(function (p) {
      p.blocks.forEach(function (b) {
        var s = bs(b.id), st = statusOf(s);
        if (st === 'none') return;
        var o = { id: b.id, chapter: ch.id, page: p.n, status: st };
        if (st !== 'accepted') o.original = b.t;
        if (hasEdit(s)) o.edited_text = s.edit;
        if (s.com && s.com.trim()) o.comment = s.com.trim();
        blocks.push(o);
      });
    });
  });
  return { generated_at: new Date().toISOString(), contact: (opts.contact !== undefined ? opts.contact : state.contact || '').trim(), general_comment: (opts.general !== undefined ? opts.general : state.general || '').trim(), chapters: chapters, blocks: blocks };
}
function buildBody(opts) { return { expert: state.name || '', version: BOOK.version, payload: buildPayload(opts) }; }

/* ---------- текстовый файл ---------- */
function buildTxt() {
  var L = [], t = totals();
  L.push('ПРАВКИ К КНИГЕ «' + BOOK.title.toUpperCase() + '», версия ' + BOOK.version);
  L.push('Эксперт: ' + (state.name || '—'));
  L.push('Дата: ' + new Date().toLocaleString('ru-RU'));
  L.push('Проверено блоков: ' + t.reviewed + ' из ' + TOTAL + ' · принято: ' + t.accepted + ' · исправлено: ' + t.edited + ' · комментариев: ' + t.comments);
  if (state.contact) L.push('Связь: ' + state.contact);
  if (state.general && state.general.trim()) { L.push(''); L.push('ОБЩИЙ КОММЕНТАРИЙ К КНИГЕ:'); L.push(state.general.trim()); }
  BOOK.chapters.forEach(function (ch) {
    var c = state.chapters[ch.id] || {}, rows = [], acc = 0;
    ch.pages.forEach(function (p) {
      p.blocks.forEach(function (b) {
        var s = bs(b.id), st = statusOf(s);
        if (st === 'none') return;
        if (st === 'accepted') { acc++; return; }
        var r = ['[' + b.id + '] стр. ' + p.n];
        r.push('БЫЛО: ' + b.t);
        if (hasEdit(s)) r.push('СТАЛО: ' + (s.edit === '' ? '(текст удалить)' : s.edit));
        if (s.com && s.com.trim()) r.push('КОММЕНТАРИЙ: ' + s.com.trim());
        rows.push(r.join('\n'));
      });
    });
    var cm = (c.com || '').trim();
    if (!rows.length && !acc && !cm) return;
    L.push(''); L.push('============================================================');
    L.push(ch.title.toUpperCase() + '  (' + (chStatus(ch) === 'checked' ? 'проверена' : 'проверена частично') + ')');
    L.push('============================================================');
    if (cm) { L.push('ЗАМЕЧАНИЕ КО ВСЕЙ ГЛАВЕ: ' + cm); L.push(''); }
    if (acc) L.push('Принято без правок: ' + acc + ' блок(ов).');
    rows.forEach(function (r) { L.push(''); L.push(r); });
  });
  return L.join('\n') + '\n';
}

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

/* ---------- мелкие помощники DOM ---------- */
function $(id) { return document.getElementById(id); }
function h(tag, attrs, kids) {
  var e = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function (k) {
    var v = attrs[k];
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
    else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v);
  });
  (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return e;
}
function autosize(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(Math.max(ta.scrollHeight + 4, 90), 600) + 'px'; }
var toastT = null;
function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2200); }
function plural(n, a, b, c) { var m = n % 100, d = n % 10; if (m > 10 && m < 20) return c; if (d === 1) return a; if (d > 1 && d < 5) return b; return c; }

/* ---------- модальные окна ---------- */
var modalStack = [];
function openModal(title, content, opts) {
  opts = opts || {};
  var prev = document.activeElement;
  var m = $('modal');
  var dlg = h('div', { class: 'dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1' });
  var close = function () { stopDict(); m.hidden = true; m.textContent = ''; document.body.style.overflow = ''; modalStack.pop(); if (opts.onClose) opts.onClose(); if (prev && prev.focus) try { prev.focus(); } catch (e) {} };
  dlg.appendChild(h('button', { class: 'dlg-x', 'aria-label': 'Закрыть', text: '×', onclick: close }));
  if (title) dlg.appendChild(h('h2', { text: title }));
  dlg.appendChild(content);
  m.textContent = ''; m.appendChild(dlg); m.hidden = false; document.body.style.overflow = 'hidden';
  m.onmousedown = function (e) { if (e.target === m && !opts.sticky) close(); };
  modalStack.push(close);
  dlg.focus();
  return close;
}
function confirmDlg(title, text, okLabel, okClass) {
  return new Promise(function (res) {
    var done = false, close;
    var fin = function (v) { if (done) return; done = true; res(v); };
    var box = h('div', null, [
      h('p', { text: text }),
      h('div', { class: 'row' }, [
        h('button', { class: 'btn ' + (okClass || 'btn-primary'), text: okLabel || 'Да', onclick: function () { fin(true); close(); } }),
        h('button', { class: 'btn', text: 'Отмена', onclick: function () { fin(false); close(); } })
      ])
    ]);
    close = openModal(title, box, { onClose: function () { fin(false); } });
  });
}

/* ---------- диктовка ---------- */
var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
var dict = null; // {rec, ta, live, btn, wanted, onText}
function makeLive() {
  return h('div', { class: 'live', hidden: true, role: 'status' });
}
function liveShow(live, kind, msg, withStop) {
  live.className = 'live' + (kind ? ' ' + kind : ''); live.hidden = false; live.textContent = '';
  if (kind === 'rec') { live.appendChild(h('span', { class: 'pulse', 'aria-hidden': 'true' })); }
  live.appendChild(h('span', { text: msg }));
  if (withStop) live.appendChild(h('button', { class: 'btn btn-sm', text: 'Остановить', onclick: stopDict }));
  if (kind === 'rec') live.appendChild(h('span', { class: 'interim' }));
  if (kind === 'err' || kind === 'info') { setTimeout(function () { if (!dict || dict.live !== live) live.hidden = true; }, 9000); }
}
function stopDict() {
  if (!dict) return;
  var d = dict; dict = null; d.wanted = false;
  try { d.rec.stop(); } catch (e) {}
  if (d.btn) { d.btn.classList.remove('rec'); d.btn.setAttribute('aria-pressed', 'false'); var l = d.btn.querySelector('.ml'); if (l) l.textContent = 'Надиктовать'; }
  if (d.live) d.live.hidden = true;
}
function startDict(ta, live, btn, onText) {
  if (dict && dict.ta === ta) { stopDict(); return; }
  stopDict();
  if (!SR) { liveShow(live, 'info', NOTE_NO_SPEECH); return; }
  var rec;
  try { rec = new SR(); } catch (e) { liveShow(live, 'info', NOTE_NO_SPEECH); return; }
  rec.lang = 'ru-RU'; rec.continuous = true; rec.interimResults = true;
  var d = { rec: rec, ta: ta, live: live, btn: btn, wanted: true };
  dict = d;
  liveShow(live, 'rec', 'Говорите… идёт запись', true);
  if (btn) { btn.classList.add('rec'); btn.setAttribute('aria-pressed', 'true'); var l = btn.querySelector('.ml'); if (l) l.textContent = 'Остановить'; }
  rec.onresult = function (e) {
    var interim = '';
    for (var i = e.resultIndex; i < e.results.length; i++) {
      var r = e.results[i], tx = r[0].transcript;
      if (r.isFinal) {
        tx = tx.trim(); if (!tx) continue;
        var v = ta.value, sep = v && !/\s$/.test(v) ? ' ' : '';
        ta.value = v + sep + tx;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      } else interim += tx;
    }
    var it = live.querySelector('.interim'); if (it) it.textContent = interim;
  };
  rec.onerror = function (e) {
    var er = e.error, msg = null;
    if (er === 'not-allowed' || er === 'service-not-allowed') msg = 'Нет доступа к микрофону. Нажмите на значок замка слева от адреса страницы, разрешите микрофон и нажмите кнопку снова. Можно писать текстом.';
    else if (er === 'audio-capture') msg = 'Микрофон не найден. Проверьте, что он подключён, или пишите текстом.';
    else if (er === 'network') msg = 'Нет связи для распознавания речи. Попробуйте ещё раз позже или пишите текстом.';
    else if (er === 'language-not-supported') msg = 'Русский язык диктовки не поддерживается этим браузером. Пишите текстом.';
    if (msg) { d.wanted = false; var lv = d.live; stopDict(); liveShow(lv, 'err', msg); }
  };
  rec.onend = function () {
    if (dict === d && d.wanted) { try { rec.start(); } catch (e) { stopDict(); } }
  };
  try { rec.start(); } catch (e) { stopDict(); liveShow(live, 'err', 'Не удалось включить микрофон. Попробуйте ещё раз или пишите текстом.'); }
}
function micButton(label) {
  return h('button', { class: 'btn mic', type: 'button', 'aria-pressed': 'false' }, [h('span', { 'aria-hidden': 'true', text: '🎤' }), h('span', { class: 'ml', text: label || 'Надиктовать' })]);
}

/* ---------- карточка блока ---------- */
var blockEls = {};
function buildBlock(b, k) {
  var id = b.id;
  var chips = h('div', { class: 'chips' });
  var txt = h('div', { class: 'txt', text: b.t });
  var bAcc = h('button', { class: 'btn', type: 'button', 'aria-pressed': 'false' }, ['✓ Принять']);
  var bEdit = h('button', { class: 'btn', type: 'button', 'aria-pressed': 'false', 'aria-expanded': 'false' }, ['✎ Править']);
  var bCom = h('button', { class: 'btn', type: 'button', 'aria-pressed': 'false', 'aria-expanded': 'false' }, ['💬 Комментарий']);
  var bMic = micButton('Надиктовать');

  var taEdit = h('textarea', { id: 'ed-' + id, 'aria-label': 'Ваш вариант текста', spellcheck: 'true', lang: 'ru' });
  var diffEl = h('div', { class: 'diff', 'aria-live': 'polite' });
  var pEdit = h('div', { class: 'panel', hidden: true }, [
    h('label', { for: 'ed-' + id, text: 'Исправьте текст прямо здесь' }), taEdit,
    h('div', { class: 'diffbox' }, [h('div', { class: 'diff-lbl', text: 'Было → стало (зачёркнуто — убрано, подчёркнуто — добавлено)' }), diffEl]),
    h('div', { class: 'row' }, [
      h('button', { class: 'btn btn-blue', type: 'button', text: 'Сохранить правку', onclick: saveEdit }),
      h('button', { class: 'btn', type: 'button', text: 'Отменить правку', onclick: cancelEdit })
    ])
  ]);
  var taCom = h('textarea', { id: 'cm-' + id, 'aria-label': 'Комментарий к блоку', placeholder: 'Что здесь не так или что стоит уточнить?', spellcheck: 'true', lang: 'ru' });
  var pCom = h('div', { class: 'panel', hidden: true }, [h('label', { for: 'cm-' + id, text: 'Ваш комментарий' }), taCom]);
  var saved = h('div', { class: 'saved', hidden: true }, [h('div', { class: 'diff-lbl', text: 'Ваша правка (было → стало)' }), h('div', { class: 'diff' })]);
  var live = makeLive();
  var choice = h('div', { class: 'live info', hidden: true }, [
    h('div', { class: 'dt-choice' }, [
      h('b', { text: 'Куда записать то, что Вы скажете?' }),
      h('button', { class: 'btn btn-sm', type: 'button', text: 'В комментарий', onclick: function () { pickTarget('com'); } }),
      h('button', { class: 'btn btn-sm', type: 'button', text: 'В правку текста', onclick: function () { pickTarget('edit'); } })
    ])
  ]);

  var el = h('article', { class: 'blk', id: 'b-' + id }, [
    h('div', { class: 'blk-top' }, [h('span', { class: 'num', text: 'Блок ' + k }), chips]),
    txt,
    h('div', { class: 'acts' }, [bAcc, bEdit, bCom, bMic]),
    pEdit, pCom, saved, choice, live
  ]);

  function curText() { var s = bs(id); return hasEdit(s) ? s.edit : b.t; }
  function openEdit() {
    var s = bs(id);
    taEdit.value = typeof s.draft === 'string' ? s.draft : curText();
    pEdit.hidden = false; autosize(taEdit); updDiff(); refresh();
  }
  function closeEdit() { pEdit.hidden = true; refresh(); }
  function updDiff() { renderDiff(diffEl, b.t, taEdit.value); }
  function saveEdit() {
    var v = taEdit.value;
    if (v.trim() === b.t.trim()) { setB(id, { edit: null, draft: null }); toast('Текст не изменён — правка не сохранена'); }
    else { setB(id, { edit: v, draft: null }); toast('Правка сохранена'); }
    stopDictFor(taEdit); closeEdit(); updateAll();
  }
  function cancelEdit() { setB(id, { edit: null, draft: null }); stopDictFor(taEdit); closeEdit(); updateAll(); }
  function stopDictFor(ta) { if (dict && dict.ta === ta) stopDict(); }

  bAcc.onclick = function () { var s = bs(id); setB(id, { acc: !s.acc }); refresh(); updateAll(); };
  bEdit.onclick = function () { if (pEdit.hidden) openEdit(); else { var s = bs(id); if (typeof s.draft === 'string' && s.draft !== (hasEdit(s) ? s.edit : b.t)) {} closeEdit(); } };
  bCom.onclick = function () { if (pCom.hidden) { pCom.hidden = false; taCom.value = bs(id).com || ''; autosize(taCom); taCom.focus(); } else if (!taCom.value.trim()) pCom.hidden = true; else { pCom.hidden = true; } refresh(); };
  taEdit.addEventListener('input', function () { autosize(taEdit); updDiff(); setB(id, { draft: taEdit.value === curText() ? null : taEdit.value }); });
  taCom.addEventListener('input', function () { autosize(taCom); setB(id, { com: taCom.value }); refresh(); updateAll(true); });

  function pickTarget(t) { setB(id, { dt: t }); choice.hidden = true; beginDict(); }
  function beginDict() {
    var t = bs(id).dt;
    if (t === 'edit') { if (pEdit.hidden) openEdit(); startDict(taEdit, live, bMic); }
    else { if (pCom.hidden) { pCom.hidden = false; taCom.value = bs(id).com || ''; autosize(taCom); refresh(); } startDict(taCom, live, bMic); }
    if (dict && dict.live === live) { live.insertBefore(h('button', { class: 'btn btn-sm', type: 'button', text: 'Сменить: ' + (t === 'edit' ? 'сейчас в правку' : 'сейчас в комментарий'), onclick: function () { setB(id, { dt: t === 'edit' ? 'com' : 'edit' }); stopDict(); beginDict(); } }), live.querySelector('.interim')); }
  }
  bMic.onclick = function () {
    if (dict && (dict.ta === taEdit || dict.ta === taCom)) { stopDict(); return; }
    if (!SR) { liveShow(live, 'info', NOTE_NO_SPEECH); return; }
    if (!bs(id).dt) { choice.hidden = false; choice.querySelector('button').focus(); return; }
    beginDict();
  };

  function refresh() {
    var s = bs(id), st = statusOf(s), e = hasEdit(s), c = !!(s.com && s.com.trim());
    el.className = 'blk' + (s.acc ? ' acc' : '') + (e ? ' edit' : '') + (c ? ' com' : '');
    chips.textContent = '';
    var any = false;
    if (s.acc) { chips.appendChild(h('span', { class: 'chip c-acc', text: '✓ Принят' })); any = true; }
    if (e) { chips.appendChild(h('span', { class: 'chip c-edit', text: '✎ Исправлен' })); any = true; }
    if (c) { chips.appendChild(h('span', { class: 'chip c-com', text: '💬 С комментарием' })); any = true; }
    if (!any) chips.appendChild(h('span', { class: 'chip c-none', text: 'Не проверен' }));
    bAcc.className = 'btn' + (s.acc ? ' on-acc' : ''); bAcc.setAttribute('aria-pressed', s.acc ? 'true' : 'false'); bAcc.firstChild.textContent = s.acc ? '✓ Принят' : '✓ Принять';
    bEdit.className = 'btn' + (e ? ' on-edit' : ''); bEdit.setAttribute('aria-pressed', e ? 'true' : 'false'); bEdit.setAttribute('aria-expanded', pEdit.hidden ? 'false' : 'true');
    bCom.className = 'btn' + (c ? ' on-com' : ''); bCom.setAttribute('aria-pressed', c ? 'true' : 'false'); bCom.setAttribute('aria-expanded', pCom.hidden ? 'false' : 'true');
    if (e && pEdit.hidden) { saved.hidden = false; renderDiff(saved.querySelector('.diff'), b.t, s.edit); } else saved.hidden = true;
  }
  // начальное состояние
  var s0 = bs(id);
  if (s0.com && s0.com.trim()) { pCom.hidden = false; taCom.value = s0.com; setTimeout(function () { autosize(taCom); }, 0); }
  if (typeof s0.draft === 'string') { pEdit.hidden = false; taEdit.value = s0.draft; setTimeout(function () { autosize(taEdit); }, 0); updDiff(); }
  refresh();
  blockEls[id] = { el: el, refresh: refresh, taCom: taCom, taEdit: taEdit, pCom: pCom, pEdit: pEdit };
  return el;
}

/* ---------- экран главы ---------- */
var curCh = null;
function chIndex(id) { for (var i = 0; i < BOOK.chapters.length; i++) if (BOOK.chapters[i].id === id) return i; return 0; }
function openChapter(id, noScroll) {
  stopDict();
  var i = chIndex(id), ch = BOOK.chapters[i]; curCh = ch; state.ui.ch = ch.id; save();
  try { history.replaceState(null, '', '#' + ch.id); } catch (e) {}
  blockEls = {};
  var main = $('main'); main.textContent = '';

  function navBtns() {
    var prev = BOOK.chapters[i - 1], next = BOOK.chapters[i + 1];
    return h('div', { class: 'ch-nav' }, [
      h('button', { class: 'btn', type: 'button', disabled: !prev, onclick: function () { openChapter(prev.id); }, 'aria-label': prev ? 'Предыдущая глава: ' + prev.title : 'Предыдущей главы нет' }, ['← Предыдущая глава']),
      h('button', { class: 'btn', type: 'button', disabled: !next, onclick: function () { openChapter(next.id); }, 'aria-label': next ? 'Следующая глава: ' + next.title : 'Следующей главы нет' }, ['Следующая глава →'])
    ]);
  }
  main.appendChild(h('div', { class: 'ch-head' }, [h('h2', { text: ch.title }), navBtns()]));
  main.appendChild(h('p', { class: 'ch-sub', text: 'Страницы ' + ch.from + '–' + ch.to + ' · блоков текста: ' + ch.total }));

  var help = h('details', { class: 'help' }, [
    h('summary', { text: 'Как проверять главу' }),
    h('p', { text: 'Слева — страница книги как она выглядит (нажмите на неё, чтобы увеличить), справа — её текст по блокам. Если блок верен, нажмите «Принять». Если нужно исправить, нажмите «Править», измените текст — ниже сразу видно, что было и что стало. Если хотите оставить замечание — «Комментарий», а если удобнее сказать голосом — «Надиктовать». В конце главы можно принять всё оставшееся одной кнопкой, а внизу экрана — отправить правки нам; всё сохраняется само.' })
  ]);
  if (state.ui.help !== false) help.open = true;
  help.addEventListener('toggle', function () { state.ui.help = help.open; saveSoon(); });
  main.appendChild(help);

  ch.pages.forEach(function (p) {
    var img = h('img', { src: p.img, alt: 'Страница ' + p.n + ' книги', loading: 'lazy', decoding: 'async', width: '868', height: '1228' });
    var zb = h('button', { type: 'button', 'aria-label': 'Увеличить страницу ' + p.n, onclick: function () { zoom(p); } }, [img, h('span', { class: 'zoom-hint', text: '🔍 Увеличить' })]);
    var blocks = h('div', { class: 'pg-blocks' });
    p.blocks.forEach(function (b, k) { blocks.appendChild(buildBlock(b, k + 1)); });
    main.appendChild(h('section', { class: 'pg', 'aria-label': 'Страница ' + p.n }, [
      h('div', { class: 'pg-img' }, [h('p', { class: 'pg-label', text: 'Страница ' + p.n }), zb]),
      blocks
    ]));
  });

  // итог главы
  var chState = function () { return state.chapters[ch.id] || {}; };
  var taCh = h('textarea', { id: 'chcom', 'aria-label': 'Замечание ко всей главе', placeholder: 'Общее впечатление от главы, пропущенные темы, структура…', spellcheck: 'true', lang: 'ru' });
  taCh.value = chState().com || '';
  taCh.addEventListener('input', function () { autosize(taCh); state.chapters[ch.id] = Object.assign({}, chState(), { com: taCh.value }); saveSoon(); updateAll(true); });
  setTimeout(function () { if (taCh.value) autosize(taCh); }, 0);
  var liveCh = makeLive();
  var micCh = micButton('Надиктовать замечание');
  micCh.onclick = function () { startDict(taCh, liveCh, micCh); };
  var statusLine = h('p', { class: 'ch-status', hidden: true, role: 'status' });
  var bDone = h('button', { class: 'btn btn-blue', type: 'button' });
  function refreshCh() {
    var done = !!chState().done, st = chStatus(ch);
    bDone.textContent = done ? '↺ Снять отметку «проверена»' : '✔ Отметить главу как проверенную';
    statusLine.hidden = st !== 'checked'; statusLine.textContent = '✔ Глава проверена. Можно переходить к следующей.';
  }
  bDone.onclick = function () {
    var st = chState();
    if (st.done) { state.chapters[ch.id] = Object.assign({}, st, { done: false }); save(); refreshCh(); updateAll(); return; }
    var left = ch.total - chCounts(ch);
    var go = function () { state.chapters[ch.id] = Object.assign({}, chState(), { done: true }); save(); refreshCh(); updateAll(); toast('Глава отмечена как проверенная'); };
    if (left > 0) confirmDlg('Отметить главу проверенной?', 'В этой главе ' + left + ' ' + plural(left, 'блок', 'блока', 'блоков') + ' без отметки. Будем считать, что замечаний к ним нет? (Сами блоки останутся неотмеченными.)', 'Да, глава проверена').then(function (y) { if (y) go(); });
    else go();
  };
  var bAll = h('button', { class: 'btn btn-primary', type: 'button', text: '✓ Принять всю главу', onclick: function () {
    var left = []; ch.pages.forEach(function (p) { p.blocks.forEach(function (b) { if (!reviewed(bs(b.id))) left.push(b.id); }); });
    if (!left.length) { toast('Все блоки главы уже отмечены'); return; }
    confirmDlg('Принять всю главу?', 'Ещё не проверенные блоки (' + left.length + ') будут отмечены как принятые без правок. Блоки, которые Вы уже исправили или прокомментировали, не изменятся.', 'Да, принять ' + left.length + ' ' + plural(left.length, 'блок', 'блока', 'блоков')).then(function (y) {
      if (!y) return;
      left.forEach(function (id) { var s = bs(id); state.blocks[id] = Object.assign({}, s, { acc: true }); if (blockEls[id]) blockEls[id].refresh(); });
      save(); updateAll(); toast('Принято блоков: ' + left.length);
    });
  } });
  main.appendChild(h('section', { class: 'ch-panel', id: 'chend', 'aria-label': 'Итог главы' }, [
    h('h3', { text: 'Итог главы' }),
    h('div', { class: 'row' }, [bAll, bDone]),
    h('div', { class: 'field' }, [h('label', { for: 'chcom', text: 'Замечание ко всей главе' }), taCh, micCh.parentNode ? null : h('div', { class: 'row' }, [micCh]), liveCh]),
    statusLine
  ]));
  main.appendChild(h('div', { class: 'ch-nav-bottom' }, [navBtns()]));
  refreshCh();
  refreshChHook = refreshCh;
  updateAll();
  if (!noScroll) { window.scrollTo(0, 0); }
  document.body.classList.remove('drawer'); $('btnChapters').setAttribute('aria-expanded', 'false');
}
var refreshChHook = function () {};

function zoom(p) {
  var prev = document.activeElement;
  var z = h('div', { class: 'zoom', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Страница ' + p.n + ' крупно', tabindex: '-1' }, [
    h('div', { class: 'zoom-note', text: 'Страница ' + p.n + ' · прокручивайте пальцем или колёсиком' }),
    h('button', { class: 'dlg-x', 'aria-label': 'Закрыть увеличенную страницу', text: '×', onclick: close }),
    h('img', { src: p.img, alt: 'Страница ' + p.n + ' крупно' })
  ]);
  function close() { z.remove(); modalStack = modalStack.filter(function (f) { return f !== close; }); document.body.style.overflow = ''; if (prev && prev.focus) try { prev.focus(); } catch (e) {} }
  document.body.appendChild(z); document.body.style.overflow = 'hidden'; modalStack.push(close); z.focus();
}

/* ---------- боковая панель, счётчики ---------- */
var sideEls = {};
function buildSide() {
  var ol = $('chList'); ol.textContent = ''; sideEls = {};
  BOOK.chapters.forEach(function (ch) {
    var dot = h('span', { class: 'dot', 'aria-hidden': 'true' });
    var cnt = h('span'); var st = h('span');
    var bar = h('div', { class: 'bar', 'aria-hidden': 'true' }, [h('i')]);
    var btn = h('button', { class: 'chitem', type: 'button', onclick: function () { openChapter(ch.id); } }, [
      h('span', { class: 'ct' }, [dot, h('span', { text: ch.title })]),
      h('span', { class: 'cs' }, [cnt, st]), bar
    ]);
    ol.appendChild(h('li', null, [btn]));
    sideEls[ch.id] = { btn: btn, cnt: cnt, st: st, bar: bar.firstChild };
  });
}
var STL = { checked: 'проверена', partial: 'в работе', untouched: '' };
function updateSide() {
  BOOK.chapters.forEach(function (ch) {
    var e = sideEls[ch.id], r = chCounts(ch), st = chStatus(ch);
    e.cnt.textContent = 'проверено ' + r + ' из ' + ch.total; e.st.textContent = STL[st];
    e.btn.className = 'chitem ' + st + (curCh && curCh.id === ch.id ? ' active' : '');
    if (curCh && curCh.id === ch.id) e.btn.setAttribute('aria-current', 'true'); else e.btn.removeAttribute('aria-current');
    e.bar.style.width = (ch.total ? Math.round(r / ch.total * 100) : 0) + '%';
  });
}
function updateBottom() {
  var t = totals();
  var c = $('counter'); c.textContent = '';
  c.appendChild(document.createTextNode('Проверено ' + t.reviewed + ' из ' + TOTAL + ' · исправлено ' + t.edited + ' · комментариев ' + t.comments));
  if (state.sent) c.appendChild(h('small', { text: 'Отправлено ' + fmtDate(state.sent.at) }));
  $('btnSend').textContent = state.sent ? 'Отправить дополнение →' : 'Отправить правки →';
  var pct = TOTAL ? Math.round(t.reviewed / TOTAL * 100) : 0;
  $('totalTxt').textContent = t.reviewed + ' из ' + TOTAL + ' (' + pct + '%)';
  $('totalBar').style.width = pct + '%';
}
function fmtDate(ms) { try { return new Date(ms).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
function updateAll(light) { updateSide(); updateBottom(); if (!light) refreshChHook(); else refreshChHook(); }

/* ---------- отправка и файлы ---------- */
function download(name, text, mime) {
  var blob = new Blob([text], { type: mime + ';charset=utf-8' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function fileStem() { var d = new Date(), p = function (n) { return ('0' + n).slice(-2); }; var nm = (state.name || 'expert').replace(/[^\wА-Яа-яЁё]+/g, '_').slice(0, 30); return 'pravki_knigi_' + nm + '_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()); }
function dlJson() { download(fileStem() + '.json', JSON.stringify(buildBody(), null, 2), 'application/json'); }
function dlTxt() { download(fileStem() + '.txt', buildTxt(), 'text/plain'); }
function dlRow() {
  return h('div', { class: 'dl-row' }, [
    h('button', { class: 'btn btn-blue', type: 'button', text: '⬇ Скачать файл правок (.json)', onclick: dlJson }),
    h('button', { class: 'btn', type: 'button', text: '⬇ Скачать текстом (.txt)', onclick: dlTxt })
  ]);
}

function openFileMenu() {
  var t = totals();
  var box = h('div', null, [
    h('p', { text: 'Всё, что Вы сделали, сохраняется в этом браузере автоматически. Файл можно скачать в любой момент и прислать нам вручную.' }),
    dlRow(),
    h('div', { class: 'row' }, [
      h('button', { class: 'btn btn-danger', type: 'button', text: 'Сбросить всё…', onclick: resetAll }),
      h('button', { class: 'btn', type: 'button', text: 'Выйти', onclick: function () { lsDel(LS_AUTH); location.reload(); } })
    ])
  ]);
  openModal('Файл правок', box);
}
function resetAll() {
  confirmDlg('Сбросить всё?', 'Будут стёрты все Ваши отметки, правки и комментарии на этом устройстве. Это нельзя отменить.', 'Да, сбросить', 'btn-danger').then(function (y) {
    if (!y) return;
    confirmDlg('Точно сбросить?', 'Последнее предупреждение: все правки пропадут. Если нужно, сначала скачайте файл правок.', 'Да, стереть всё', 'btn-primary').then(function (y2) {
      if (!y2) return;
      var nm = state.name; state = { name: nm, blocks: {}, chapters: {}, general: '', contact: '', sent: null, ui: { ch: BOOK.chapters[0].id, help: true } };
      save(); stopDict(); var m = $('modal'); m.hidden = true; m.textContent = ''; document.body.style.overflow = ''; modalStack.length = 0;
      openChapter(BOOK.chapters[0].id); toast('Всё сброшено');
    });
  });
}

function openSend() {
  var t = totals(), complete = t.chChecked === BOOK.chapters.length;
  var taGen = h('textarea', { id: 'gen', 'aria-label': 'Общий комментарий к книге', placeholder: 'Общее впечатление, что добавить или убрать…', spellcheck: 'true', lang: 'ru' }); taGen.value = state.general || '';
  taGen.addEventListener('input', function () { state.general = taGen.value; saveSoon(); });
  var liveG = makeLive(); var micG = micButton('Надиктовать'); micG.onclick = function () { startDict(taGen, liveG, micG); };
  var inContact = h('input', { id: 'contact', type: 'text', placeholder: 'Телефон или e-mail', autocomplete: 'off' }); inContact.value = state.contact || '';
  inContact.addEventListener('input', function () { state.contact = inContact.value; saveSoon(); });
  var force = h('input', { type: 'checkbox', id: 'force' });
  var chk = h('label', { class: 'chk', hidden: complete }, [force, h('span', { text: 'Отправить сейчас, даже если не все главы проверены (проверено глав: ' + t.chChecked + ' из ' + BOOK.chapters.length + ')' })]);
  var status = h('div', { 'aria-live': 'polite' });
  var send = h('button', { class: 'btn btn-primary btn-xl', type: 'button', text: state.sent ? 'Отправить дополнение' : 'Отправить' });
  function upd() { send.disabled = !(complete || force.checked) ; }
  force.addEventListener('change', upd); upd();
  var body = h('div', null, [
    state.sent ? h('p', { text: 'Ранее отправлено ' + fmtDate(state.sent.at) + '. Новая отправка дополнит предыдущую.' }) : null,
    h('div', { class: 'sum' }, [
      h('div', null, [h('b', { text: String(t.accepted) }), 'принято']),
      h('div', null, [h('b', { text: String(t.edited) }), 'исправлено']),
      h('div', null, [h('b', { text: String(t.comments) }), 'комментариев'])
    ]),
    h('div', { class: 'field' }, [h('label', { for: 'gen', text: 'Общий комментарий к книге' }), taGen, h('div', { class: 'row' }, [micG]), liveG]),
    h('div', { class: 'field' }, [h('label', { for: 'contact', text: 'Как с Вами связаться (необязательно)' }), inContact]),
    chk, status, send
  ]);
  var close = openModal('Отправка правок', body, { sticky: true });
  send.onclick = function () {
    stopDict();
    send.disabled = true; send.textContent = 'Отправляем…'; status.textContent = '';
    var payload = JSON.stringify(buildBody({ general: taGen.value, contact: inContact.value }));
    if (payload.length > MAX_PAYLOAD) { showErr('Объём правок слишком большой для отправки одним сообщением.'); return; }
    var ctrl = window.AbortController ? new AbortController() : null;
    var to = setTimeout(function () { if (ctrl) ctrl.abort(); }, 25000);
    fetch(API_URL, { method: 'POST', headers: { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }, body: payload, signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { clearTimeout(to); if (!r.ok) throw new Error('HTTP ' + r.status); state.sent = { at: Date.now(), count: t.reviewed }; save(); updateAll(); thanks(); })
      .catch(function (e) { clearTimeout(to); showErr(); });
  };
  function showErr(msg) {
    status.textContent = '';
    status.appendChild(h('div', { class: 'errbox', role: 'alert' }, [
      h('p', null, [h('b', { text: 'Не получилось отправить. ' }), 'Скачайте файл и пришлите нам. ' + (msg || 'Ваши правки никуда не пропали — они сохранены на этом устройстве.')]),
      dlRow()
    ]));
    send.disabled = false; send.textContent = 'Попробовать ещё раз'; upd();
  }
  function thanks() {
    body.textContent = '';
    body.appendChild(h('div', { class: 'thanks' }, [
      h('div', { class: 'big', 'aria-hidden': 'true', text: '🎉' }),
      h('h2', { text: 'Спасибо! Правки отправлены.' }),
      h('p', { text: 'Мы внесём их и пришлём новую версию. Если захотите что-то добавить, можно отправить дополнение.' }),
      h('button', { class: 'btn btn-primary', type: 'button', text: 'Закрыть', onclick: close })
    ]));
    var hh = body.parentNode.querySelector('h2'); if (hh && hh !== body.querySelector('h2')) hh.textContent = 'Готово';
  }
}

/* ---------- вход и запуск ---------- */
function showApp() {
  $('login').hidden = true; $('app').hidden = false;
  $('whoami').textContent = state.name ? 'Эксперт: ' + state.name : '';
  buildSide();
  var hid = (location.hash || '').slice(1), start = CHM[hid] ? hid : (CHM[state.ui.ch] ? state.ui.ch : BOOK.chapters[0].id);
  openChapter(start, true);
}
function initLogin() {
  $('loginVer').textContent = BOOK.version;
  $('login').hidden = false; $('app').hidden = true;
  var nm = $('uname'); nm.value = state.name || lsGet('asdbook:name') || '';
  $('loginForm').onsubmit = function (e) {
    e.preventDefault();
    var err = $('loginErr'); err.hidden = true;
    var code = $('code').value.trim(), name = nm.value.trim();
    if (!name) { err.textContent = 'Пожалуйста, укажите Ваше имя.'; err.hidden = false; nm.focus(); return; }
    sha256(code).then(function (hx) {
      if (hx !== CODE_HASH) { err.textContent = 'Код не подошёл. Проверьте, пожалуйста, и попробуйте ещё раз.'; err.hidden = false; $('code').focus(); return; }
      state.name = name; lsSet('asdbook:name', name); lsSet(LS_AUTH, JSON.stringify({ ok: 1, h: CODE_HASH.slice(0, 12) })); save(); showApp();
    });
  };
  $('code').focus();
}

function isAuthed() {
  var a = lsGet(LS_AUTH); if (!a) return false;
  try { var o = JSON.parse(a); return o && o.ok === 1 && o.h === CODE_HASH.slice(0, 12); } catch (e) { return false; }
}

function init() {
  loadState();
  $('btnChapters').onclick = function () { var o = document.body.classList.toggle('drawer'); $('btnChapters').setAttribute('aria-expanded', o ? 'true' : 'false'); };
  $('scrim').onclick = function () { document.body.classList.remove('drawer'); $('btnChapters').setAttribute('aria-expanded', 'false'); };
  $('btnMenu').onclick = openFileMenu;
  $('btnSend').onclick = openSend;
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (modalStack.length) { modalStack[modalStack.length - 1](); e.preventDefault(); }
      else if (document.body.classList.contains('drawer')) { $('scrim').click(); }
    }
  });
  window.addEventListener('hashchange', function () { var id = (location.hash || '').slice(1); if (CHM[id] && curCh && curCh.id !== id && !$('app').hidden) openChapter(id); });
  window.addEventListener('beforeunload', save);
  if (isAuthed() && state.name) showApp(); else initLogin();
}

/* ---------- демо-заполнение для тестов ---------- */
window.__demoFill = function () {
  var ch = BOOK.chapters[0], ids = [];
  ch.pages.forEach(function (p) { p.blocks.forEach(function (b) { ids.push(b); }); });
  ids.slice(0, 5).forEach(function (b) { setB(b.id, { acc: true }); });
  if (ids[5]) { var e5 = ids[5].t.split(' '); e5.splice(Math.max(1, e5.length - 3), 3, 'исправленные', 'слова', 'в конце.'); setB(ids[5].id, { edit: e5.join(' '), com: 'Здесь лучше уточнить формулировку.' }); }
  if (ids[6]) setB(ids[6].id, { edit: ids[6].t.split(' ').slice(0, Math.ceil(ids[6].t.split(' ').length / 2)).join(' ') + ' (добавлено экспертом).' });
  if (ids[7]) setB(ids[7].id, { com: 'Предлагаю добавить пример из практики.' });
  state.chapters[ch.id] = Object.assign({}, state.chapters[ch.id] || {}, { com: 'Глава написана понятно, но не хватает примеров.' });
  save();
  if (!$('app').hidden) openChapter(state.ui.ch || ch.id, true);
  return totals();
};
window.__core = { diffWords: diffWords, buildPayload: buildPayload, buildBody: buildBody, buildTxt: buildTxt, totals: totals, sha256: sha256, sha256Fallback: sha256Fallback, state: function () { return state; }, setB: setB, CODE_HASH: CODE_HASH };

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

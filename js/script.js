(() => {
'use strict';

/* ========== Utilidades ========== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = o => JSON.parse(JSON.stringify(o));
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmt = s => { s = Math.max(0, s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const emoji = e => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="52" font-size="70" text-anchor="middle" dominant-baseline="central">${e}</text></svg>`);

const MODES = { wi: ['word', 'img'], iw: ['img', 'word'], ww: ['word', 'word2'], ii: ['img', 'img2'] };
const LABEL = { word: 'Palabra', word2: 'Palabra (pareja)', img: 'Imagen', img2: 'Imagen (pareja)' };
const PENALTY = 5;

let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
}
function show(id) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  window.scrollTo(0, 0);
}

/* ========== Sonido (Web Audio API) ========== */
const Sound = {
  on: true, ctx: null,
  seqs: {
    drag: [[520, 0, .09, 'triangle']],
    tick: [[440, 0, .12, 'square', .08]],
    ok: [[660, 0, .12, 'sine'], [880, .12, .22, 'sine']],
    bad: [[240, 0, .16, 'sawtooth', .1], [160, .16, .28, 'sawtooth', .1]],
    win: [[523, 0, .15], [659, .15, .15], [784, .3, .15], [1047, .45, .45]]
  },
  play(name) {
    if (!this.on) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = this.ctx || new AC();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const t0 = this.ctx.currentTime;
      this.seqs[name].forEach(([f, st, d, type = 'sine', v = .16]) => {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = type; o.frequency.value = f;
        g.gain.setValueAtTime(0, t0 + st);
        g.gain.linearRampToValueAtTime(v, t0 + st + .02);
        g.gain.exponentialRampToValueAtTime(.001, t0 + st + d);
        o.connect(g).connect(this.ctx.destination);
        o.start(t0 + st); o.stop(t0 + st + d + .05);
      });
    } catch (e) { /* sin audio disponible */ }
  }
};

/* ========== Datos y LocalStorage ========== */
function defaultActivity() {
  const data = [['Manzana', '🍎'], ['Perro', '🐶'], ['Carro', '🚗'], ['Sol', '☀️'], ['Árbol', '🌳'], ['Gato', '🐱']];
  return {
    id: 'demo', title: 'Palabras y dibujos',
    mode: 'wi', count: 6, time: 0, sound: true,
    pairs: data.map(([w, e]) => ({ id: uid(), word: w, img: emoji(e), word2: '', img2: '' }))
  };
}
function blankActivity() {
  return {
    id: uid(), title: 'Mi actividad', mode: 'wi', count: 4, time: 0, sound: true,
    pairs: Array.from({ length: 4 }, () => ({ id: uid(), word: '', img: '', word2: '', img2: '' }))
  };
}
const Store = {
  KEY: 'rc_activities', CUR: 'rc_current',
  load() {
    try { const a = JSON.parse(localStorage.getItem(this.KEY)); if (Array.isArray(a) && a.length) return a; } catch (e) { }
    return [defaultActivity()];
  },
  save(list) {
    try { localStorage.setItem(this.KEY, JSON.stringify(list)); return true; }
    catch (e) { toast('No se pudo guardar (almacenamiento lleno). Usa imágenes más pequeñas.'); return false; }
  },
  setCurrent(id) { try { localStorage.setItem(this.CUR, id); } catch (e) { } },
  getCurrent() { try { return localStorage.getItem(this.CUR); } catch (e) { return null; } }
};
const S = { acts: [], current: null };
const curAct = () => S.acts.find(a => a.id === S.current) || S.acts[0];

function validate(a) {
  if (!a.title.trim()) return 'Escribe un título para la actividad.';
  const [l, r] = MODES[a.mode];
  if (a.pairs.length < 2) return 'Agrega al menos 2 parejas.';
  for (let i = 0; i < a.pairs.length; i++) {
    const p = a.pairs[i];
    if (!String(p[l] || '').trim() || !String(p[r] || '').trim()) return `Completa la pareja ${i + 1} (${LABEL[l]} y ${LABEL[r]}).`;
  }
  if (!(a.count >= 2 && a.count <= a.pairs.length)) return `La cantidad de parejas debe estar entre 2 y ${a.pairs.length}.`;
  if (!(a.time >= 0)) return 'El tiempo límite no es válido.';
  return '';
}

/* ========== Pantalla de inicio ========== */
function renderHome() {
  const sel = $('#homeSelect'); sel.innerHTML = '';
  S.acts.forEach(a => { const o = el('option', '', a.title); o.value = a.id; sel.append(o); });
  sel.value = curAct().id;
}
$('#homeSelect').addEventListener('change', e => { S.current = e.target.value; Store.setCurrent(S.current); renderHome(); });
$('#btnStart').addEventListener('click', () => { Sound.play('tick'); Game.start(curAct()); });
$('#btnConfig').addEventListener('click', () => Admin.open(curAct()));

/* ========== Modal de confirmación (eliminar) ========== */
const Confirm = {
  cb: null, onCancel: null,
  ask(text, cb, o = {}) {
    this.cb = cb; this.onCancel = o.onCancel || null;
    $('#cText').textContent = text; $('#cYes').textContent = o.yes || 'SÍ, ELIMINAR';
    $('#cModal .logo').textContent = o.icon || '🗑️';
    $('#cModal').classList.add('show'); $('#cNo').focus();
  },
  close() { $('#cModal').classList.remove('show'); this.cb = null; this.onCancel = null; },
  cancel() { const f = this.onCancel; this.close(); if (f) f(); }
};
$('#cNo').addEventListener('click', () => Confirm.cancel());
$('#cYes').addEventListener('click', () => { const f = Confirm.cb; Confirm.close(); if (f) f(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#cModal').classList.contains('show')) Confirm.cancel(); });

/* ========== Panel de configuración ========== */
function readImage(file) {
  return new Promise((res, rej) => {
    if (!file || !file.type.startsWith('image/')) return rej();
    const fr = new FileReader();
    fr.onerror = rej;
    fr.onload = () => {
      const im = new Image();
      im.onerror = rej;
      im.onload = () => {
        const k = Math.min(1, 320 / Math.max(im.width, im.height));
        const c = document.createElement('canvas');
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        x.drawImage(im, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', .82));
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

const Admin = {
  d: null,
  open(act) { this.d = clone(act || blankActivity()); this.fill(); show('admin'); },
  fill() {
    const d = this.d;
    $('#aTitle').value = d.title; $('#aMode').value = d.mode;
    $('#aCount').value = d.count; $('#aTime').value = d.time; $('#aSound').checked = d.sound;
    this.savedList(); this.pairs();
  },
  read() {
    const d = this.d;
    d.title = $('#aTitle').value; d.mode = $('#aMode').value;
    d.count = parseInt($('#aCount').value, 10) || 0; d.time = parseInt($('#aTime').value, 10) || 0; d.sound = $('#aSound').checked;
  },
  savedList() {
    const s = $('#aSaved'); s.innerHTML = '';
    S.acts.forEach(a => { const o = el('option', '', a.title); o.value = a.id; s.append(o); });
    s.value = S.acts.some(a => a.id === this.d.id) ? this.d.id : S.acts[0].id;
  },
  pairs() {
    const box = $('#aPairs'), d = this.d; box.innerHTML = '';
    $('#aPairCount').textContent = d.pairs.length + ' parejas';
    d.pairs.forEach((p, i) => {
      const row = el('div', 'prow'); row.append(el('span', 'n', i + 1));
      MODES[d.mode].forEach(f => row.append(this.field(p, f)));
      const del = el('button', 'btn small red', '🗑'); del.title = 'Eliminar pareja'; del.setAttribute('aria-label', 'Eliminar pareja ' + (i + 1));
      del.onclick = () => {
        this.read();
        if (d.pairs.length <= 2) return toast('Debe haber al menos 2 parejas.');
        Confirm.ask(`¿Seguro que deseas eliminar la pareja ${i + 1}? Esta acción no se puede deshacer.`, () => {
          d.pairs.splice(i, 1); d.count = Math.min(d.count, d.pairs.length); $('#aCount').value = d.count; this.pairs();
          toast('Pareja eliminada');
        });
      };
      row.append(del); box.append(row);
    });
  },
  field(p, f) {
    const w = el('label', 'field'); w.append(el('small', '', LABEL[f]));
    if (f.startsWith('img')) {
      const t = el('div', 'thumb');
      if (p[f]) { const im = el('img'); im.src = p[f]; im.alt = ''; t.append(im); }
      const inp = el('input'); inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = async () => {
        try { p[f] = await readImage(inp.files[0]); this.pairs(); }
        catch (e) { toast('Archivo no válido. Elige una imagen.'); }
      };
      t.append(inp); w.append(t);
    } else {
      const inp = el('input'); inp.type = 'text'; inp.maxLength = 40; inp.value = p[f] || ''; inp.placeholder = 'Escribe aquí…';
      inp.oninput = () => { p[f] = inp.value; };
      w.append(inp);
    }
    return w;
  },
  save() {
    this.read();
    const err = validate(this.d);
    if (err) { toast('⚠ ' + err); return false; }
    const i = S.acts.findIndex(a => a.id === this.d.id);
    const copy = clone(this.d);
    if (i >= 0) S.acts[i] = copy; else S.acts.push(copy);
    if (!Store.save(S.acts)) { if (i < 0) S.acts.pop(); return false; }
    S.current = copy.id; Store.setCurrent(copy.id); this.savedList(); toast('Actividad guardada ✅');
    return true;
  }
};
$('#aMode').addEventListener('change', () => { Admin.read(); Admin.pairs(); });
$('#aAdd').addEventListener('click', () => {
  Admin.read(); const d = Admin.d;
  if (d.pairs.length >= 30) return toast('Máximo 30 parejas.');
  const wasAll = d.count >= d.pairs.length;
  d.pairs.push({ id: uid(), word: '', img: '', word2: '', img2: '' });
  if (wasAll && d.count < 12) { d.count = d.pairs.length; $('#aCount').value = d.count; }
  Admin.pairs();
});
$('#aSave').addEventListener('click', () => Admin.save());
$('#aPlay').addEventListener('click', () => { if (Admin.save()) Game.start(curAct()); });
$('#aBack').addEventListener('click', () => { renderHome(); show('home'); });
$('#aLoad').addEventListener('click', () => {
  const a = S.acts.find(x => x.id === $('#aSaved').value); if (a) { Admin.open(a); toast('Actividad cargada'); }
});
$('#aDelete').addEventListener('click', () => {
  const id = $('#aSaved').value;
  if (!S.acts.some(a => a.id === id)) return;
  const a = S.acts.find(x => x.id === id);
  Confirm.ask(`¿Seguro que deseas eliminar la actividad «${a.title}»? Esta acción no se puede deshacer.`, () => {
    S.acts = S.acts.filter(x => x.id !== id);
    if (!S.acts.length) S.acts = [defaultActivity()];
    Store.save(S.acts); S.current = S.acts[0].id; Store.setCurrent(S.current);
    Admin.open(S.acts[0]); toast('Actividad eliminada');
  });
});
$('#aReset').addEventListener('click', () => {
  Admin.open(Object.assign(blankActivity(), { title: '' }));
  $('#aTitle').value = ''; $('#aTitle').focus(); toast('Configuración reiniciada');
});

/* ========== Juego ========== */
const G = { act: null, done: new Set(), lines: [], ok: 0, tries: 0, err: 0, sec: 0, total: 0, active: false, paused: false, sel: null, tp: null, token: 0, timer: null, suppress: false };
const board = () => $('#board');
const card = (side, pid) => $(`.item[data-side="${side}"][data-pid="${pid}"]`);

const Game = {
  start(act) {
    const err = validate(act);
    if (err) return toast('⚠ ' + err);
    clearInterval(G.timer); G.token++;
    Object.assign(G, { act, done: new Set(), lines: [], ok: 0, tries: 0, err: 0, sec: 0, active: false, paused: false, sel: null, tp: null });
    Sound.on = act.sound; $('#gSound').textContent = Sound.on ? '🔊' : '🔇';
    const pairs = shuffle(act.pairs).slice(0, act.count); G.total = pairs.length;
    const [lf, rf] = MODES[act.mode];
    const mk = (p, f) => ({ pid: p.id, type: f.startsWith('img') ? 'img' : 'txt', val: p[f] });
    const left = pairs.map(p => mk(p, lf)), right = pairs.map(p => mk(p, rf));
    $('#gTitle').textContent = act.title; $('#board').style.setProperty('--n', G.total); $('#board').style.setProperty('--row', MODES[act.mode].some(f => f.startsWith('img')) ? '96px' : '62px');
    this.render(shuffle(left), shuffle(right));
    this.stats(); this.say('', '');
    $('#board').classList.add('disabled');
    show('game'); this.drawLines();
    const token = G.token;
    this.countdown(token, () => {
      if (token !== G.token) return;
      G.active = true; $('#board').classList.remove('disabled');
      G.timer = setInterval(() => this.tick(), 1000);
    });
  },
  countdown(token, done) {
    const o = $('#countdown'), n = $('#cdNum'), seq = ['3', '2', '1', '¡COMIENZA!']; let i = 0;
    o.classList.add('show');
    const step = () => {
      if (token !== G.token) { o.classList.remove('show'); return; }
      n.textContent = seq[i]; n.classList.remove('tick'); void n.offsetWidth; n.classList.add('tick');
      Sound.play(i === 3 ? 'ok' : 'tick'); i++;
      setTimeout(i < seq.length ? step : () => { o.classList.remove('show'); done(); }, 900);
    };
    step();
  },
  tick() {
    if (!G.active || G.paused) return;
    G.sec++; this.stats();
    if (G.act.time > 0 && G.sec >= G.act.time) this.finish(false);
  },
  render(left, right) {
    const cl = $('#colL'), cr = $('#colR'); cl.innerHTML = ''; cr.innerHTML = '';
    left.forEach(it => cl.append(this.item('L', it)));
    right.forEach(it => cr.append(this.item('R', it)));
  },
  item(side, it) {
    const d = el('div', 'item'); d.dataset.side = side; d.dataset.pid = it.pid; d.tabIndex = 0; d.draggable = true;
    if (it.type === 'img') {
      d.classList.add('has-img'); const f = el('div', 'imgbox'), im = el('img');
      im.src = it.val; im.alt = 'Imagen'; im.draggable = false; f.append(im); d.append(f);
    } else d.textContent = it.val;
    const info = () => ({ side, pid: it.pid });
    // Drag and Drop API (ratón)
    d.addEventListener('dragstart', e => {
      if (!G.active || G.done.has(it.pid)) return e.preventDefault();
      G.drag = info(); d.classList.add('dragging'); Sound.play('drag');
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', side + ':' + it.pid);
    });
    d.addEventListener('dragend', () => { d.classList.remove('dragging'); $$('.over').forEach(x => x.classList.remove('over')); G.drag = null; });
    d.addEventListener('dragover', e => {
      if (G.drag && G.drag.side !== side && !G.done.has(it.pid)) { e.preventDefault(); d.classList.add('over'); }
    });
    d.addEventListener('dragleave', () => d.classList.remove('over'));
    d.addEventListener('drop', e => {
      e.preventDefault(); d.classList.remove('over');
      if (G.drag && G.drag.side !== side) this.attempt(G.drag, info());
      G.drag = null;
    });
    // Clic / teclado
    d.addEventListener('click', () => {
      if (G.suppress || !G.active || G.done.has(it.pid)) return;
      const me = info();
      if (G.sel && G.sel.side !== side) { const s = G.sel; this.attempt(s, me); }
      else if (G.sel && G.sel.side === side && G.sel.pid === it.pid) this.clearSel();
      else { this.clearSel(); G.sel = me; d.classList.add('sel'); Sound.play('drag'); }
    });
    d.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); d.click(); } });
    // Pointer Events (táctil)
    d.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' || !G.active || G.done.has(it.pid)) return;
      G.tp = { ...info(), el: d, x: e.clientX, y: e.clientY, moved: false };
      document.addEventListener('pointermove', this.pmove);
      document.addEventListener('pointerup', this.pup);
      document.addEventListener('pointercancel', this.pup);
    });
    return d;
  },
  pmove: e => {
    const t = G.tp; if (!t) return;
    if (!t.moved && Math.hypot(e.clientX - t.x, e.clientY - t.y) > 10) { t.moved = true; t.el.classList.add('dragging'); Sound.play('drag'); }
    if (!t.moved) return;
    const br = board().getBoundingClientRect(), p = Game.pt(t.el, t.side);
    let ln = $('#lines .temp');
    if (!ln) { ln = document.createElementNS('http://www.w3.org/2000/svg', 'line'); ln.setAttribute('class', 'temp'); $('#lines').append(ln); }
    ln.setAttribute('x1', p.x); ln.setAttribute('y1', p.y); ln.setAttribute('x2', e.clientX - br.left); ln.setAttribute('y2', e.clientY - br.top);
  },
  pup: e => {
    document.removeEventListener('pointermove', Game.pmove);
    document.removeEventListener('pointerup', Game.pup);
    document.removeEventListener('pointercancel', Game.pup);
    const t = G.tp; G.tp = null; if (!t) return;
    t.el.classList.remove('dragging'); const ln = $('#lines .temp'); if (ln) ln.remove();
    if (!t.moved) return;
    G.suppress = true; setTimeout(() => G.suppress = false, 80);
    const tgt = e.type === 'pointerup' ? document.elementFromPoint(e.clientX, e.clientY) : null;
    const it = tgt && tgt.closest && tgt.closest('.item');
    if (it && it.dataset.side !== t.side && !G.done.has(it.dataset.pid)) Game.attempt({ side: t.side, pid: t.pid }, { side: it.dataset.side, pid: it.dataset.pid });
  },
  clearSel() { $$('.item.sel').forEach(x => x.classList.remove('sel')); G.sel = null; },
  attempt(a, b) {
    if (!G.active || a.side === b.side) return;
    const L = a.side === 'L' ? a : b, R = a.side === 'L' ? b : a;
    if (G.done.has(L.pid) || G.done.has(R.pid)) return;
    this.clearSel(); G.tries++;
    const lc = card('L', L.pid), rc = card('R', R.pid);
    if (L.pid === R.pid) {
      G.ok++; G.done.add(L.pid); G.lines.push(L.pid);
      [lc, rc].forEach(c => { c.classList.add('ok'); c.draggable = false; });
      Sound.play('ok'); this.say('¡Excelente! ¡Respuesta correcta!', 'ok'); this.drawLines();
    } else {
      G.err++;
      [lc, rc].forEach(c => { c.classList.remove('no'); void c.offsetWidth; c.classList.add('no'); setTimeout(() => c.classList.remove('no'), 450); });
      this.flash(lc, rc); Sound.play('bad'); this.say('¡Inténtalo nuevamente!', 'bad');
    }
    this.stats();
    if (G.ok === G.total) this.finish(true);
  },
  pt(c, side) {
    const r = c.getBoundingClientRect(), b = board().getBoundingClientRect();
    return { x: (side === 'L' ? r.right + 4 : r.left - 4) - b.left, y: r.top + r.height / 2 - b.top };
  },
  line(lc, rc, cls) {
    const p1 = this.pt(lc, 'L'), p2 = this.pt(rc, 'R'), ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    ln.setAttribute('class', cls); ln.setAttribute('x1', p1.x); ln.setAttribute('y1', p1.y); ln.setAttribute('x2', p2.x); ln.setAttribute('y2', p2.y);
    $('#lines').append(ln); return ln;
  },
  flash(lc, rc) { const ln = this.line(lc, rc, 'wrong'); setTimeout(() => ln.remove(), 650); },
  drawLines() {
    $('#lines').innerHTML = '';
    G.lines.forEach(pid => { const l = card('L', pid), r = card('R', pid); if (l && r) this.line(l, r, 'good'); });
  },
  say(txt, cls) { const m = $('#msg'); m.className = 'msg'; void m.offsetWidth; m.className = 'msg ' + cls; m.textContent = txt || '\u00a0'; },
  stats() {
    $('#sOk').textContent = G.ok; $('#sTry').textContent = G.tries; $('#sErr').textContent = G.err;
    const lim = G.act.time; $('#sTime').textContent = fmt(lim > 0 ? lim - G.sec : G.sec);
    const pct = G.total ? Math.round(G.ok / G.total * 100) : 0;
    $('#pBar').style.width = pct + '%'; $('#pTxt').textContent = pct + '%';
    $('.progress').setAttribute('aria-valuenow', pct);
  },
  stop() { G.active = false; clearInterval(G.timer); G.token++; $('#countdown').classList.remove('show'); },
  finish(win) {
    const token = G.token; G.active = false; clearInterval(G.timer);
    const bonus = win && G.act.time > 0 ? Math.max(0, G.act.time - G.sec) : 0;
    const score = Math.max(0, G.ok * 100 - G.err * PENALTY + bonus);
    const perf = G.tries ? Math.round(G.ok / G.tries * 100) : 0;
    Sound.play(win ? 'win' : 'bad');
    setTimeout(() => {
      if (token !== G.token) return;
      $('#rIcon').textContent = win ? '🏆' : '⏰';
      $('#rTitle').textContent = win ? '¡Felicidades, has completado la actividad!' : '¡Se acabó el tiempo! Inténtalo otra vez.';
      $('#rScore').textContent = score; $('#rOk').textContent = G.ok + '/' + G.total; $('#rErr').textContent = G.err;
      $('#rTime').textContent = fmt(G.sec); $('#rPerf').textContent = perf + '%';
      show('result');
    }, win ? 900 : 300);
  }
};

/* Botones del juego */
$('#gSound').addEventListener('click', () => { Sound.on = !Sound.on; $('#gSound').textContent = Sound.on ? '🔊' : '🔇'; Sound.play('tick'); });
$('#gExit').addEventListener('click', () => { if (!G.active) return; G.paused = true; $('#modal').classList.add('show'); $('#mStay').focus(); });
$('#gRestart').addEventListener('click', () => {
  if (!G.act || $('#modal').classList.contains('show')) return;
  const was = G.paused; G.paused = true;
  Confirm.ask('¿Quieres reiniciar la actividad? Empezarás de nuevo con la cuenta regresiva y perderás tu progreso actual.',
    () => { G.paused = false; Game.start(G.act); },
    { yes: 'SÍ, REINICIAR', icon: '↻', onCancel: () => { G.paused = was; } });
});
$('#mStay').addEventListener('click', () => { $('#modal').classList.remove('show'); G.paused = false; });
$('#mLeave').addEventListener('click', () => { $('#modal').classList.remove('show'); G.paused = false; Game.stop(); renderHome(); show('home'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#modal').classList.contains('show')) $('#mStay').click(); });
$('#rAgain').addEventListener('click', () => Game.start(G.act));
$('#rExit').addEventListener('click', () => { Game.stop(); renderHome(); show('home'); });
window.addEventListener('resize', () => { if ($('#game').classList.contains('active')) Game.drawLines(); });

/* ========== Inicio ========== */
S.acts = Store.load();
S.current = S.acts.some(a => a.id === Store.getCurrent()) ? Store.getCurrent() : S.acts[0].id;
try { if (!localStorage.getItem(Store.KEY)) Store.save(S.acts); } catch (e) { }
renderHome();
})();

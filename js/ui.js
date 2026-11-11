/* ===== Гравець, інтерфейс, малювання ===== */
initCities();
let tOff = 0;                                   // різниця між годинником сервера і браузера
const NOW = () => Date.now() + tOff;
const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d'), stage = $('stage');
const css = getComputedStyle(document.documentElement);
const COL = {}; for (const k of ['bg', 'land', 'line', 'ink', 'mute', 'accent', 'own', 'threat', 'crit', 'ok']) COL[k] = css.getPropertyValue('--' + k).trim();
COL.cruise = '#ff6a4d';
const VIEW = { x: -75, y: -72, w: 1150, h: 815 };
const paths = MAP.map(m => ({ id: m.id, p: new Path2D(m.d) }));
const hitCtx = document.createElement('canvas').getContext('2d');
const inUkraine = (x, y) => paths.some(m => m.id !== 'crimea' && hitCtx.isPointInPath(m.p, x, y));

let sc = 1, ox = 0, oy = 0, dpr = 1, mapLayer = null;
const px = n => n / sc;
function resize() {
  const r = stage.getBoundingClientRect();
  if (!r.width || !r.height) return;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  sc = Math.min(r.width / VIEW.w, r.height / VIEW.h);
  ox = (r.width - VIEW.w * sc) / 2 - VIEW.x * sc; oy = (r.height - VIEW.h * sc) / 2 - VIEW.y * sc;
  mapLayer = document.createElement('canvas'); mapLayer.width = cv.width; mapLayer.height = cv.height;
  const g = mapLayer.getContext('2d');
  g.fillStyle = COL.bg; g.fillRect(0, 0, cv.width, cv.height);
  g.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * ox, dpr * oy);
  g.strokeStyle = 'rgba(48,69,107,.28)'; g.lineWidth = px(1); g.beginPath();
  for (let x = -400; x <= 1400; x += 100) { g.moveTo(x, -400); g.lineTo(x, 1100); }
  for (let y = -400; y <= 1100; y += 100) { g.moveTo(-400, y); g.lineTo(1400, y); }
  g.stroke();
  g.fillStyle = COL.land; g.strokeStyle = COL.line; g.lineWidth = px(1); g.lineJoin = 'round';
  for (const m of paths) { g.fill(m.p); g.stroke(m.p); }
}
new ResizeObserver(resize).observe(stage);

/* ---------- стан гравця ---------- */
let S = null, started = false, sessionStart = NOW(), hiddenAt = 0;
const done = new Set(), shots = [], fx = [], engaged = new Set();
let sel = null, placing = null, mouse = null, live = [], hover = null;
let isDirty = false;
const dirty = () => { isDirty = true; };
const cityHp = id => (S && S.cities[id] != null) ? S.cities[id] : 100;
const cityById = Object.fromEntries(CITIES.map(c => [c.id, c]));

let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); }
const logEl = $('log');
function log(msg, cls) {
  const d = document.createElement('div'); d.className = cls || '';
  d.textContent = clockFmt.format(new Date()) + '  ' + msg; logEl.prepend(d);
  while (logEl.children.length > 40) logEl.lastChild.remove();
}
let clockFmt;
try { clockFmt = new Intl.DateTimeFormat('uk-UA', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); }
catch (e) { clockFmt = new Intl.DateTimeFormat('uk-UA', { timeZone: 'Europe/Kiev', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); }
const fmtDur = ms => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); const p = n => String(n).padStart(2, '0'); return (h ? p(h) + ':' : '') + p(m) + ':' + p(s % 60); };

/* ---------- бій: влучання і кошти вирішує сервер ---------- */
const fireQueue = [], fireT = new Map(), inFlight = new Map();
let fireBusy = false;
const WHY = {
  gone: 'Ціль уже зникла', dead: 'Ціль уже збито', range: 'Ціль поза зоною ураження ваших комплексів', type: 'Комплекс у цій зоні не працює по таких цілях',
  ammo: 'У комплексі в цій зоні закінчився боєзапас', reload: 'Комплекс перезаряджається', money: 'Недостатньо коштів', land: 'Комплекс можна поставити лише на території України, крім тимчасово окупованого Криму',
  limit: 'Досягнуто межі кількості комплексів', full: 'Боєзапас уже повний', nounit: 'Комплекс не знайдено', norescue: 'Аварійний резерв зараз недоступний',
  busy: 'Сервер зайнятий, спробуйте ще раз', auth: 'Сесія завершилась. Увійдіть знову.', net: 'Немає зв’язку із сервером', server: 'Помилка сервера, спробуйте ще раз'
};
function fireAt(L, now) {
  const t = L.t, T = TYPES[t.type];
  if (engaged.has(t.id)) return;
  let ok = false, why = WHY.range;                       // швидка локальна перевірка, остаточну робить сервер
  for (const u of S.units) {
    const U = UNITS[u.t];
    if (Math.hypot(u.x - L.x, u.y - L.y) > U.r) continue;
    if (!U.p[t.type]) { why = U.name + ' не працює по цілях типу ' + T.name; continue; }
    if (u.ammo <= 0) { why = WHY.ammo; continue; }
    if ((u.cd || 0) > now) { why = WHY.reload; continue; }
    ok = true; break;
  }
  if (!ok) { toast(why); return; }
  engaged.add(t.id); fireT.set(t.id, t); fireQueue.push(t.id); flushFire();
}
async function flushFire() {
  if (fireBusy || !fireQueue.length) return;
  fireBusy = true;
  const ids = fireQueue.splice(0, 12);
  const r = await api('fire', { targets: ids });
  const now = NOW(), res = (r.results || []);
  let said = false;
  for (const id of ids) {
    const x = res.find(q => q.id === id), t = fireT.get(id); fireT.delete(id);
    const u = x && x.ok ? S.units.find(q => q.id === x.unit) : null;
    if (!x || !x.ok || !u || !t) { engaged.delete(id); if (!said) { said = true; toast(WHY[(x && x.why) || r.why] || WHY.server); } continue; }
    const p = posAt(t, now + x.dur);
    if (x.hit) inFlight.set(id, TYPES[t.type].reward);    // ціль і кошти з’являться, коли перехоплювач долетить
    shots.push({ ux: u.x, uy: u.y, t, t0: now, t1: now + x.dur, tx: p[0], ty: p[1], hit: x.hit });
  }
  fireBusy = false; refresh(); flushFire();
}
function resolveShot(s) {
  engaged.delete(s.t.id); inFlight.delete(s.t.id);
  const T = TYPES[s.t.type];
  if (s.hit) {
    fx.push({ k: 'ring', x: s.tx, y: s.ty, t0: s.t1, dur: 600, c: COL.accent, r: 16 });
    fx.push({ k: 'text', x: s.tx, y: s.ty, t0: s.t1, dur: 1100, c: COL.accent, txt: '+' + T.reward });
    log('Збито: ' + T.full + ' → ' + cityById[s.t.city].name + '  +◈' + T.reward, 'hit');
  } else {
    fx.push({ k: 'text', x: s.tx, y: s.ty, t0: s.t1, dur: 900, c: COL.mute, txt: 'промах' });
  }
  refresh();
}
function impact(t, now) {
  const T = TYPES[t.type], c = cityById[t.city];
  S.cities[t.city] = Math.max(0, cityHp(t.city) - T.dmg); S.missed++;
  fx.push({ k: 'ring', x: c.x, y: c.y, t0: now, dur: 900, c: COL.crit, r: 22 });
  log('Влучання: ' + c.name + ' · ' + T.full + '  −' + T.dmg, 'bad');
  renderCities(); dirty();
}

/* ---------- кадр ---------- */
let candKey = '', candVer = -1, cand = [];
function frame() {
  requestAnimationFrame(frame);
  if (!mapLayer) return;
  const now = NOW();
  const key = Math.floor(now / SLOT) + ':' + Math.floor(now / WIN);
  if (key !== candKey || adminVer !== candVer) { candKey = key; candVer = adminVer; cand = candidates(now).concat(adminTargets); if (done.size > 4000) done.clear(); }
  live = [];
  for (const t of cand) {
    if (S && S.dead[t.id] && !inFlight.has(t.id)) continue;
    if (now >= t.t1) {
      if (started && t.t1 > sessionStart && now - t.t1 < 30000 && !done.has(t.id)) { done.add(t.id); if (!S.dead[t.id]) impact(t, now); }
      continue;
    }
    if (now < t.t0) continue;
    const p = posAt(t, now);
    live.push({ t, x: p[0], y: p[1], a: p[2], eng: false });
  }
  if (started) for (const L of live) for (const u of S.units) {
    const U = UNITS[u.t];
    if (u.ammo > 0 && U.p[L.t.type] && Math.hypot(u.x - L.x, u.y - L.y) <= U.r) { L.eng = true; break; }
  }
  for (let i = shots.length - 1; i >= 0; i--) if (now >= shots[i].t1) { resolveShot(shots[i]); shots.splice(i, 1); }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(mapLayer, 0, 0);
  ctx.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * ox, dpr * oy);
  ctx.lineJoin = 'round';

  /* зони ураження */
  if (started) for (const u of S.units) {
    const U = UNITS[u.t], on = sel === u;
    ctx.beginPath(); ctx.arc(u.x, u.y, U.r, 0, 6.2832);
    ctx.fillStyle = on ? 'rgba(98,214,255,.09)' : 'rgba(98,214,255,.035)'; ctx.fill();
    ctx.strokeStyle = on ? COL.own : 'rgba(98,214,255,.38)'; ctx.lineWidth = px(on ? 1.5 : 1); ctx.stroke();
  }
  /* міста */
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.font = '500 ' + px(10.5) + 'px "IBM Plex Sans",system-ui,sans-serif';
  for (const c of CITIES) {
    const hp = cityHp(c.id);
    ctx.strokeStyle = 'rgba(132,150,180,.35)'; ctx.lineWidth = px(1.5);
    ctx.beginPath(); ctx.arc(c.x, c.y, px(5.5), 0, 6.2832); ctx.stroke();
    ctx.strokeStyle = hp > 60 ? COL.ok : hp > 25 ? COL.threat : COL.crit;
    ctx.beginPath(); ctx.arc(c.x, c.y, px(5.5), -1.5708, -1.5708 + 6.2832 * hp / 100); ctx.stroke();
    ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(c.x, c.y, px(2), 0, 6.2832); ctx.fill();
    ctx.fillStyle = 'rgba(226,233,246,.72)'; ctx.fillText(c.name, c.x + px(9), c.y + px(.5));
  }
  /* цілі */
  for (const L of live) {
    const ty = L.t.type, col = ty === 'd' ? COL.threat : ty === 'c' ? COL.cruise : COL.crit;
    const back = posAt(L.t, Math.max(L.t.t0, now - (ty === 'd' ? 14000 : ty === 'c' ? 6000 : 2200)));
    const g = ctx.createLinearGradient(back[0], back[1], L.x, L.y);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, col);
    ctx.strokeStyle = g; ctx.lineWidth = px(ty === 'b' ? 2 : 1.2);
    ctx.beginPath(); ctx.moveTo(back[0], back[1]); ctx.lineTo(L.x, L.y); ctx.stroke();
    ctx.save(); ctx.translate(L.x, L.y); ctx.rotate(L.a); ctx.fillStyle = col; ctx.beginPath();
    if (ty === 'd') { ctx.moveTo(px(6), 0); ctx.lineTo(px(-4), px(4.5)); ctx.lineTo(px(-2), 0); ctx.lineTo(px(-4), px(-4.5)); }
    else if (ty === 'c') { ctx.moveTo(px(8), 0); ctx.lineTo(0, px(3.2)); ctx.lineTo(px(-6), 0); ctx.lineTo(0, px(-3.2)); }
    else { ctx.arc(0, 0, px(4.2), 0, 6.2832); }
    ctx.closePath(); ctx.fill(); ctx.restore();
    if (ty === 'b') { ctx.strokeStyle = 'rgba(255,68,112,.45)'; ctx.lineWidth = px(1); ctx.beginPath(); ctx.arc(L.x, L.y, px(8), 0, 6.2832); ctx.stroke(); }
    if (L.eng || hover === L.t.id) {
      const r = px(11); ctx.strokeStyle = hover === L.t.id ? COL.accent : 'rgba(226,233,246,.8)'; ctx.lineWidth = px(1.3);
      for (let q = 0; q < 4; q++) { ctx.beginPath(); ctx.arc(L.x, L.y, r, q * 1.5708 + .35, q * 1.5708 + 1.22); ctx.stroke(); }
    }
  }
  /* комплекси */
  if (started) {
    ctx.textAlign = 'center';
    ctx.font = '600 ' + px(9.5) + 'px "IBM Plex Mono",ui-monospace,monospace';
    for (const u of S.units) {
      const U = UNITS[u.t], k = px(u.t === 'mvg' ? 5 : u.t === 'short' ? 6 : u.t === 'mid' ? 7 : 8);
      ctx.fillStyle = u.ammo > 0 ? COL.own : COL.crit; ctx.strokeStyle = COL.bg; ctx.lineWidth = px(1.5);
      ctx.beginPath(); ctx.moveTo(u.x, u.y - k); ctx.lineTo(u.x + k, u.y); ctx.lineTo(u.x, u.y + k); ctx.lineTo(u.x - k, u.y); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = u.ammo > 0 ? COL.own : COL.crit;
      ctx.fillText(U.short + ' ' + u.ammo, u.x, u.y + k + px(8));
    }
  }
  /* перехоплювачі */
  for (const s of shots) {
    const f = (now - s.t0) / (s.t1 - s.t0), f0 = Math.max(0, f - .3);
    const x = lerp(s.ux, s.tx, f), y = lerp(s.uy, s.ty, f);
    ctx.strokeStyle = COL.own; ctx.lineWidth = px(1.6);
    ctx.beginPath(); ctx.moveTo(lerp(s.ux, s.tx, f0), lerp(s.uy, s.ty, f0)); ctx.lineTo(x, y); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, px(2.2), 0, 6.2832); ctx.fill();
  }
  /* ефекти */
  ctx.textAlign = 'center';
  for (let i = fx.length - 1; i >= 0; i--) {
    const e = fx[i], f = (now - e.t0) / e.dur;
    if (f >= 1) { fx.splice(i, 1); continue; }
    if (f < 0) continue;
    ctx.globalAlpha = 1 - f;
    if (e.k === 'ring') { ctx.strokeStyle = e.c; ctx.lineWidth = px(2); ctx.beginPath(); ctx.arc(e.x, e.y, px(3 + e.r * f), 0, 6.2832); ctx.stroke(); }
    else { ctx.fillStyle = e.c; ctx.font = '600 ' + px(12) + 'px "IBM Plex Mono",ui-monospace,monospace'; ctx.fillText(e.txt, e.x, e.y - px(12 + 14 * f)); }
    ctx.globalAlpha = 1;
  }
  /* розміщення */
  if (placing && mouse) {
    const U = UNITS[placing], ok = inUkraine(mouse.x, mouse.y);
    ctx.beginPath(); ctx.arc(mouse.x, mouse.y, U.r, 0, 6.2832);
    ctx.fillStyle = ok ? 'rgba(98,214,255,.12)' : 'rgba(255,68,112,.12)'; ctx.fill();
    ctx.strokeStyle = ok ? COL.own : COL.crit; ctx.lineWidth = px(1.5); ctx.setLineDash([px(5), px(4)]); ctx.stroke(); ctx.setLineDash([]);
  }
}

/* ---------- вказівник ---------- */
function toWorld(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left - ox) / sc, y: (e.clientY - r.top - oy) / sc, sx: e.clientX - r.left, sy: e.clientY - r.top }; }
function nearestTarget(m, rad) { let b = null, bd = px(rad); for (const L of live) { const d = Math.hypot(L.x - m.x, L.y - m.y); if (d < bd) { bd = d; b = L; } } return b; }
const tip = $('tip');
cv.addEventListener('pointermove', e => {
  mouse = toWorld(e);
  const L = e.pointerType === 'touch' ? null : nearestTarget(mouse, 14);
  hover = L ? L.t.id : null;
  cv.style.cursor = placing ? 'crosshair' : L ? 'pointer' : 'default';
  if (L && !placing) {
    const T = TYPES[L.t.type];
    tip.textContent = T.full + ' → ' + cityById[L.t.city].name + ' · за збиття ◈' + T.reward + (L.eng ? '' : ' · поза зоною');
    tip.style.display = 'block';
    tip.style.left = Math.min(mouse.sx + 14, stage.clientWidth - tip.offsetWidth - 6) + 'px'; tip.style.top = Math.max(4, mouse.sy - 30) + 'px';
  } else tip.style.display = 'none';
});
cv.addEventListener('pointerleave', () => { mouse = null; hover = null; tip.style.display = 'none'; });
cv.addEventListener('pointerdown', e => {
  if (!started) return;
  const m = mouse = toWorld(e), now = NOW();
  if (placing) {
    const U = UNITS[placing];
    if (!inUkraine(m.x, m.y)) { toast('Комплекс можна поставити лише на території України, крім тимчасово окупованого Криму'); return; }
    if (S.money < U.price) { toast('Недостатньо коштів'); setPlacing(null); return; }
    const type = placing; setPlacing(null);
    api('place', { type, x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10 }).then(r => {
      if (!r.ok) { toast(WHY[r.why] || WHY.server); return; }
      sel = S.units.find(q => q.id === r.unit) || null; log('Розгорнуто: ' + U.name, 'inf'); refresh();
    });
    return;
  }
  const L = nearestTarget(m, e.pointerType === 'touch' ? 24 : 15);
  if (L) { fireAt(L, now); refresh(); return; }
  let bu = null, bd = px(16);
  for (const u of S.units) { const d = Math.hypot(u.x - m.x, u.y - m.y); if (d < bd) { bd = d; bu = u; } }
  sel = bu; refresh();
});
function setPlacing(k) {
  placing = k; $('placing').classList.toggle('on', !!k);
  if (k) $('placingTxt').textContent = 'Оберіть місце на карті: ' + UNITS[k].name;
}
$('placingCancel').onclick = () => setPlacing(null);
addEventListener('keydown', e => { if (e.key === 'Escape') setPlacing(null); });

/* ---------- пульт ---------- */
const shop = $('shop'), shopBtns = {};
for (const k in UNITS) {
  const U = UNITS[k], b = document.createElement('button');
  b.className = 'card'; b.type = 'button';
  const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = U.name;
  const pr = document.createElement('span'); pr.className = 'pr'; pr.textContent = '◈' + U.price;
  const sp = document.createElement('span'); sp.className = 'sp';
  sp.innerHTML = 'радіус <b>' + Math.round(U.r * KM) + ' км</b> · влучання <b>' + Math.round(U.p.d * 100) + ' / ' + Math.round(U.p.c * 100) + ' / ' + Math.round(U.p.b * 100) + '%</b><br>боєприпас <b>◈' + U.ammo + '</b> · запас ' + U.start + ' з ' + U.cap;
  b.append(nm, pr, sp);
  b.onclick = () => { if (started) { sel = null; setPlacing(k); refresh(); } };
  shop.append(b); shopBtns[k] = b;
}
const unitAct = async (action, extra, done) => {
  if (!sel) return;
  const r = await api(action, Object.assign({ unit: sel.id }, extra));
  if (!r.ok) toast(WHY[r.why] || WHY.server); else if (done) done();
  refresh();
};
$('uBuy1').onclick = () => unitAct('buy', { n: 1 });
$('uFill').onclick = () => unitAct('buy', { n: 99 });
$('uSell').onclick = () => { const name = sel && UNITS[sel.t].name; unitAct('sell', {}, () => { log('Продано: ' + name, 'inf'); sel = null; }); };
$('rescueBtn').onclick = async () => { const r = await api('rescue'); if (r.ok) log('Отримано аварійний резерв', 'inf'); else toast(WHY[r.why] || WHY.server); refresh(); };
function needRescue() {
  if (!started || shots.length) return false;
  if (S.units.some(u => u.ammo > 0)) return false;
  const need = S.units.length ? Math.min(...S.units.map(u => UNITS[u.t].ammo)) : UNITS.mvg.price;
  return S.money < need && S.money < 150;
}
for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => {
  for (const o of document.querySelectorAll('.tabs button')) { const on = o === b; o.setAttribute('aria-selected', on); $(o.dataset.tab).hidden = !on; }
  if (b.dataset.tab === 'top') loadTop();
};
const cityRows = {};
function renderCities() {
  const box = $('cities');
  if (!box.children.length) for (const c of CITIES) {
    const r = document.createElement('div'); r.className = 'city';
    const n = document.createElement('span'); n.textContent = c.name;
    const bar = document.createElement('div'); bar.className = 'bar'; const i = document.createElement('i'); bar.append(i);
    const v = document.createElement('span'); r.append(n, bar, v); box.append(r); cityRows[c.id] = [i, v];
  }
  let sum = 0;
  for (const c of CITIES) { const hp = cityHp(c.id); sum += hp; const [i, v] = cityRows[c.id]; i.style.width = hp + '%'; i.style.background = hp > 60 ? COL.ok : hp > 25 ? COL.threat : COL.crit; v.textContent = hp; }
  const st = Math.round(sum / CITIES.length);
  $('stab').style.width = st + '%'; $('stab').style.background = st > 60 ? COL.ok : st > 25 ? COL.threat : COL.crit; $('stabTxt').textContent = st + '%';
}
function refresh() {
  const now = NOW();
  $('clock').textContent = clockFmt.format(now);
  const n = { d: 0, c: 0, b: 0 }; for (const L of live) n[L.t.type]++;
  $('air').textContent = live.length + ' · БпЛА ' + n.d + ' · КР ' + n.c + ' · БР ' + n.b;
  const w = curWave(now, adminWaves), al = $('alert');
  if (w.active && now < w.end) { $('waveLab').textContent = 'Масована атака · пуски ще'; $('wave').textContent = fmtDur(w.end - now); al.className = 'mass'; $('alertTxt').textContent = 'Масована атака'; }
  else if (w.active) { $('waveLab').textContent = 'Масована атака'; $('wave').textContent = 'цілі долітають'; al.className = 'air'; $('alertTxt').textContent = 'Хвиля завершується'; }
  else {
    $('waveLab').textContent = 'Наступна масована атака'; $('wave').textContent = 'через ' + fmtDur(w.start - now);
    const soon = w.start - now < 10 * 60000; al.className = soon ? 'air' : ''; $('alertTxt').textContent = soon ? 'Загроза масованої атаки' : 'Фонова активність';
  }
  if (!S) return;
  let pend = 0; for (const v of inFlight.values()) pend += v;
  $('money').textContent = '◈' + Math.max(0, S.money - pend); $('score').textContent = S.score;
  $('kills').textContent = S.kills.d + S.kills.c + S.kills.b; $('missed').textContent = S.missed;
  $('acc').textContent = S.shots ? Math.round(S.hits / S.shots * 100) + '%' : '—';
  $('who').textContent = S.nick;
  for (const k in UNITS) shopBtns[k].disabled = S.money < UNITS[k].price;
  $('unit').classList.toggle('on', !!sel);
  if (sel) {
    const U = UNITS[sel.t], lack = U.cap - sel.ammo, can = Math.min(lack, Math.floor(S.money / U.ammo));
    $('uName').textContent = U.name; $('uAmmo').textContent = sel.ammo + ' / ' + U.cap;
    $('uBuy1').textContent = 'Докупити 1 · ◈' + U.ammo; $('uBuy1').disabled = !lack || S.money < U.ammo;
    $('uFill').textContent = can > 0 ? 'Докупити ' + can + ' · ◈' + can * U.ammo : 'Поповнити до повного'; $('uFill').disabled = can <= 0;
    $('uSell').textContent = 'Продати комплекс · +◈' + Math.floor(U.price / 2);
  }
  $('rescue').style.display = needRescue() ? 'block' : 'none';
}
setInterval(refresh, 250);
setInterval(() => {            // повільне відновлення міст, поки гравець у грі
  if (!started || document.hidden) return;
  let ch = false; for (const c of CITIES) { const hp = cityHp(c.id); if (hp < 100) { S.cities[c.id] = hp + 1; ch = true; } }
  if (ch) { renderCities(); dirty(); }
}, 30000);

/* ---------- акаунт: стан гравця веде сервер ---------- */
const CFG = window.PX_CONFIG || {};
const sb = (CFG.url && CFG.key && window.supabase) ? window.supabase.createClient(CFG.url, CFG.key) : null;
let uid = null, cloud = false, bestRtt = 1e9;
/* запит до серверної функції гри; відповідь завжди містить актуальний стан */
async function api(action, body) {
  const t0 = Date.now();
  let d;
  try {
    const { data, error } = await sb.functions.invoke('game', { body: Object.assign({ action }, body) });
    if (error) { let why = 'net'; try { const j = await error.context.json(); why = j.why || 'server'; } catch (e) { } return { ok: false, why }; }
    d = data || { ok: false, why: 'server' };
  } catch (e) { return { ok: false, why: 'net' }; }
  const t1 = Date.now(), rtt = t1 - t0;
  if (d.now && rtt <= bestRtt + 50) { bestRtt = Math.min(bestRtt, rtt); tOff = d.now - (t0 + t1) / 2; }   // єдиний час світу для всіх
  if (d.state) {
    const keep = started && S ? { cities: S.cities, missed: Math.max(S.missed, d.state.missed || 0) } : null;
    S = d.state; if (keep) Object.assign(S, keep);
    if (sel) sel = S.units.find(q => q.id === sel.id) || null;
  }
  if (d.granted) { log('Нарахування від адміністратора: ◈' + d.granted, 'inf'); toast('Адміністратор нарахував вам ◈' + d.granted); }
  return d;
}
/* стан міст і пропущені цілі надсилаються раз на 20 секунд; заодно сервер застосовує нарахування */
let reporting = false;
async function save() {
  if (!S || !started || !cloud || reporting) return;
  reporting = true;
  const r = await api('report', { cities: S.cities, missed: S.missed });
  if (!r.ok) isDirty = true;
  reporting = false; refresh();
}
let lastReport = 0;
setInterval(() => { if (isDirty || NOW() - lastReport > 60000) { isDirty = false; lastReport = NOW(); save(); } }, 20000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = NOW(); if (isDirty) { isDirty = false; save(); } }
  else if (NOW() - hiddenAt > 5000) sessionStart = NOW();   // влучання за час відсутності не рахуються
});
async function loadTop() {
  const list = $('topList'), note = $('topNote');
  if (!sb) return;
  const { data, error } = await sb.from('leaderboard').select('id,nick,score,kills').order('score', { ascending: false }).limit(20);
  if (error) { note.textContent = 'Не вдалося завантажити рейтинг. Спробуйте відкрити вкладку ще раз.'; return; }
  list.textContent = '';
  data.forEach((v, i) => {
    const r = document.createElement('div'); r.className = 'r' + (v.id === uid ? ' me' : '');
    const a = document.createElement('span'); a.textContent = i + 1;
    const b = document.createElement('span'); b.textContent = String(v.nick || 'Без позивного').slice(0, 20);
    const c = document.createElement('span'); c.textContent = Number(v.score) || 0;
    r.append(a, b, c); list.append(r);
  });
  note.textContent = data.length ? 'Рахунок: БпЛА 10, крилата 50, балістика 200.' : 'Поки що жодного результату. Перше збиття відкриє рейтинг.';
}
function start() {
  started = true; sessionStart = NOW(); $('gate').classList.add('off');
  renderCities(); refresh(); loadTop();
  $('logout').hidden = false;
  log('Вхід: ' + S.nick, 'inf');
  if (!S.units.length) toast('Оберіть комплекс в Арсеналі та поставте його біля міста');
}

/* ---------- вхід і реєстрація ---------- */
const gateBody = $('gateBody');
function el(tag, props) {
  const e = Object.assign(document.createElement(tag), props || {});
  for (let i = 2; i < arguments.length; i++) if (arguments[i]) e.append(arguments[i]);
  return e;
}
function field(id, label, type, extra) {
  const inp = el('input', Object.assign({ id, type, required: true }, extra || {}));
  return [el('label', { htmlFor: id, textContent: label }), inp];
}
const authError = e => {
  const m = String(e && e.message || e || '');
  if (/invalid login credentials/i.test(m)) return 'Неправильна пошта або пароль.';
  if (/email not confirmed/i.test(m)) return 'Пошту ще не підтверджено. Перейдіть за посиланням у листі.';
  if (/rate limit|too many|security purposes/i.test(m)) return 'Забагато спроб. Зачекайте кілька хвилин і спробуйте ще раз.';
  if (/already registered|already been registered/i.test(m)) return 'Ця адреса вже зареєстрована. Увійдіть або відновіть пароль.';
  if (/password/i.test(m) && /least|short|weak/i.test(m)) return 'Пароль закороткий або заслабкий. Потрібно щонайменше 8 символів.';
  if (/valid email|invalid.*email/i.test(m)) return 'Перевірте адресу електронної пошти.';
  if (/failed to fetch|network/i.test(m)) return 'Немає зв’язку із сервером. Перевірте інтернет і спробуйте ще раз.';
  return 'Не вдалося виконати дію: ' + m;
};
const redirectTo = location.origin + location.pathname;
function showAuth(mode, info) {
  $('gate').classList.remove('off'); gateBody.textContent = '';
  const msg = el('p', { className: 'note', textContent: info || '' }); msg.setAttribute('role', 'status');
  const btn = el('button', { className: 'btn pri', type: 'submit' });
  const form = el('form');
  const link = (text, to) => { const b = el('button', { type: 'button', className: 'linkbtn', textContent: text }); b.onclick = () => showAuth(to); return b; };
  const links = el('div', { className: 'links' });
  let run;
  if (mode === 'signup') {
    const [l0, nick] = field('nick', 'Позивний', 'text', { maxLength: 16, autocomplete: 'nickname', placeholder: 'Наприклад, Сокіл' });
    const [l1, mail] = field('email', 'Електронна пошта', 'email', { autocomplete: 'email' });
    const [l2, pass] = field('password', 'Пароль, щонайменше 8 символів', 'password', { minLength: 8, autocomplete: 'new-password' });
    btn.textContent = 'Зареєструватися'; form.append(l0, nick, l1, mail, l2, pass, btn);
    links.append(link('У мене вже є акаунт', 'login'));
    run = async () => {
      const n = nick.value.trim().slice(0, 16); if (!n) { nick.focus(); throw new Error('Вкажіть позивний.'); }
      const { data, error } = await sb.auth.signUp({ email: mail.value.trim(), password: pass.value, options: { data: { nick: n }, emailRedirectTo: redirectTo } });
      if (error) throw error;
      if (data.user && data.user.identities && !data.user.identities.length) throw new Error('already registered');
      if (data.session) return enter(data.session.user);
      showAuth('login', 'Ми надіслали лист на ' + mail.value.trim() + '. Перейдіть за посиланням у ньому, щоб підтвердити адресу, і гра відкриється.');
    };
  } else if (mode === 'reset') {
    const [l1, mail] = field('email', 'Електронна пошта', 'email', { autocomplete: 'email' });
    btn.textContent = 'Надіслати посилання'; form.append(l1, mail, btn);
    links.append(link('Повернутися до входу', 'login'));
    run = async () => {
      const { error } = await sb.auth.resetPasswordForEmail(mail.value.trim(), { redirectTo });
      if (error) throw error;
      showAuth('login', 'Якщо така адреса зареєстрована, на неї надійшов лист із посиланням для нового пароля.');
    };
  } else if (mode === 'newpass') {
    const [l2, pass] = field('password', 'Новий пароль, щонайменше 8 символів', 'password', { minLength: 8, autocomplete: 'new-password' });
    btn.textContent = 'Зберегти пароль'; form.append(l2, pass, btn);
    run = async () => {
      const { data, error } = await sb.auth.updateUser({ password: pass.value });
      if (error) throw error;
      if (started) { $('gate').classList.add('off'); toast('Пароль змінено'); } else return enter(data.user);
    };
  } else {
    const [l1, mail] = field('email', 'Електронна пошта', 'email', { autocomplete: 'email' });
    const [l2, pass] = field('password', 'Пароль', 'password', { autocomplete: 'current-password' });
    btn.textContent = 'Увійти'; form.append(l1, mail, l2, pass, btn);
    links.append(link('Створити акаунт', 'signup'), link('Забули пароль?', 'reset'));
    run = async () => {
      const { data, error } = await sb.auth.signInWithPassword({ email: mail.value.trim(), password: pass.value });
      if (error) throw error;
      return enter(data.user);
    };
  }
  form.onsubmit = async e => {
    e.preventDefault(); const label = btn.textContent; btn.disabled = true; btn.textContent = 'Зачекайте…'; msg.textContent = '';
    try { await run(); } catch (err) { msg.textContent = /^[А-ЯІЇЄҐ]/.test(err.message || '') ? err.message : authError(err); }
    btn.disabled = false; btn.textContent = label;
  };
  gateBody.append(form, links, msg);
}
let entering = false;
async function enter(user) {
  if (entering || started) return; entering = true;
  uid = user.id; cloud = true;
  const r = await api('init', {});
  if (r.ok && S) { start(); initAdmin(); }
  else { cloud = false; uid = null; showAuth('login', WHY[r.why] || WHY.server); }
  entering = false;
}
$('logout').onclick = async () => {
  $('logout').disabled = true;
  isDirty = false; await save();
  try { await sb.auth.signOut(); } catch (e) { }
  location.reload();
};
async function initStore() {
  if (!sb) { gateBody.textContent = ''; gateBody.append(el('p', { textContent: 'Базу не підключено: перевірте файл js/config.js.' })); return; }
  pollEvents(); setInterval(pollEvents, 10000);
  sb.auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY') setTimeout(() => showAuth('newpass'), 0); });
  try {
    const { data } = await sb.auth.getSession();
    if (data && data.session) await enter(data.session.user); else showAuth('login');
  } catch (e) { showAuth('login', authError(e)); }
}

/* ---------- ручні запуски адміністратора: спільні для всіх гравців ---------- */
let adminTargets = [], adminWaves = [], adminVer = 0, eventsSig = '';
async function pollEvents() {
  if (!sb || document.hidden) return;
  const { data, error } = await sb.from('events').select('id,kind,t0,data').order('t0', { ascending: false }).limit(200);
  if (error || !data) return;
  const sig = data.map(r => r.id).join(',');
  if (sig === eventsSig) return;
  eventsSig = sig;
  const b = buildEvents(data); adminTargets = b.targets; adminWaves = b.waves; adminVer++;
}
/* посилання на окрему сторінку адмінки бачить лише адміністратор */
async function initAdmin() {
  if (!cloud) return;
  const { data } = await sb.from('admins').select('user_id').eq('user_id', uid).maybeSingle();
  if (data) $('adminBtn').hidden = false;
}
resize(); renderCities(); refresh(); requestAnimationFrame(frame); initStore();

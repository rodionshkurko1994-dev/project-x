/* ===== Гравець, інтерфейс, малювання ===== */
initCities();
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
let S = null, started = false, sessionStart = Date.now(), hiddenAt = 0;
const done = new Set(), shots = [], fx = [], engaged = new Set();
let sel = null, placing = null, mouse = null, live = [], hover = null;
let isDirty = false;
const dirty = () => { isDirty = true; };
const newState = nick => ({ v: 1, nick, money: START_MONEY, score: 0, kills: { d: 0, c: 0, b: 0 }, missed: 0, shots: 0, hits: 0, units: [], cities: {}, dead: {}, uid: 1, created: Date.now(), saved: 0 });
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

/* ---------- бій ---------- */
function fireAt(L, now) {
  const t = L.t, T = TYPES[t.type];
  if (engaged.has(t.id)) return;
  let best = null, bv = -1e9, why = 'Ціль поза зоною ураження ваших комплексів';
  for (const u of S.units) {
    const U = UNITS[u.t];
    if (Math.hypot(u.x - L.x, u.y - L.y) > U.r) continue;
    if (!U.p[t.type]) { why = U.name + ' не працює по цілях типу ' + T.name; continue; }
    if (u.ammo <= 0) { why = 'У комплексі в цій зоні закінчився боєзапас'; continue; }
    if ((u.cd || 0) > now) { why = 'Комплекс перезаряджається'; continue; }
    const val = U.p[t.type] * T.reward - U.ammo;          // найвигідніший комплекс для цього пострілу
    if (val > bv) { bv = val; best = u; }
  }
  if (!best) { toast(why); return; }
  const U = UNITS[best.t];
  best.ammo--; best.cd = now + U.reload; S.shots++;
  const dur = clamp(Math.hypot(best.x - L.x, best.y - L.y) / (best.t === 'mvg' ? 60 : 90) * 1000, 250, 2200);
  const p = posAt(t, now + dur);
  shots.push({ ux: best.x, uy: best.y, t, t0: now, t1: now + dur, tx: p[0], ty: p[1], hit: Math.random() < U.p[t.type] });
  engaged.add(t.id); dirty();
}
function resolveShot(s) {
  engaged.delete(s.t.id);
  const T = TYPES[s.t.type];
  if (s.hit && s.t1 < s.t.t1 && !S.dead[s.t.id]) {
    S.dead[s.t.id] = Math.round(s.t.t1);
    S.money += T.reward; S.score += T.pts; S.kills[s.t.type]++; S.hits++;
    fx.push({ k: 'ring', x: s.tx, y: s.ty, t0: s.t1, dur: 600, c: COL.accent, r: 16 });
    fx.push({ k: 'text', x: s.tx, y: s.ty, t0: s.t1, dur: 1100, c: COL.accent, txt: '+' + T.reward });
    log('Збито: ' + T.full + ' → ' + cityById[s.t.city].name + '  +◈' + T.reward, 'hit');
  } else {
    fx.push({ k: 'text', x: s.tx, y: s.ty, t0: s.t1, dur: 900, c: COL.mute, txt: 'промах' });
  }
  dirty();
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
  const now = Date.now();
  const key = Math.floor(now / SLOT) + ':' + Math.floor(now / WIN);
  if (key !== candKey || adminVer !== candVer) { candKey = key; candVer = adminVer; cand = candidates(now).concat(adminTargets); if (done.size > 4000) done.clear(); }
  live = [];
  for (const t of cand) {
    if (S && S.dead[t.id]) continue;
    if (now >= t.t1) {
      if (started && t.t1 > sessionStart && now - t.t1 < 30000 && !done.has(t.id)) { done.add(t.id); impact(t, now); }
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
  const m = mouse = toWorld(e), now = Date.now();
  if (placing) {
    const U = UNITS[placing];
    if (!inUkraine(m.x, m.y)) { toast('Комплекс можна поставити лише на території України, крім тимчасово окупованого Криму'); return; }
    if (S.money < U.price) { toast('Недостатньо коштів'); setPlacing(null); return; }
    S.money -= U.price;
    const u = { id: S.uid++, t: placing, x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10, ammo: U.start };
    S.units.push(u); sel = u; setPlacing(null); log('Розгорнуто: ' + U.name, 'inf'); dirty(); refresh(); save();
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
$('uBuy1').onclick = () => { if (!sel) return; const U = UNITS[sel.t]; if (sel.ammo < U.cap && S.money >= U.ammo) { S.money -= U.ammo; sel.ammo++; dirty(); refresh(); } };
$('uFill').onclick = () => { if (!sel) return; const U = UNITS[sel.t]; const n = Math.min(U.cap - sel.ammo, Math.floor(S.money / U.ammo)); if (n > 0) { S.money -= n * U.ammo; sel.ammo += n; dirty(); refresh(); } };
$('uSell').onclick = () => { if (!sel) return; const U = UNITS[sel.t]; S.money += Math.floor(U.price / 2); S.units.splice(S.units.indexOf(sel), 1); log('Продано: ' + U.name, 'inf'); sel = null; dirty(); refresh(); save(); };
$('rescueBtn').onclick = () => { if (needRescue()) { S.money = Math.max(S.money, 150); log('Отримано аварійний резерв', 'inf'); dirty(); refresh(); } };
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
  const now = Date.now();
  $('clock').textContent = clockFmt.format(now);
  const n = { d: 0, c: 0, b: 0 }; for (const L of live) n[L.t.type]++;
  $('air').textContent = live.length + ' · БпЛА ' + n.d + ' · КР ' + n.c + ' · БР ' + n.b;
  const w = curWave(now), al = $('alert');
  if (w.active && now < w.end) { $('waveLab').textContent = 'Масована атака · пуски ще'; $('wave').textContent = fmtDur(w.end - now); al.className = 'mass'; $('alertTxt').textContent = 'Масована атака'; }
  else if (w.active) { $('waveLab').textContent = 'Масована атака'; $('wave').textContent = 'цілі долітають'; al.className = 'air'; $('alertTxt').textContent = 'Хвиля завершується'; }
  else {
    $('waveLab').textContent = 'Наступна масована атака'; $('wave').textContent = 'через ' + fmtDur(w.start - now);
    const soon = w.start - now < 10 * 60000; al.className = soon ? 'air' : ''; $('alertTxt').textContent = soon ? 'Загроза масованої атаки' : 'Фонова активність';
  }
  if (!S) return;
  $('money').textContent = '◈' + S.money; $('score').textContent = S.score;
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
  const now = Date.now(); for (const id in S.dead) if (S.dead[id] < now - 60000) delete S.dead[id];
  if (ch) { renderCities(); dirty(); }
}, 30000);

/* ---------- акаунт і збереження ---------- */
const LS = 'projectx.v1';
let db = null, user = null, uid = null, stateRef = null, scoreRef = null, cloud = false, saving = false, lastScoreSent = -1;
const loadLocal = () => { try { return JSON.parse(localStorage.getItem(LS)); } catch (e) { return null; } };
const saveLocal = () => { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) { } };
const timeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);
function publicStats() {
  let sum = 0; for (const c of CITIES) sum += cityHp(c.id);
  return { nick: S.nick, score: S.score, kills: S.kills.d + S.kills.c + S.kills.b, kd: S.kills.d, kc: S.kills.c, kb: S.kills.b,
    missed: S.missed, shots: S.shots, hits: S.hits, money: S.money, units: S.units.length, stab: Math.round(sum / CITIES.length), created: S.created };
}
async function save() {
  if (!S || !started) return;
  S.saved = Date.now(); saveLocal();
  if (!cloud || saving) return;
  saving = true;
  try {
    await stateRef.set(JSON.parse(JSON.stringify(S)));
    const pub = publicStats(), sig = JSON.stringify(pub);      // відкрита статистика: рейтинг і список в адмінці
    if (sig !== lastScoreSent) { pub.t = S.saved; await scoreRef.set(pub); lastScoreSent = sig; }
  } catch (e) {
    if (e && (e.code === 'invalid_argument' || e.code === 'revoked' || e.code === 'not_granted')) { cloud = false; toast('Збереження на сервері недоступне. Прогрес зберігається в цьому браузері.'); }
    else isDirty = true;
  }
  saving = false;
}
setInterval(() => { if (isDirty) { isDirty = false; save(); } }, 20000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); if (isDirty) { isDirty = false; save(); } }
  else if (Date.now() - hiddenAt > 5000) sessionStart = Date.now();   // влучання за час відсутності не рахуються
});
async function loadTop() {
  const list = $('topList'), note = $('topNote');
  if (!db) { note.textContent = 'Спільний рейтинг з’явиться, коли гру відкрито через Claude з входом в акаунт.'; return; }
  try {
    const q = await timeout(db.collection('scores').orderBy('score', 'desc').limit(20).get(), 10000);
    list.textContent = '';
    q.docs.forEach((d, i) => {
      const v = d.data() || {}, r = document.createElement('div'); r.className = 'r' + (d.id === uid ? ' me' : '');
      const a = document.createElement('span'); a.textContent = i + 1;
      const b = document.createElement('span'); b.textContent = String(v.nick || 'Без позивного').slice(0, 20);
      const c = document.createElement('span'); c.textContent = Number(v.score) || 0;
      r.append(a, b, c); list.append(r);
    });
    note.textContent = q.empty ? 'Поки що жодного результату. Перше збиття відкриє рейтинг.' : 'Рахунок: БпЛА 10, крилата 50, балістика 200.';
  } catch (e) { note.textContent = 'Не вдалося завантажити рейтинг. Спробуйте відкрити вкладку ще раз.'; }
}
function start(st) {
  S = st; S.kills = S.kills || { d: 0, c: 0, b: 0 }; S.units = S.units || []; S.cities = S.cities || {}; S.dead = S.dead || {};
  started = true; sessionStart = Date.now(); $('gate').classList.add('off');
  renderCities(); refresh(); save(); loadTop();
  log('Вхід: ' + S.nick, 'inf');
  if (!S.units.length) toast('Оберіть комплекс в Арсеналі та поставте його біля міста');
}
function showGate(st) {
  const box = $('gateBody'); box.textContent = '';
  const note = document.createElement('p'); note.className = 'note';
  note.textContent = cloud ? 'Акаунт прив’язано до вашого входу в Claude. Прогрес зберігається на сервері.' : 'Прогрес зберігається лише в цьому браузері.';
  const btn = document.createElement('button'); btn.className = 'btn pri'; btn.type = 'button';
  if (st) {
    const p = document.createElement('p'); p.textContent = 'З поверненням, ' + st.nick + '. На рахунку ◈' + st.money + ', комплексів: ' + (st.units || []).length + '.';
    btn.textContent = 'Продовжити'; btn.onclick = () => start(st); box.append(p, btn, note);
  } else {
    const f = document.createElement('form');
    const l = document.createElement('label'); l.htmlFor = 'nick'; l.textContent = 'Позивний';
    const inp = document.createElement('input'); inp.id = 'nick'; inp.maxLength = 16; inp.autocomplete = 'nickname'; inp.placeholder = 'Наприклад, Сокіл';
    btn.type = 'submit'; btn.textContent = 'Створити акаунт';
    f.onsubmit = e => { e.preventDefault(); const n = inp.value.trim().slice(0, 16); if (!n) { inp.focus(); return; } start(newState(n)); };
    f.append(l, inp, btn); box.append(f, note);
  }
}
async function initStore() {
  let remote = null;
  try {
    if (window.claude && window.claude.use) {
      [db, user] = await timeout(Promise.all([window.claude.use('db'), window.claude.use('user')]), 8000);
      uid = user ? await user.id() : null;
      if (db && uid) {
        stateRef = db.doc('data/users/' + uid + '/state'); scoreRef = db.doc('scores/' + uid);
        db.collection('events').onSnapshot(onEvents, () => { });
        initAdmin();
        const snap = await timeout(stateRef.get(), 10000);
        cloud = true;
        if (snap.exists) remote = JSON.parse(JSON.stringify(snap.data()));
      }
    }
  } catch (e) { cloud = false; }
  const local = loadLocal();
  let st = remote && remote.v ? remote : null;
  if (local && local.v && (!st || (local.saved || 0) > (st.saved || 0))) st = local;
  if (st) lastScoreSent = -1;
  showGate(st);
}

/* ---------- події адміністратора: спільні для всіх гравців ---------- */
let adminEvents = [], adminTargets = [], adminWaves = [], adminVer = 0, adminOpen = false;
/* Кожен тип загрози описано тут: як із запису в базі побудувати цілі. Нові загрози додаються новим ключем. */
const EVENT_KINDS = {
  single: {
    label: e => 'Одна ціль: ' + (TYPES[e.type] || TYPES.d).full,
    build: (id, e) => [makeTarget(mulberry32(hash2(SEED, e.seed | 0)), 'a' + id + '_0', e.t0, false, { type: e.type, entry: e.entry, city: e.city })]
  },
  wave: {
    label: e => 'Масована атака',
    build: (id, e) => {
      const rng = mulberry32(hash2(SEED, e.seed | 0)), n = clamp(e.n | 0, 1, 300), dur = clamp(+e.dur || 0, 60000, 30 * 60000), a = [];
      for (let k = 0; k < n; k++) a.push(makeTarget(rng, 'a' + id + '_' + k, e.t0 + rng() * dur, true));
      return a;
    }
  }
};
function onEvents(snap) {
  adminEvents = []; adminTargets = []; adminWaves = [];
  for (const d of snap.docs) {
    const e = d.data();
    if (!e || !EVENT_KINDS[e.kind] || !Number.isFinite(e.t0)) continue;
    let ts; try { ts = EVENT_KINDS[e.kind].build(d.id, e); } catch (err) { continue; }
    const end = Math.max.apply(null, ts.map(t => t.t1));
    adminEvents.push({ id: d.id, e, end, n: ts.length });
    for (const t of ts) adminTargets.push(t);
    if (e.kind === 'wave') adminWaves.push({ start: e.t0, end: e.t0 + clamp(+e.dur || 0, 60000, 30 * 60000), n: ts.length });
  }
  adminEvents.sort((a, b) => b.e.t0 - a.e.t0);
  adminVer++; if (adminOpen) renderEvents();
}
function curWave(now) {
  let w = waveState(now);
  for (const a of adminWaves) {
    if (now >= a.end + 8 * 60000) continue;
    const A = { start: a.start, end: a.end, n: a.n, active: now >= a.start };
    const wLaunching = w.active && now < w.end;
    if (A.active ? !wLaunching : (!w.active && A.start < w.start)) w = A;
  }
  return w;
}
const dtFmt = new Intl.DateTimeFormat('uk-UA', { timeZone: clockFmt.resolvedOptions().timeZone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
function renderEvents() {
  const box = $('aEvents'), now = Date.now(); box.textContent = '';
  if (!adminEvents.length) { const p = document.createElement('p'); p.className = 'note'; p.style.margin = '0'; p.textContent = 'Ручних запусків ще не було.'; box.append(p); return; }
  for (const ev of adminEvents) {
    const r = document.createElement('div'); r.className = 'ev';
    const a = document.createElement('span'), s = document.createElement('span'), b = document.createElement('button');
    const K = EVENT_KINDS[ev.e.kind];
    let txt = K.label(ev.e);
    if (ev.e.kind === 'single') { const c = cityById[ev.e.city]; txt += c ? ' → ' + c.name : ' → випадкове місто'; }
    else txt += ' · ' + ev.n + ' цілей';
    a.textContent = dtFmt.format(ev.e.t0) + '  ' + txt;
    const st = now < ev.e.t0 ? 'заплановано' : now < ev.end ? 'у повітрі' : 'завершено';
    s.className = 'st' + (st === 'у повітрі' ? ' live' : ''); s.textContent = st;
    b.className = 'btn'; b.type = 'button'; b.textContent = now < ev.end ? 'Скасувати' : 'Прибрати';
    b.onclick = async () => { b.disabled = true; try { await db.doc('events/' + ev.id).delete(); } catch (e) { toast('Не вдалося видалити запис'); b.disabled = false; } };
    r.append(a, s, b); box.append(r);
  }
}
async function launch(data, okMsg) {
  try { await db.collection('events').add(Object.assign({ seed: Math.floor(Math.random() * 2147483647), by: uid, at: Date.now() }, data)); toast(okMsg); }
  catch (e) { toast(e && e.code === 'invalid_argument' ? 'Запуск відхилено: немає прав адміністратора' : 'Не вдалося запустити. Спробуйте ще раз.'); }
}
const USER_COLS = [
  ['#', null], ['Позивний', 'nick'], ['Рахунок', 'score'], ['Збито', 'kills'], ['БпЛА', 'kd'], ['КР', 'kc'], ['БР', 'kb'], ['Пропущено', 'missed'],
  ['Влучність', 'acc'], ['Кошти', 'money'], ['Комплексів', 'units'], ['Стійкість', 'stab'], ['Реєстрація', 'created'], ['Остання активність', 't']
];
let userRows = [], userSort = 'score', userDir = -1;
function renderUsers() {
  const head = $('aHead'), body = $('aRows'); head.textContent = ''; body.textContent = '';
  for (const [lab, key] of USER_COLS) {
    const th = document.createElement('th'); th.textContent = lab; th.scope = 'col';
    if (key) { if (key === userSort) th.setAttribute('aria-sort', userDir < 0 ? 'descending' : 'ascending'); th.onclick = () => { if (userSort === key) userDir = -userDir; else { userSort = key; userDir = key === 'nick' ? 1 : -1; } renderUsers(); }; }
    head.append(th);
  }
  const rows = userRows.slice().sort((a, b) => { const x = a[userSort], y = b[userSort]; return (typeof x === 'string' ? x.localeCompare(String(y), 'uk') : (x || 0) - (y || 0)) * userDir; });
  rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    const cells = [i + 1, r.nick, r.score, r.kills, r.kd, r.kc, r.kb, r.missed, r.shots ? Math.round(r.acc * 100) + '%' : '—', '◈' + r.money, r.units, r.stab + '%', r.created ? dtFmt.format(r.created) : '—', r.t ? dtFmt.format(r.t) : '—'];
    for (const c of cells) { const td = document.createElement('td'); td.textContent = c; tr.append(td); }
    body.append(tr);
  });
  const now = Date.now(), sum = $('aSum'); sum.textContent = '';
  const tile = (l, v) => { const d = document.createElement('div'), s = document.createElement('small'), n = document.createElement('span'); s.textContent = l; n.textContent = v; d.append(s, n); sum.append(d); };
  tile('Зареєстровано', userRows.length);
  tile('Активні за добу', userRows.filter(r => now - r.t < 86400000).length);
  tile('Збито всього', userRows.reduce((s, r) => s + r.kills, 0));
  tile('Пропущено всього', userRows.reduce((s, r) => s + r.missed, 0));
  const b = document.createElement('button'); b.className = 'btn'; b.type = 'button'; b.textContent = 'Оновити'; b.onclick = loadUsers; sum.append(b);
}
async function loadUsers() {
  const note = $('aUsersNote');
  try {
    const q = await timeout(db.collection('scores').limit(1000).get(), 10000);
    const num = v => Number(v) || 0;
    userRows = q.docs.map(d => { const v = d.data() || {}; const shots = num(v.shots); return {
      nick: String(v.nick || 'Без позивного').slice(0, 20), score: num(v.score), kills: num(v.kills), kd: num(v.kd), kc: num(v.kc), kb: num(v.kb), missed: num(v.missed),
      shots, acc: shots ? num(v.hits) / shots : 0, money: num(v.money), units: num(v.units), stab: v.stab == null ? 100 : num(v.stab), created: num(v.created), t: num(v.t) }; });
    renderUsers();
    note.textContent = 'У списку ті, чий прогрес зберігається на сервері. Натисніть на заголовок стовпця, щоб відсортувати.';
  } catch (e) { note.textContent = 'Не вдалося завантажити список користувачів. Натисніть «Оновити».'; renderUsers(); }
}
let adminReady = false;
async function initAdmin() {
  if (adminReady || !user) return; adminReady = true;
  let can = false; try { can = !!(await user.canEdit()); } catch (e) { }
  if (!can) return;
  const opt = (sel, v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.append(o); };
  for (const k in TYPES) opt($('aType'), k, TYPES[k].full);
  opt($('aEntry'), -1, 'Випадковий'); ENTRIES.forEach((e, i) => opt($('aEntry'), i, e.n));
  opt($('aCity'), '', 'Випадкове'); CITIES.forEach(c => opt($('aCity'), c.id, c.name));
  $('adminBtn').hidden = false;
  $('adminBtn').onclick = () => {
    adminOpen = !adminOpen; $('admin').hidden = !adminOpen;
    if (adminOpen) { renderEvents(); const old = adminEvents.filter(ev => ev.end < Date.now() - 30 * 60000); (async () => { for (const ev of old) { try { await db.doc('events/' + ev.id).delete(); } catch (e) { } } })(); }
  };
  $('adminClose').onclick = () => { adminOpen = false; $('admin').hidden = true; };
  for (const b of document.querySelectorAll('[data-atab]')) b.onclick = () => {
    for (const o of document.querySelectorAll('[data-atab]')) { const on = o === b; o.setAttribute('aria-selected', on); $(o.dataset.atab).hidden = !on; }
    if (b.dataset.atab === 'aUsers') loadUsers();
  };
  $('aLaunch').onclick = () => launch({ kind: 'single', type: $('aType').value, entry: +$('aEntry').value, city: $('aCity').value, t0: Date.now() + 2000 }, 'Ціль запущено');
  let armed = 0;
  $('aWave').onclick = () => {
    const b = $('aWave');
    if (Date.now() > armed) { armed = Date.now() + 4000; b.textContent = 'Натисніть ще раз, щоб підтвердити'; setTimeout(() => { if (Date.now() >= armed) b.textContent = 'Запустити масовану атаку'; }, 4100); return; }
    armed = 0; b.textContent = 'Запустити масовану атаку';
    const n = clamp(Math.round(+$('aN').value) || 100, 10, 300), dur = clamp(+$('aDur').value || 10, 1, 30) * 60000;
    launch({ kind: 'wave', n, dur, t0: Date.now() + (+$('aDelay').value) * 60000 + 2000 }, 'Масовану атаку запущено: ' + n + ' цілей');
  };
  setInterval(() => { if (adminOpen && !$('aThreats').hidden) renderEvents(); }, 5000);
}
resize(); renderCities(); refresh(); requestAnimationFrame(frame); initStore();

/* ===== Світ: детермінований розклад цілей, однаковий для всіх ===== */
const SEED = 0x5eed2026;
const SLOT = 600000;            // фонові цілі генеруються 10-хвилинними слотами
const WIN = 4 * 3600000;        // одна масована атака на кожне 4-годинне вікно
const KM = 1.33;                // км в одній одиниці карти
const TYPES = {
  d: { name: 'БпЛА', full: 'Ударний БпЛА',      v: [1.6, 2.2], dmg: 3,  reward: 14,  pts: 10 },
  c: { name: 'КР',   full: 'Крилата ракета',    v: [4.5, 5.5], dmg: 8,  reward: 80,  pts: 50 },
  b: { name: 'БР',   full: 'Балістична ракета', v: [14, 18],   dmg: 15, reward: 600, pts: 200 }
};
const UNITS = {
  mvg:   { name: 'Мобільна вогнева група', short: 'МВГ', r: 34,  price: 150,  ammo: 4,   cap: 30, start: 15, reload: 700,  p: { d: .5,  c: .05, b: 0 } },
  short: { name: 'ЗРК малої дальності',    short: 'МД',  r: 60,  price: 700,  ammo: 35,  cap: 8,  start: 4,  reload: 1800, p: { d: .85, c: .6,  b: 0 } },
  mid:   { name: 'ЗРК середньої дальності',short: 'СД',  r: 110, price: 2400, ammo: 60,  cap: 6,  start: 3,  reload: 2600, p: { d: .9,  c: .8,  b: .2 } },
  long:  { name: 'ЗРК великої дальності',  short: 'ВД',  r: 170, price: 7000, ammo: 380, cap: 4,  start: 2,  reload: 3600, p: { d: .95, c: .9,  b: .7 } }
};
const START_MONEY = 800;
const ENTRIES = [
  { n: 'Північ', w: 3, x: [250, 520],   y: [-55, -42] },   // північ
  { n: 'Північний схід', w: 3, x: [560, 760],   y: [-55, -42] },   // північний схід
  { n: 'Схід, північна ділянка', w: 3, x: [800, 1000],  y: [40, 140] },    // схід, північніше
  { n: 'Схід', w: 3, x: [1035, 1055], y: [190, 420] },   // схід
  { n: 'Азовське море', w: 2, x: [910, 1040],  y: [485, 560] },   // Азовське море
  { n: 'Чорне море', w: 3, x: [390, 550],   y: [650, 725] }    // Чорне море
];
const ENTRY_W = ENTRIES.reduce((s, e) => s + e.w, 0);

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash2(a, b) {
  let h = Math.imul((a ^ 0x9e3779b9) >>> 0, 0x85ebca6b) ^ b;
  h = Math.imul(h ^ h >>> 13, 0xc2b2ae35);
  return (h ^ h >>> 16) >>> 0;
}
const lerp = (a, b, f) => a + (b - a) * f;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let CITY_W = 0;
function initCities() { CITY_W = CITIES.reduce((s, c) => s + c.w, 0); }

function makeTarget(rng, id, t0, mass, force) {
  const r = rng();
  let type = mass ? (r < .62 ? 'd' : r < .9 ? 'c' : 'b') : (r < .76 ? 'd' : r < .95 ? 'c' : 'b');
  if (force && TYPES[force.type]) type = force.type;
  let k = rng() * ENTRY_W, e = ENTRIES[0];
  for (const c of ENTRIES) { if ((k -= c.w) < 0) { e = c; break; } }
  if (force && ENTRIES[force.entry]) e = ENTRIES[force.entry];
  const sx = lerp(e.x[0], e.x[1], rng()), sy = lerp(e.y[0], e.y[1], rng());
  k = rng() * CITY_W; let city = CITIES[0];
  for (const c of CITIES) { if ((k -= c.w) < 0) { city = c; break; } }
  if (force && force.city) city = CITIES.find(q => q.id === force.city) || city;
  const ex = city.x + (rng() - .5) * 8, ey = city.y + (rng() - .5) * 8;
  const pts = [[sx, sy]];
  const nW = type === 'd' ? 2 : type === 'c' ? 1 : 0;
  const dx = ex - sx, dy = ey - sy, len = Math.hypot(dx, dy) || 1;
  for (let i = 0; i < nW; i++) {
    const f = (i + 1) / (nW + 1) + (rng() - .5) * .15;
    const off = (rng() - .5) * 2 * (type === 'd' ? 130 : 170);
    pts.push([clamp(sx + dx * f - dy / len * off, 15, 985), clamp(sy + dy * f + dx / len * off, 15, 655)]);
  }
  pts.push([ex, ey]);
  const cum = [0]; let L = 0;
  for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(L); }
  const T = TYPES[type], v = lerp(T.v[0], T.v[1], rng());
  return { id, type, t0, t1: t0 + L / v * 1000, pts, cum, L, v, city: city.id };
}

const slotCache = new Map(), waveCache = new Map();
function slotTargets(s) {
  let a = slotCache.get(s);
  if (a) return a;
  const rng = mulberry32(hash2(SEED, s));
  const h = ((s * SLOT / 3600000) + 2) % 24;                 // приблизно київський час
  const night = h >= 22 || h < 5;
  const n = night ? 30 + Math.floor(rng() * 12) : 17 + Math.floor(rng() * 10);
  a = [];
  for (let i = 0; i < n; i++) a.push(makeTarget(rng, 'b' + s + '_' + i, s * SLOT + rng() * SLOT, false));
  slotCache.set(s, a);
  if (slotCache.size > 12) slotCache.delete(slotCache.keys().next().value);
  return a;
}
function waveInfo(w) {
  const rng = mulberry32(hash2(SEED ^ 0xabcdef, w));
  const start = w * WIN + 20 * 60000 + rng() * (WIN - 60 * 60000);
  const dur = (12 + rng() * 6) * 60000;
  const n = 90 + Math.floor(rng() * 60);
  return { w, start, end: start + dur, dur, n, rng };
}
function waveTargets(w) {
  let a = waveCache.get(w);
  if (a) return a;
  const i = waveInfo(w); a = [];
  for (let k = 0; k < i.n; k++) a.push(makeTarget(i.rng, 'm' + w + '_' + k, i.start + i.rng() * i.dur, true));
  waveCache.set(w, a);
  if (waveCache.size > 4) waveCache.delete(waveCache.keys().next().value);
  return a;
}
/* усі цілі, що можуть бути в повітрі в момент now */
function candidates(now) {
  const s = Math.floor(now / SLOT), w = Math.floor(now / WIN);
  return [].concat(slotTargets(s - 2), slotTargets(s - 1), slotTargets(s), waveTargets(w - 1), waveTargets(w));
}
function posAt(t, now) {
  const d = clamp((now - t.t0) / 1000 * t.v, 0, t.L);
  let i = 1;
  while (i < t.cum.length - 1 && t.cum[i] < d) i++;
  const f = (d - t.cum[i - 1]) / ((t.cum[i] - t.cum[i - 1]) || 1);
  const a = t.pts[i - 1], b = t.pts[i];
  return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), Math.atan2(b[1] - a[1], b[0] - a[0])];
}
/* стан масованої атаки: поточна або наступна хвиля */
function waveState(now) {
  const w = Math.floor(now / WIN);
  for (const k of [w - 1, w, w + 1, w + 2]) {
    const i = waveInfo(k);
    if (now < i.end + 8 * 60000) return { start: i.start, end: i.end, n: i.n, active: now >= i.start };
  }
}

/* ===== Ручні запуски адміністратора: спільні для всіх гравців ===== */
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
/* рядки таблиці events -> події, цілі та хвилі */
function buildEvents(rows) {
  const events = [], targets = [], waves = [];
  for (const r of rows) {
    const e = Object.assign({}, r.data, { kind: r.kind, t0: Number(r.t0) });
    if (!EVENT_KINDS[e.kind] || !Number.isFinite(e.t0)) continue;
    let ts; try { ts = EVENT_KINDS[e.kind].build(r.id, e); } catch (err) { continue; }
    events.push({ id: r.id, e, end: Math.max.apply(null, ts.map(t => t.t1)), n: ts.length });
    for (const t of ts) targets.push(t);
    if (e.kind === 'wave') waves.push({ start: e.t0, end: e.t0 + clamp(+e.dur || 0, 60000, 30 * 60000), n: ts.length });
  }
  events.sort((a, b) => b.e.t0 - a.e.t0);
  return { events, targets, waves };
}
/* поточна або наступна масована атака з урахуванням ручних */
function curWave(now, adminWaves) {
  let w = waveState(now);
  for (const a of adminWaves || []) {
    if (now >= a.end + 8 * 60000) continue;
    const A = { start: a.start, end: a.end, n: a.n, active: now >= a.start };
    const wLaunching = w.active && now < w.end;
    if (A.active ? !wLaunching : (!w.active && A.start < w.start)) w = A;
  }
  return w;
}

// Project X: серверна функція гри (Supabase Edge Function).
// Файл index.ts збирається скриптом supabase/build.sh із js/core.js та logic.js. Не редагуйте index.ts вручну.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
const CITIES=[{"id":"kyiv","name":"Київ","x":463.5,"y":172.2,"w":5},{"id":"kharkiv","name":"Харків","x":778.4,"y":212,"w":4},{"id":"odesa","name":"Одеса","x":474.5,"y":503.8,"w":4},{"id":"dnipro","name":"Дніпро","x":713.4,"y":341.7,"w":3},{"id":"zaporizhzhia","name":"Запоріжжя","x":718.3,"y":393.1,"w":3},{"id":"lviv","name":"Львів","x":105.4,"y":224.9,"w":2},{"id":"mykolaiv","name":"Миколаїв","x":545.1,"y":464.3,"w":2},{"id":"kryvyirih","name":"Кривий Ріг","x":621.8,"y":387.3,"w":2},{"id":"poltava","name":"Полтава","x":685.8,"y":246.3,"w":2},{"id":"sumy","name":"Суми","x":699.6,"y":132,"w":2},{"id":"chernihiv","name":"Чернігів","x":505.9,"y":79.9,"w":2},{"id":"kherson","name":"Херсон","x":579.3,"y":490.9,"w":2},{"id":"vinnytsia","name":"Вінниця","x":350.4,"y":276.9,"w":1},{"id":"khmelnytskyi","name":"Хмельницький","x":268.7,"y":260.8,"w":1},{"id":"zhytomyr","name":"Житомир","x":360.8,"y":189.6,"w":1},{"id":"cherkasy","name":"Черкаси","x":548.4,"y":259.1,"w":1},{"id":"kropyvnytskyi","name":"Кропивницький","x":559.4,"y":337.5,"w":1},{"id":"rivne","name":"Рівне","x":227.9,"y":157.4,"w":1},{"id":"frankivsk","name":"Івано-Франківськ","x":142.9,"y":303.1,"w":1},{"id":"lutsk","name":"Луцьк","x":177.1,"y":146.1,"w":1}];
const MASK="0000000000000000000000000000000000000000000000000000000011101111110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111111111100000000000000000000000000000000000000000000000000000000000000000000000000000000011111111111111111110000000000000000000000000000000000000000000000000110000000000000000000000000000001111111111111111111000000000000000000000000000000000000000000000111111111111000000000000000000000001111111111111111111110000000000000000000000000000000000000000000111111111111111111000000000000000000111111111111111111111100000000000000000000000000000000000000011111111111111111111111101100011000000111111111111111111111100000000000000000000000000000000000000001111111111111111111111111111111101000011111111111111111111110000000000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111111000000000000000000000000000000000000000011111111111111111111111111111111111111111111111111111111111100000000000000000000000000000000000000001111111111111111111111111111111111111111111111111111111111111111000000000000000000000000000000000000011111111111111111111111111111111111111111111111111111111111111111000000000000000000000000000000000001111111111111111111111111111111111111111111111111111111111111111100000000000000000000000000000000000011111111111111111111111111111111111111111111111111111111111111110000000000000000000000000000000000001111111111111111111111111111111111111111111111111111111111111111000000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111111111100000000000000000000000000000000000011111111111111111111111111111111111111111111111111111111111111110000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111111111111111100000111000000000000000000000111111111111111111111111111111111111111111111111111111111111111111111111111111100000000000000000000111111111111111111111111111111111111111111111111111111111111111111111111111111111000000000000000000111111111111111111111111111111111111111111111111111111111111111111111111111111111111100000000000000011111111111111111111111111111111111111111111111111111111111111111111111111111111111111110000000000011111111111111111111111111111111111111111111111111111111111111111111111111111111111111111110000000011111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111110000011111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111001111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111100011111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111110001111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111001111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111101111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111100111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111011111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111001111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111110111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111001111111111111111111111111100000111111111111111111111111111111111111111111111111111111111111111111100011111111111111111111111000000001111111111111111111111111111111111111111111111111111111111111111110001111111111111111111111000000000011011111111111111111111111111111111111111111111111111111111111111000001111111111111111111000000000000001111111111111111111111111111111111111111111111111111111111111000000000000000011110000000000000000000001111111111111111111111111111111111111111111111111111111111100000000000000000110000000000000000000000111111111111111111111111111111111111111111111111111111000000000000000000000000000000000000000000000111111111111111111111111111111111111111111111111111111000000000000000000000000000000000000000000000011111111111111111111111111111111111111111111111111110000000000000000000000000000000000000000000000000111111111111111111111111111111111111111111111111111000000000000000000000000000000000000000000000000000111111111111111111111111111111111111111111111111100000000000000000000000000000000000000000000000000111111111111111111111111111111111111111111111111110000000000000000000000000000000000000000000000000001111111111111111111111111111111111111111111100000000000000000000000000000000000000000000000000000000011111111111111111111111111111111111111111010000000000000000000000000000000000000000000000000000000000111111111111111111111111111111111111111000000000000000000000000000000000000000000000000000000001100011111111111111111111111111111111110101100000000000000000000000000000000000000000000000000000001111111111100001111111111111111111111110000000000000000000000000000000000000000000000000000000000000111111111110001111111111111111111111100000000000000000000000000000000000000000000000000000000000000011111111111000011111111111111111111100000000000000000000000000000000000000000000000000000000000000001111111111000000000111111110111111110000000000000000000000000000000000000000000000000000000000000001111111111000000000000011000000011100000000000000000000000000000000000000000000000000000000000000000111111111100000000000000000000000011000000000000000000000000000000000000000000000000000000000000000111111111100000000000000000000000001100000000000000000000000000000000000000000000000000000000000000111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000111111111100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001111110110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011000011000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
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
/* ===== Серверна логіка гри: усе, що впливає на кошти й рахунок, вирішується тут ===== */
const MAX_UNITS = 60;
function newState(nick, now) {
  return { v: 2, nick, money: START_MONEY, score: 0, kills: { d: 0, c: 0, b: 0 }, missed: 0, shots: 0, hits: 0, units: [], cities: {}, dead: {}, uid: 1, created: now, saved: now };
}
function normalize(st, now) {
  st = st && typeof st === 'object' ? st : {};
  const n = v => Number.isFinite(+v) ? Math.round(+v) : 0;
  st.v = 2; st.nick = cleanNick(st.nick) || 'Гравець';
  st.money = Math.max(0, n(st.money)); st.score = Math.max(0, n(st.score));
  const k = st.kills || {}; st.kills = { d: n(k.d), c: n(k.c), b: n(k.b) };
  st.missed = n(st.missed); st.shots = n(st.shots); st.hits = n(st.hits);
  st.units = (Array.isArray(st.units) ? st.units : []).filter(u => u && UNITS[u.t]).map(u => ({ id: n(u.id), t: u.t, x: +u.x || 0, y: +u.y || 0, ammo: clamp(n(u.ammo), 0, UNITS[u.t].cap), cd: n(u.cd) }));
  st.cities = st.cities && typeof st.cities === 'object' ? st.cities : {};
  st.dead = st.dead && typeof st.dead === 'object' ? st.dead : {};
  for (const id in st.dead) if (!(st.dead[id] > now - 60000)) delete st.dead[id];
  st.uid = Math.max(n(st.uid), 1, ...st.units.map(u => u.id + 1));
  st.created = n(st.created) || now;
  delete st.grants;
  return st;
}
function statRow(st) {
  let sum = 0; for (const c of CITIES) sum += st.cities[c.id] == null ? 100 : st.cities[c.id];
  return { nick: st.nick, score: st.score, kills: st.kills.d + st.kills.c + st.kills.b, kd: st.kills.d, kc: st.kills.c, kb: st.kills.b,
    missed: st.missed, shots: st.shots, hits: st.hits, money: st.money, units: st.units.length, stab: Math.round(sum / CITIES.length) };
}
const cleanNick = v => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, '').trim().slice(0, 16);
function onLand(x, y) {
  const cx = Math.floor(x / 10), cy = Math.floor(y / 10);
  return cx >= 0 && cx < 100 && cy >= 0 && cy < 67 && MASK[cy * 100 + cx] === '1';
}
/* ціль відновлюється з її ідентифікатора: клієнт не може вигадати ціль, якої немає в розкладі */
async function resolveTarget(db, id, now, cache) {
  const m = /^([bm])(\d{1,9})_(\d{1,3})$/.exec(id);
  if (m) {
    const n = +m[2], k = +m[3];
    if (m[1] === 'b') return Math.abs(n - Math.floor(now / SLOT)) <= 3 ? slotTargets(n)[k] || null : null;
    return Math.abs(n - Math.floor(now / WIN)) <= 1 ? waveTargets(n)[k] || null : null;
  }
  const a = /^a([0-9a-f-]{36})_(\d{1,3})$/.exec(id);
  if (!a) return null;
  let ts = cache.get(a[1]);
  if (!ts) { const row = await db.getEvent(a[1]); ts = row ? buildEvents([row]).targets : []; cache.set(a[1], ts); }
  return ts[+a[2]] || null;
}
function fireOne(st, id, t, now) {
  if (!t || now < t.t0 - 1500 || now >= t.t1) return { id, ok: false, why: 'gone' };
  if (st.dead[id]) return { id, ok: false, why: 'dead' };
  const T = TYPES[t.type], p = posAt(t, now), tol = t.v * 1.5 + 2;      // допуск на затримку мережі
  let best = null, bv = -1e9, bd = 0, why = 'range';
  for (const u of st.units) {
    const U = UNITS[u.t], d = Math.hypot(u.x - p[0], u.y - p[1]);
    if (d > U.r + tol) continue;
    if (!U.p[t.type]) { why = 'type'; continue; }
    if (u.ammo <= 0) { why = 'ammo'; continue; }
    if (u.cd > now + 200) { why = 'reload'; continue; }
    const val = U.p[t.type] * T.reward - U.ammo;
    if (val > bv) { bv = val; best = u; bd = d; }
  }
  if (!best) return { id, ok: false, why };
  const U = UNITS[best.t];
  const dur = Math.round(clamp(bd / (best.t === 'mvg' ? 60 : 90) * 1000, 250, 2200));
  const hit = Math.random() < U.p[t.type] && now + dur < t.t1;
  best.ammo--; best.cd = now + U.reload; st.shots++;
  if (hit) { st.dead[id] = Math.round(t.t1); st.money += T.reward; st.score += T.pts; st.kills[t.type]++; st.hits++; }
  return { id, ok: true, unit: best.id, dur, hit };
}
/* зміна стану з перевіркою версії рядка: одночасні запити не затирають один одного */
async function mutate(db, uid, now, fn) {
  for (let i = 0; i < 6; i++) {
    const row = await db.getPlayer(uid);
    if (!row) return { ok: false, why: 'noplayer' };
    const st = normalize(JSON.parse(JSON.stringify(row.state)), now);
    const res = (await fn(st)) || {};
    if (res.ok === false) return Object.assign({ state: st }, res);
    st.saved = now;
    if (await db.updatePlayer(uid, row.rev, Object.assign(statRow(st), { state: st }))) return Object.assign({ ok: true, state: st }, res);
  }
  return { ok: false, why: 'busy' };
}
async function handle(db, user, body) {
  const now = Date.now(), uid = user.id;
  body = body && typeof body === 'object' ? body : {};
  let out;
  switch (body.action) {
    case 'init': {
      if (!(await db.getPlayer(uid))) {
        const st = newState(cleanNick(body.nick) || cleanNick(user.user_metadata && user.user_metadata.nick) || 'Гравець', now);
        await db.insertPlayer(uid, Object.assign(statRow(st), { state: st }));
      }
      const add = await db.claimGrants(uid);
      out = await mutate(db, uid, now, st => { if (add) st.money = Math.max(0, st.money + add); return { granted: add }; });
      break;
    }
    case 'report': {                       // стан міст і пропущені цілі: довідкова статистика
      const add = await db.claimGrants(uid);
      out = await mutate(db, uid, now, st => {
        const c = body.cities && typeof body.cities === 'object' ? body.cities : {};
        for (const city of CITIES) if (c[city.id] != null) st.cities[city.id] = clamp(Math.round(+c[city.id]) || 0, 0, 100);
        const m = Math.round(+body.missed) || 0;
        st.missed = clamp(m, st.missed, st.missed + 500);
        if (add) st.money = Math.max(0, st.money + add);
        return { granted: add };
      });
      break;
    }
    case 'fire': {
      const ids = [...new Set((Array.isArray(body.targets) ? body.targets : []).map(String))].slice(0, 12);
      const cache = new Map(), tg = [];
      for (const id of ids) tg.push([id, await resolveTarget(db, id, now, cache)]);
      out = await mutate(db, uid, now, st => ({ results: tg.map(([id, t]) => fireOne(st, id, t, now)) }));
      break;
    }
    case 'place': {
      const U = UNITS[body.type], x = Math.round(+body.x * 10) / 10, y = Math.round(+body.y * 10) / 10;
      out = await mutate(db, uid, now, st => {
        if (!U || !Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, why: 'bad' };
        if (!onLand(x, y)) return { ok: false, why: 'land' };
        if (st.units.length >= MAX_UNITS) return { ok: false, why: 'limit' };
        if (st.money < U.price) return { ok: false, why: 'money' };
        st.money -= U.price;
        const u = { id: st.uid++, t: body.type, x, y, ammo: U.start, cd: 0 };
        st.units.push(u);
        return { unit: u.id };
      });
      break;
    }
    case 'buy': {
      out = await mutate(db, uid, now, st => {
        const u = st.units.find(q => q.id === +body.unit);
        if (!u) return { ok: false, why: 'nounit' };
        const U = UNITS[u.t];
        let n = clamp(Math.round(+body.n) || 1, 1, U.cap - u.ammo);
        if (U.cap - u.ammo <= 0) return { ok: false, why: 'full' };
        n = Math.min(n, Math.floor(st.money / U.ammo));
        if (n <= 0) return { ok: false, why: 'money' };
        st.money -= n * U.ammo; u.ammo += n;
        return { bought: n };
      });
      break;
    }
    case 'sell': {
      out = await mutate(db, uid, now, st => {
        const i = st.units.findIndex(q => q.id === +body.unit);
        if (i < 0) return { ok: false, why: 'nounit' };
        st.money += Math.floor(UNITS[st.units[i].t].price / 2);
        st.units.splice(i, 1);
        return {};
      });
      break;
    }
    case 'rescue': {
      out = await mutate(db, uid, now, st => {
        if (st.units.some(u => u.ammo > 0)) return { ok: false, why: 'norescue' };
        const need = st.units.length ? Math.min(...st.units.map(u => UNITS[u.t].ammo)) : UNITS.mvg.price;
        if (!(st.money < need && st.money < 150)) return { ok: false, why: 'norescue' };
        st.money = 150;
        return {};
      });
      break;
    }
    default: out = { ok: false, why: 'action' };
  }
  out.now = Date.now();
  return out;
}
/* ===== Підключення до бази та обробка запитів ===== */
const admin = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
const db = {
  async getPlayer(uid) { const { data, error } = await admin.from('players').select('state,rev').eq('id', uid).maybeSingle(); if (error) throw error; return data; },
  async insertPlayer(uid, row) { const { error } = await admin.from('players').insert(Object.assign({ id: uid, rev: 0 }, row)); if (error && error.code !== '23505') throw error; },
  async updatePlayer(uid, rev, row) {
    const { data, error } = await admin.from('players').update(Object.assign({ rev: rev + 1, updated_at: new Date().toISOString() }, row)).eq('id', uid).eq('rev', rev).select('rev');
    if (error) throw error; return data.length > 0;
  },
  async getEvent(id) { const { data } = await admin.from('events').select('id,kind,t0,data').eq('id', id).maybeSingle(); return data; },
  async claimGrants(uid) {
    const { data, error } = await admin.from('grants').update({ applied: true }).eq('user_id', uid).eq('applied', false).select('amount');
    return error || !data ? 0 : data.reduce((s, g) => s + (Math.round(Number(g.amount)) || 0), 0);
  }
};
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: Object.assign({ 'Content-Type': 'application/json' }, cors) });
initCities();
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data || !data.user) return json({ ok: false, why: 'auth' }, 401);
    return json(await handle(db, data.user, await req.json().catch(() => ({}))));
  } catch (e) {
    console.error(e);
    return json({ ok: false, why: 'server' }, 500);
  }
});

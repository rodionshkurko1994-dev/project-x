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
  st.units = (Array.isArray(st.units) ? st.units : []).filter(u => u && UNITS[u.t]).map(u => ({ id: n(u.id), t: u.t, x: +u.x || 0, y: +u.y || 0, ammo: clamp(n(u.ammo), 0, UNITS[u.t].cap), cd: Math.min(n(u.cd), now + UNITS[u.t].reload) }));   // перезарядка не може тривати довше за свій час
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

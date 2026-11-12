/* ===== Адмінка: окрема сторінка ===== */
initCities();
const $ = id => document.getElementById(id);
const CFG = window.PX_CONFIG || {};
const sb = (CFG.url && CFG.key && window.supabase) ? window.supabase.createClient(CFG.url, CFG.key) : null;
const cityById = Object.fromEntries(CITIES.map(c => [c.id, c]));
let uid = null, adminEvents = [], adminWaves = [], adminTargets = [];
/* Час світу береться із сервера: якщо годинник комп'ютера поспішає чи відстає, запуски все одно стартують вчасно. */
let tOff = 0, timeOk = false;
const NOW = () => Date.now() + tOff;
async function syncTime() {
  const t0 = Date.now();
  try {
    let { data, error } = await sb.functions.invoke('game', { body: { action: 'time' } });
    if (error && error.context) data = await error.context.json().catch(() => null);
    const t1 = Date.now();
    if (data && data.now) { tOff = data.now - (t0 + t1) / 2; timeOk = true; }
  } catch (e) { }
}


let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200); }
let clockFmt;
try { clockFmt = new Intl.DateTimeFormat('uk-UA', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); }
catch (e) { clockFmt = new Intl.DateTimeFormat('uk-UA', { timeZone: 'Europe/Kiev', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); }
const dtFmt = new Intl.DateTimeFormat('uk-UA', { timeZone: clockFmt.resolvedOptions().timeZone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const fmtDur = ms => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); const p = n => String(n).padStart(2, '0'); return (h ? p(h) + ':' : '') + p(m) + ':' + p(s % 60); };

/* ---------- стан світу у верхній смузі ---------- */
function tick() {
  const now = NOW();
  $('clock').textContent = clockFmt.format(now);
  const n = { d: 0, c: 0, b: 0 }; let all = 0;
  for (const t of candidates(now).concat(adminTargets)) if (t.t0 <= now && now < t.t1) { n[t.type]++; all++; }
  $('air').textContent = all + ' · БпЛА ' + n.d + ' · КР ' + n.c + ' · БР ' + n.b;
  const w = curWave(now, adminWaves);
  if (w.active && now < w.end) { $('waveLab').textContent = 'Масована атака · пуски ще'; $('wave').textContent = fmtDur(w.end - now); }
  else if (w.active) { $('waveLab').textContent = 'Масована атака'; $('wave').textContent = 'цілі долітають'; }
  else { $('waveLab').textContent = 'Наступна масована атака'; $('wave').textContent = 'через ' + fmtDur(w.start - now); }
}
setInterval(tick, 1000);

/* ---------- загрози ---------- */
async function pollEvents() {
  const { data, error } = await sb.from('events').select('id,kind,t0,data').order('t0', { ascending: false }).limit(200);
  if (error || !data) return;
  const b = buildEvents(data); adminEvents = b.events; adminTargets = b.targets; adminWaves = b.waves;
  renderEvents();
}
function renderEvents() {
  const box = $('aEvents'), now = NOW(); box.textContent = '';
  if (!adminEvents.length) { const p = document.createElement('p'); p.className = 'note'; p.style.margin = '0 0 8px'; p.textContent = 'Ручних запусків зараз немає.'; box.append(p); return; }
  for (const ev of adminEvents) {
    const r = document.createElement('div'); r.className = 'ev';
    const a = document.createElement('span'), s = document.createElement('span'), b = document.createElement('button');
    let txt = EVENT_KINDS[ev.e.kind].label(ev.e);
    if (ev.e.kind === 'single') { const c = cityById[ev.e.city]; txt += c ? ' → ' + c.name : ' → випадкове місто'; }
    else txt += ' · ' + ev.n + ' цілей';
    a.textContent = dtFmt.format(ev.e.t0) + '  ' + txt;
    const st = now < ev.e.t0 ? 'заплановано' : now < ev.end ? 'у повітрі' : 'завершено';
    s.className = 'st' + (st === 'у повітрі' ? ' live' : ''); s.textContent = st;
    b.className = 'btn'; b.type = 'button'; b.textContent = now < ev.end ? 'Скасувати' : 'Прибрати';
    b.onclick = async () => { b.disabled = true; const { error } = await sb.from('events').delete().eq('id', ev.id); if (error) { toast('Не вдалося видалити запис'); b.disabled = false; } else pollEvents(); };
    r.append(a, s, b); box.append(r);
  }
}
async function launch(kind, t0, data, okMsg) {
  data.seed = Math.floor(Math.random() * 2147483647);
  const { error } = await sb.from('events').insert({ kind, t0, data });
  toast(error ? 'Не вдалося запустити. Спробуйте ще раз.' : okMsg);
  if (!error) pollEvents();
}

/* ---------- користувачі ---------- */
const USER_COLS = [
  ['#', null], ['Позивний', 'nick'], ['Пошта', 'email'], ['Рахунок', 'score'], ['Збито', 'kills'], ['БпЛА', 'kd'], ['КР', 'kc'], ['БР', 'kb'], ['Пропущено', 'missed'],
  ['Влучність', 'acc'], ['Кошти', 'money'], ['Комплексів', 'units'], ['Стійкість', 'stab'], ['Реєстрація', 'created'], ['Остання активність', 't'], ['Нарахувати', null]
];
let userRows = [], userSort = 'score', userDir = -1, grantAmount = 1000;
async function grantTo(id, amount, btn) {
  btn.disabled = true;
  const { error } = await sb.from('grants').insert({ user_id: id, amount });
  toast(error ? 'Не вдалося нарахувати кошти' : 'Нараховано ◈' + amount + '. Гравець отримає кошти протягом пів хвилини або при наступному вході.');
  btn.disabled = false;
}
async function rewardReferral(invitedId, inviterNick, btn) {
  btn.disabled = true;
  const { data, error } = await sb.rpc('reward_referral', { invited: invitedId });
  if (error || !data) { toast('Не вдалося нарахувати бонус. Можливо, його вже нараховано.'); btn.disabled = false; }
  else toast('Гравцю ' + inviterNick + ' нараховано ◈1000 за запрошення');
  loadUsers();
}
function renderUsers() {
  const head = $('aHead'), body = $('aRows'); head.textContent = ''; body.textContent = '';
  for (const [lab, key] of USER_COLS) {
    const th = document.createElement('th'); th.textContent = lab; th.scope = 'col';
    if (key) { if (key === userSort) th.setAttribute('aria-sort', userDir < 0 ? 'descending' : 'ascending'); th.onclick = () => { if (userSort === key) userDir = -userDir; else { userSort = key; userDir = (key === 'nick' || key === 'email') ? 1 : -1; } renderUsers(); }; }
    head.append(th);
  }
  const byId = Object.fromEntries(userRows.map(q => [q.id, q]));
  const rows = userRows.slice().sort((a, b) => { const x = a[userSort], y = b[userSort]; return (typeof x === 'string' ? x.localeCompare(String(y), 'uk') : (x || 0) - (y || 0)) * userDir; });
  rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    const cells = [i + 1, r.nick, r.email, r.score, r.kills, r.kd, r.kc, r.kb, r.missed, r.shots ? Math.round(r.acc * 100) + '%' : '—', '◈' + r.money, r.units, r.stab + '%', r.created ? dtFmt.format(r.created) : '—', r.t ? dtFmt.format(r.t) : '—'];
    for (const c of cells) { const td = document.createElement('td'); td.textContent = c; tr.append(td); }
    const nickTd = tr.children[1];                       // примітки про запрошення біля позивного
    if (r.referredBy && byId[r.referredBy]) { const d = document.createElement('div'); d.className = 'refnote'; d.textContent = 'прийшов за запрошенням: ' + byId[r.referredBy].nick; nickTd.append(d); }
    for (const inv of userRows.filter(q => q.referredBy === r.id)) {
      const d = document.createElement('div'); d.className = 'refnote' + (inv.refRewarded ? ' done' : '');
      const s = document.createElement('span'); s.textContent = 'запросив: ' + inv.nick + (inv.created ? ' · ' + dtFmt.format(inv.created) : ''); d.append(s);
      if (inv.refRewarded) { const ok = document.createElement('span'); ok.textContent = 'бонус нараховано'; d.append(ok); }
      else { const b = document.createElement('button'); b.className = 'btn'; b.type = 'button'; b.textContent = 'Нарахувати ◈1000'; b.onclick = () => rewardReferral(inv.id, r.nick, b); d.append(b); }
      nickTd.append(d);
    }
    const gtd = document.createElement('td'), gb = document.createElement('button'); gb.className = 'btn'; gb.type = 'button'; gb.style.padding = '3px 9px';
    const amt = clamp(Math.round(+grantAmount) || 0, -1000000, 1000000); gb.textContent = (amt < 0 ? '−◈' : '+◈') + Math.abs(amt); gb.disabled = !amt;
    gb.onclick = () => grantTo(r.id, amt, gb); gtd.append(gb); tr.append(gtd);
    body.append(tr);
  });
  const now = NOW(), sum = $('aSum'); sum.textContent = '';
  const tile = (l, v) => { const d = document.createElement('div'), s = document.createElement('small'), n = document.createElement('span'); s.textContent = l; n.textContent = v; d.append(s, n); sum.append(d); };
  tile('Зареєстровано', userRows.length);
  tile('Активні за добу', userRows.filter(r => now - r.t < 86400000).length);
  tile('Збито всього', userRows.reduce((s, r) => s + r.kills, 0));
  tile('Пропущено всього', userRows.reduce((s, r) => s + r.missed, 0));
  tile('Запрошень', userRows.filter(r => r.referredBy).length);
  tile('Очікують бонусу', userRows.filter(r => r.referredBy && !r.refRewarded).length);
  const gl = document.createElement('label'), gi = document.createElement('input'); gl.htmlFor = 'aGrant'; gl.className = 'grant'; gl.textContent = 'Сума нарахування ';
  gi.id = 'aGrant'; gi.type = 'number'; gi.step = '100'; gi.value = grantAmount; gi.onchange = () => { grantAmount = +gi.value || 0; renderUsers(); }; gl.append(gi); sum.append(gl);
  const b = document.createElement('button'); b.className = 'btn'; b.type = 'button'; b.textContent = 'Оновити'; b.onclick = loadUsers; sum.append(b);
}
async function loadUsers() {
  const note = $('aUsersNote');
  const { data, error } = await sb.rpc('admin_users');
  if (error || !data) { note.textContent = 'Не вдалося завантажити список користувачів. Натисніть «Оновити».'; renderUsers(); return; }
  const num = v => Number(v) || 0;
  userRows = data.map(v => { const shots = num(v.shots); return { id: v.id,
    nick: String(v.nick || 'Без позивного').slice(0, 20), email: String(v.email || ''), score: num(v.score), kills: num(v.kills), kd: num(v.kd), kc: num(v.kc), kb: num(v.kb), missed: num(v.missed),
    shots, acc: shots ? num(v.hits) / shots : 0, money: num(v.money), units: num(v.units), stab: v.stab == null ? 100 : num(v.stab), created: Date.parse(v.created_at) || 0, t: Date.parse(v.updated_at) || 0, referredBy: v.referred_by || null, refRewarded: !!v.ref_rewarded }; });
  renderUsers();
  note.textContent = 'Усі зареєстровані гравці. Натисніть на заголовок стовпця, щоб відсортувати.';
}

/* ---------- вхід ---------- */
const gateBody = $('gateBody');
function gateText(text, withLink) {
  gateBody.textContent = '';
  const p = document.createElement('p'); p.textContent = text; gateBody.append(p);
  if (withLink) { const a = document.createElement('a'); a.href = './'; a.className = 'btn pri'; a.style.cssText = 'display:block;text-align:center;text-decoration:none'; a.textContent = 'До гри'; gateBody.append(a); }
}
function showLogin(info) {
  gateBody.textContent = '';
  const form = document.createElement('form');
  const mk = (id, label, type, ac) => { const l = document.createElement('label'); l.htmlFor = id; l.textContent = label; const i = document.createElement('input'); i.id = id; i.type = type; i.required = true; i.autocomplete = ac; form.append(l, i); return i; };
  const mail = mk('email', 'Електронна пошта', 'email', 'email'), pass = mk('password', 'Пароль', 'password', 'current-password');
  const btn = document.createElement('button'); btn.className = 'btn pri'; btn.type = 'submit'; btn.textContent = 'Увійти';
  const msg = document.createElement('p'); msg.className = 'note'; msg.setAttribute('role', 'status'); msg.textContent = info || '';
  form.append(btn);
  form.onsubmit = async e => {
    e.preventDefault(); btn.disabled = true; msg.textContent = '';
    const { data, error } = await sb.auth.signInWithPassword({ email: mail.value.trim(), password: pass.value });
    btn.disabled = false;
    if (error) { msg.textContent = /invalid login/i.test(error.message) ? 'Неправильна пошта або пароль.' : /not confirmed/i.test(error.message) ? 'Пошту ще не підтверджено. Перейдіть за посиланням у листі.' : 'Не вдалося увійти: ' + error.message; return; }
    open_(data.user);
  };
  gateBody.append(form, msg);
}
async function open_(user) {
  uid = user.id; $('logout').hidden = false;
  const { data, error } = await sb.from('admins').select('user_id').eq('user_id', uid).maybeSingle();
  if (error) { gateText('Не вдалося перевірити права доступу. Оновіть сторінку.'); return; }
  if (!data) { gateText('Цей акаунт не має прав адміністратора.', true); return; }
  $('agate').hidden = true; $('app').hidden = false;
  const opt = (sel, v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.append(o); };
  for (const k in TYPES) opt($('aType'), k, TYPES[k].full);
  opt($('aEntry'), -1, 'Випадковий'); ENTRIES.forEach((e, i) => opt($('aEntry'), i, e.n));
  opt($('aCity'), '', 'Випадкове'); CITIES.forEach(c => opt($('aCity'), c.id, c.name));
  $('aLaunch').onclick = () => launch('single', NOW() + 2000, { type: $('aType').value, entry: +$('aEntry').value, city: $('aCity').value }, 'Ціль запущено');
  let armed = 0;
  $('aWave').onclick = () => {
    const b = $('aWave');
    if (NOW() > armed) { armed = NOW() + 4000; b.textContent = 'Натисніть ще раз, щоб підтвердити'; setTimeout(() => { if (NOW() >= armed) b.textContent = 'Запустити масовану атаку'; }, 4100); return; }
    armed = 0; b.textContent = 'Запустити масовану атаку';
    const n = clamp(Math.round(+$('aN').value) || 100, 10, 300), dur = clamp(+$('aDur').value || 10, 1, 30) * 60000;
    launch('wave', NOW() + (+$('aDelay').value) * 60000 + 2000, { n, dur }, 'Масовану атаку запущено: ' + n + ' цілей');
  };
  await syncTime(); setInterval(syncTime, 300000);
  if (!timeOk) toast('Не вдалося звірити час із сервером. Запуски можуть стартувати із затримкою.');
  await pollEvents();
  const old = adminEvents.filter(ev => ev.end < NOW() - 30 * 60000).map(ev => ev.id);
  if (old.length) { await sb.from('events').delete().in('id', old); pollEvents(); }
  setInterval(() => { if (!document.hidden) pollEvents(); }, 10000);
  loadUsers();
}
$('logout').onclick = async () => { try { await sb.auth.signOut(); } catch (e) { } location.reload(); };
(async () => {
  tick();
  if (!sb) { gateText('Базу не підключено: адмінка працює лише з Supabase.', true); return; }
  try {
    const { data } = await sb.auth.getSession();
    if (data && data.session) await open_(data.session.user); else showLogin();
  } catch (e) { showLogin('Немає зв’язку із сервером. Спробуйте ще раз.'); }
})();

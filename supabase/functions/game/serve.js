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

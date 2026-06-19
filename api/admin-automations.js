const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ndbvmtuzmzbaaoxudmbk.supabase.co';
let _sb;
const getSb = () => _sb || (_sb = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY));

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY.' });
  }

  const sb = getSb();

  // GET /api/admin-automations?email=...
  if (req.method === 'GET') {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Missing email.' });

    const { data: { users }, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) return res.status(500).json({ error: listErr.message });

    const user = (users || []).find(u => u.email === email);
    if (!user) return res.status(404).json({ configs: [] });

    const { data, error } = await sb.from('automation_configs').select('*').eq('client_id', user.id).order('workflow_id');
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ configs: data || [] });
  }

  // PATCH /api/admin-automations — update config
  if (req.method === 'PATCH') {
    const { id, config } = req.body || {};
    if (!id || config === undefined) return res.status(400).json({ error: 'Missing id or config.' });

    const { error } = await sb.from('automation_configs')
      .update({ config, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  // DELETE /api/admin-automations — remove config row
  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Missing id.' });

    const { error } = await sb.from('automation_configs').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};

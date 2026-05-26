const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { workflow_id, config } = req.body || {};
  if (!workflow_id || !config) return res.status(400).json({ error: 'Missing workflow_id or config' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Verify the user token
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: { user }, error: authError } = await sb.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const { error } = await sb.from('automation_configs').upsert(
    { client_id: user.id, workflow_id, config, updated_at: new Date().toISOString() },
    { onConflict: 'client_id,workflow_id' }
  );

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
};

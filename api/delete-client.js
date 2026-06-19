const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ndbvmtuzmzbaaoxudmbk.supabase.co';
let _sb;
const getSb = () => _sb || (_sb = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY));

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId is required.' });

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server misconfiguration: missing Supabase env vars.' });
  }

  const sb = getSb();

  try {
    // Look up email before deleting (needed to clean up purchases by email)
    const { data: { user }, error: userErr } = await sb.auth.admin.getUserById(userId);
    if (userErr) return res.status(400).json({ error: userErr.message });

    // Clean up purchases (linked by email, not FK)
    if (user?.email) {
      await sb.from('purchases').delete().eq('client_email', user.email);
    }

    // Delete auth user — CASCADE handles inventory_items, automation_configs, profiles
    const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'apikey': SERVICE_KEY,
      },
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return res.status(400).json({ error: data.msg || data.message || 'Failed to delete client.' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Server misconfiguration: missing Supabase env vars.' });
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
      headers: {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'apikey': SERVICE_KEY,
      },
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(400).json({ error: data.msg || data.message || 'Failed to list clients.' });
    }

    const users = (data.users || []).map(u => ({
      id: u.id,
      email: u.email,
      business_name: u.user_metadata?.business_name || '',
      created_at: u.created_at,
    }));

    return res.status(200).json({ users });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

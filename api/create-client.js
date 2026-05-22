const { sendEmail } = require('./_mailer');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password, businessName } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const APP_URL      = process.env.APP_URL || 'https://your-app.vercel.app';

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Server misconfiguration: missing Supabase env vars.' });
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'apikey': SERVICE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { business_name: businessName || '' },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(400).json({ error: data.msg || data.message || 'Failed to create client.' });
    }

    const greeting = businessName ? `Hi ${businessName}` : 'Hi there';
    const html = `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#06070d;font-family:Inter,sans-serif">
<div style="max-width:520px;margin:40px auto;background:#0e1017;border:1px solid rgba(129,140,248,.13);border-radius:16px;overflow:hidden">
  <div style="padding:28px 32px;border-bottom:1px solid rgba(129,140,248,.13);background:linear-gradient(135deg,rgba(129,140,248,.08),rgba(6,182,212,.08))">
    <div style="font-size:20px;font-weight:800;background:linear-gradient(135deg,#818cf8,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Vela</div>
    <div style="color:#f1f2ff;font-size:18px;font-weight:700;margin-top:8px">Welcome to Vela</div>
  </div>
  <div style="padding:28px 32px">
    <p style="color:#f1f2ff;font-size:15px;margin:0 0 16px">${greeting},</p>
    <p style="color:#a8aed6;font-size:14px;line-height:1.6;margin:0 0 24px">
      Your inventory account is ready. Use the details below to sign in and start tracking your stock.
    </p>
    <div style="background:#161820;border:1px solid rgba(129,140,248,.13);border-radius:10px;padding:16px 20px;margin-bottom:24px">
      <div style="margin-bottom:10px">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#a8aed6;margin-bottom:3px">Email</div>
        <div style="color:#f1f2ff;font-size:14px;font-weight:600">${email}</div>
      </div>
      <div>
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#a8aed6;margin-bottom:3px">Password</div>
        <div style="color:#f1f2ff;font-size:14px;font-weight:600;font-family:monospace">${password}</div>
      </div>
    </div>
    <a href="${APP_URL}/login.html" style="display:inline-block;padding:11px 22px;background:linear-gradient(135deg,#818cf8,#06b6d4);color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">
      Sign In to Vela
    </a>
    <p style="color:#a8aed6;font-size:12px;margin-top:24px">We recommend changing your password after your first sign-in via Settings.</p>
  </div>
</div>
</body></html>`;

    await sendEmail({ to: email, subject: 'Your Vela inventory account is ready', html }).catch(e => console.error('welcome email failed:', e.message));

    return res.status(200).json({ id: data.id, email: data.email });
  } catch (err) {
    console.error('create-client error:', err.message);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
};

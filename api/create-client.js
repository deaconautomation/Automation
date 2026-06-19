const { createClient } = require('@supabase/supabase-js');
const { sendEmail } = require('./_mailer');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, businessName } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const APP_URL      = process.env.APP_URL || 'https://your-app.vercel.app';

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Server misconfiguration: missing Supabase env vars.' });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // Create the account with a random password the client never sees
    const tempPassword = crypto.randomBytes(24).toString('base64');

    const { data: userData, error: createErr } = await sb.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { business_name: businessName || '' },
    });

    if (createErr) return res.status(400).json({ error: createErr.message });

    // Generate a password-reset link so the client sets their own password on first login
    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${APP_URL}/reset-password.html` },
    });

    if (linkErr) {
      console.error('generateLink error:', linkErr.message);
      // Account was created — don't fail, just warn
    }

    const setPasswordLink = linkData?.properties?.action_link || `${APP_URL}/login.html`;
    const greeting = businessName ? `Hi ${businessName}` : 'Hi there';

    const html = `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#06070d;font-family:Inter,sans-serif">
<div style="max-width:520px;margin:40px auto;background:#0e1017;border:1px solid rgba(129,140,248,.13);border-radius:16px;overflow:hidden">
  <div style="padding:28px 32px;border-bottom:1px solid rgba(129,140,248,.13);background:linear-gradient(135deg,rgba(129,140,248,.08),rgba(6,182,212,.08))">
    <div style="font-size:20px;font-weight:800;background:linear-gradient(135deg,#818cf8,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Vela</div>
    <div style="color:#f1f2ff;font-size:18px;font-weight:700;margin-top:8px">Welcome to Vela — set your password</div>
  </div>
  <div style="padding:28px 32px">
    <p style="color:#f1f2ff;font-size:15px;margin:0 0 16px">${greeting},</p>
    <p style="color:#a8aed6;font-size:14px;line-height:1.6;margin:0 0 24px">
      Your inventory account has been created. Click the button below to set your password and access your dashboard.
    </p>
    <div style="background:#161820;border:1px solid rgba(129,140,248,.13);border-radius:10px;padding:16px 20px;margin-bottom:24px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#a8aed6;margin-bottom:3px">Your login email</div>
      <div style="color:#f1f2ff;font-size:14px;font-weight:600">${email}</div>
    </div>
    <a href="${setPasswordLink}" style="display:inline-block;padding:13px 26px;background:linear-gradient(135deg,#818cf8,#06b6d4);color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px">
      Set My Password →
    </a>
    <p style="color:#a8aed6;font-size:12px;margin-top:20px;line-height:1.5">
      This link expires in 24 hours. If you need a new one, use the "Forgot password?" link on the login page.
    </p>
  </div>
</div>
</body></html>`;

    await sendEmail({
      to: email,
      subject: 'Welcome to Vela — set your password to get started',
      html,
    }).catch(e => console.error('welcome email failed:', e.message));

    return res.status(200).json({ id: userData.user.id, email: userData.user.email });
  } catch (err) {
    console.error('create-client error:', err.message);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
};

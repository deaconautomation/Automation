module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, business, tier, billing, workflows, scope } = req.body || {};
  if (!name || !email || !workflows?.length) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM_EMAIL     = process.env.ALERT_FROM_EMAIL || 'onboarding@resend.dev';
  const ADMIN_EMAIL    = process.env.ADMIN_EMAIL       || 'vela.automate@gmail.com';
  const APP_URL        = process.env.APP_URL           || 'https://your-app.vercel.app';

  const isPro          = tier === 'pro';
  const workflowNames  = workflows.join(', ');
  const billingLabel   = billing === 'monthly' ? '$37/mo' : '$147 one-time';

  // ── Email to client ──────────────────────────────────────────────────
  const clientSubject = isPro
    ? 'We received your custom build request — Vela'
    : 'Your Vela automations are being set up';

  const clientHtml = isPro ? `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#06070d;font-family:Inter,sans-serif">
<div style="max-width:540px;margin:40px auto;background:#0e1017;border:1px solid rgba(129,140,248,.13);border-radius:16px;overflow:hidden">
  <div style="padding:28px 32px;border-bottom:1px solid rgba(129,140,248,.13);background:linear-gradient(135deg,rgba(129,140,248,.08),rgba(6,182,212,.08))">
    <div style="font-size:20px;font-weight:800;background:linear-gradient(135deg,#818cf8,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Vela</div>
    <div style="color:#f1f2ff;font-size:18px;font-weight:700;margin-top:8px">Request Received</div>
  </div>
  <div style="padding:28px 32px">
    <p style="color:#f1f2ff;font-size:15px;margin:0 0 16px">Hi ${name},</p>
    <p style="color:#a8aed6;font-size:14px;line-height:1.6;margin:0 0 20px">
      We've received your custom build request and will review it shortly. Expect a detailed quote in your inbox within <strong style="color:#f1f2ff">24 hours</strong>.
    </p>
    <div style="background:#161820;border:1px solid rgba(129,140,248,.13);border-radius:10px;padding:16px 20px;margin-bottom:24px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#a8aed6;margin-bottom:8px">Workflows Requested</div>
      <div style="color:#f1f2ff;font-size:14px">${workflows.map(w => '• ' + w.replace(/-/g, ' ')).join('<br>')}</div>
    </div>
    <p style="color:#a8aed6;font-size:13px;margin:0">
      Questions? Reply to this email and we'll get back to you.
    </p>
  </div>
</div>
</body></html>` : `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#06070d;font-family:Inter,sans-serif">
<div style="max-width:540px;margin:40px auto;background:#0e1017;border:1px solid rgba(129,140,248,.13);border-radius:16px;overflow:hidden">
  <div style="padding:28px 32px;border-bottom:1px solid rgba(129,140,248,.13);background:linear-gradient(135deg,rgba(129,140,248,.08),rgba(6,182,212,.08))">
    <div style="font-size:20px;font-weight:800;background:linear-gradient(135deg,#818cf8,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Vela</div>
    <div style="color:#f1f2ff;font-size:18px;font-weight:700;margin-top:8px">Your automations are being set up</div>
  </div>
  <div style="padding:28px 32px">
    <p style="color:#f1f2ff;font-size:15px;margin:0 0 16px">Hi ${name},</p>
    <p style="color:#a8aed6;font-size:14px;line-height:1.6;margin:0 0 20px">
      Thanks for choosing Vela! We're setting up your automations now. You'll receive a follow-up with your login details and configuration steps within the next few minutes.
    </p>
    <div style="background:#161820;border:1px solid rgba(129,140,248,.13);border-radius:10px;padding:16px 20px;margin-bottom:24px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#a8aed6;margin-bottom:8px">Your Workflows</div>
      <div style="color:#f1f2ff;font-size:14px">${workflows.map(w => '• ' + w.replace(/-/g, ' ')).join('<br>')}</div>
      <div style="margin-top:12px;font-size:12px;color:#a8aed6">Plan: Starter · ${billingLabel}</div>
    </div>
    <a href="${APP_URL}/inventory.html" style="display:inline-block;padding:11px 22px;background:linear-gradient(135deg,#818cf8,#06b6d4);color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">
      Go to Your Inventory →
    </a>
  </div>
</div>
</body></html>`;

  // ── Notification email to admin ───────────────────────────────────────
  const adminSubject = isPro
    ? `🔧 New Pro build request — ${business || name}`
    : `⚡ New Starter signup — ${business || name}`;

  const adminHtml = `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#06070d;font-family:Inter,sans-serif">
<div style="max-width:540px;margin:40px auto;background:#0e1017;border:1px solid rgba(129,140,248,.13);border-radius:16px;overflow:hidden">
  <div style="padding:24px 28px;border-bottom:1px solid rgba(129,140,248,.13)">
    <div style="color:#f1f2ff;font-size:16px;font-weight:700">${isPro ? '🔧 New Pro Build Request' : '⚡ New Starter Signup'}</div>
  </div>
  <div style="padding:24px 28px">
    <table style="width:100%;font-size:14px;border-collapse:collapse">
      <tr><td style="color:#a8aed6;padding:6px 0;width:120px">Name</td><td style="color:#f1f2ff;font-weight:600">${name}</td></tr>
      <tr><td style="color:#a8aed6;padding:6px 0">Email</td><td style="color:#f1f2ff;font-weight:600">${email}</td></tr>
      <tr><td style="color:#a8aed6;padding:6px 0">Business</td><td style="color:#f1f2ff">${business || '—'}</td></tr>
      <tr><td style="color:#a8aed6;padding:6px 0">Tier</td><td style="color:#f1f2ff">${isPro ? 'Pro / Custom' : `Starter · ${billingLabel}`}</td></tr>
      <tr><td style="color:#a8aed6;padding:6px 0;vertical-align:top">Workflows</td><td style="color:#f1f2ff">${workflows.map(w => w.replace(/-/g, ' ')).join(', ')}</td></tr>
      ${scope ? `<tr><td style="color:#a8aed6;padding:6px 0;vertical-align:top">Scope</td><td style="color:#f1f2ff;line-height:1.5">${scope}</td></tr>` : ''}
    </table>
  </div>
</div>
</body></html>`;

  if (!RESEND_API_KEY) {
    // No email configured — still return success so the UI works
    console.log('workflow-request: no RESEND_API_KEY, skipping emails');
    return res.status(200).json({ ok: true });
  }

  try {
    await Promise.all([
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM_EMAIL, to: email, subject: clientSubject, html: clientHtml }),
      }),
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM_EMAIL, to: ADMIN_EMAIL, subject: adminSubject, html: adminHtml }),
      }),
    ]);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('workflow-request error:', err.message);
    return res.status(500).json({ error: 'Failed to send emails. Please try again.' });
  }
};

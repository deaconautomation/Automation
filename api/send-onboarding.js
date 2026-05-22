module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, workflows, custom } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Missing client email.' });

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM_EMAIL     = process.env.ALERT_FROM_EMAIL || 'onboarding@resend.dev';
  const APP_URL        = process.env.APP_URL          || 'https://your-app.vercel.app';

  const params = new URLSearchParams({
    workflows: (workflows || []).join(','),
    email,
    tier: 'starter',
  });
  if (custom) params.set('custom', custom);

  const onboardingLink = `${APP_URL}/workflow-onboarding.html?${params}`;

  const workflowList = (workflows || []).map(w => '• ' + w.replace(/-/g, ' ')).join('<br>');

  const clientHtml = `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#06070d;font-family:Inter,sans-serif">
<div style="max-width:540px;margin:40px auto;background:#0e1017;border:1px solid rgba(129,140,248,.13);border-radius:16px;overflow:hidden">
  <div style="padding:28px 32px;border-bottom:1px solid rgba(129,140,248,.13);background:linear-gradient(135deg,rgba(129,140,248,.08),rgba(6,182,212,.08))">
    <div style="font-size:20px;font-weight:800;background:linear-gradient(135deg,#818cf8,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Vela</div>
    <div style="color:#f1f2ff;font-size:18px;font-weight:700;margin-top:8px">Your payment is verified — let's set up your automations!</div>
  </div>
  <div style="padding:28px 32px">
    <p style="color:#a8aed6;font-size:14px;line-height:1.6;margin:0 0 20px">
      Great news — your payment has been verified. Click the button below to start your AI-powered onboarding and get your automations configured in minutes.
    </p>

    ${workflowList ? `
    <div style="background:#161820;border:1px solid rgba(129,140,248,.13);border-radius:10px;padding:16px 20px;margin-bottom:24px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#a8aed6;margin-bottom:8px">Your Workflows</div>
      <div style="color:#f1f2ff;font-size:14px;line-height:1.8">${workflowList}</div>
      ${custom ? `<div style="margin-top:8px;font-size:13px;color:#a8aed6">Custom: ${custom}</div>` : ''}
    </div>` : ''}

    <a href="${onboardingLink}" style="display:inline-block;padding:13px 26px;background:linear-gradient(135deg,#818cf8,#06b6d4);color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px">
      Start My Onboarding →
    </a>

    <p style="color:#a8aed6;font-size:12px;margin:20px 0 0;line-height:1.5">
      Button not working? Copy this link: <span style="color:#818cf8;font-family:monospace;font-size:11px;word-break:break-all">${onboardingLink}</span>
    </p>
  </div>
</div>
</body></html>`;

  if (!RESEND_API_KEY) {
    console.log('send-onboarding: no RESEND_API_KEY — link would be:', onboardingLink);
    return res.status(200).json({ ok: true, link: onboardingLink });
  }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: email,
        subject: 'Your Vela onboarding is ready — click to start',
        html: clientHtml,
      }),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      console.error('send-onboarding resend error:', err);
      return res.status(500).json({ error: 'Failed to send email.' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('send-onboarding error:', err.message);
    return res.status(500).json({ error: 'Failed to send email.' });
  }
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, business, workflows, billing } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Missing required fields.' });

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM_EMAIL     = process.env.ALERT_FROM_EMAIL || 'onboarding@resend.dev';
  const ADMIN_EMAIL    = process.env.ADMIN_EMAIL      || 'vela.automate@gmail.com';

  // Banking details — set via env vars so they never appear in source code
  const BANK_NAME      = process.env.BANK_NAME        || 'Contact us at vela.automate@gmail.com';
  const ACCOUNT_HOLDER = process.env.ACCOUNT_HOLDER   || '';
  const ROUTING_NUMBER = process.env.ROUTING_NUMBER   || '';
  const ACCOUNT_NUMBER = process.env.ACCOUNT_NUMBER   || '';

  const billingLabel   = billing === 'monthly' ? '$37/mo' : '$147 one-time';
  const workflowNames  = (workflows || []).map(w => '• ' + w.replace(/-/g, ' ')).join('<br>');

  const hasBankDetails = ROUTING_NUMBER && ACCOUNT_NUMBER;

  const clientHtml = `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#06070d;font-family:Inter,sans-serif">
<div style="max-width:540px;margin:40px auto;background:#0e1017;border:1px solid rgba(129,140,248,.13);border-radius:16px;overflow:hidden">
  <div style="padding:28px 32px;border-bottom:1px solid rgba(129,140,248,.13);background:linear-gradient(135deg,rgba(129,140,248,.08),rgba(6,182,212,.08))">
    <div style="font-size:20px;font-weight:800;background:linear-gradient(135deg,#818cf8,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Vela</div>
    <div style="color:#f1f2ff;font-size:18px;font-weight:700;margin-top:8px">Wire / ACH Transfer Details</div>
  </div>
  <div style="padding:28px 32px">
    <p style="color:#f1f2ff;font-size:15px;margin:0 0 16px">Hi ${name},</p>
    <p style="color:#a8aed6;font-size:14px;line-height:1.6;margin:0 0 20px">
      Here are our banking details for your wire or ACH transfer. Please use <strong style="color:#f1f2ff">${billingLabel}</strong> as the transfer amount and include your name in the memo.
    </p>

    ${hasBankDetails ? `
    <div style="background:#161820;border:1px solid rgba(129,140,248,.13);border-radius:10px;padding:16px 20px;margin-bottom:20px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#a8aed6;margin-bottom:12px">Banking Details</div>
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        ${BANK_NAME      ? `<tr><td style="color:#a8aed6;padding:5px 0;width:140px">Bank</td><td style="color:#f1f2ff;font-weight:600">${BANK_NAME}</td></tr>` : ''}
        ${ACCOUNT_HOLDER ? `<tr><td style="color:#a8aed6;padding:5px 0">Account Holder</td><td style="color:#f1f2ff;font-weight:600">${ACCOUNT_HOLDER}</td></tr>` : ''}
        <tr><td style="color:#a8aed6;padding:5px 0">Routing Number</td><td style="color:#f1f2ff;font-weight:600;font-family:monospace">${ROUTING_NUMBER}</td></tr>
        <tr><td style="color:#a8aed6;padding:5px 0">Account Number</td><td style="color:#f1f2ff;font-weight:600;font-family:monospace">${ACCOUNT_NUMBER}</td></tr>
        <tr><td style="color:#a8aed6;padding:5px 0">Amount</td><td style="color:#4ade80;font-weight:700">${billingLabel}</td></tr>
      </table>
    </div>
    ` : `
    <div style="background:#161820;border:1px solid rgba(251,191,36,.15);border-radius:10px;padding:16px 20px;margin-bottom:20px">
      <p style="color:#fbbf24;font-size:14px;margin:0">
        Please reply to this email or contact us at <a href="mailto:vela.automate@gmail.com" style="color:#818cf8">vela.automate@gmail.com</a> and we'll send you our banking details directly.
      </p>
    </div>
    `}

    <div style="background:#161820;border:1px solid rgba(129,140,248,.13);border-radius:10px;padding:16px 20px;margin-bottom:20px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#a8aed6;margin-bottom:8px">Your Order</div>
      <div style="color:#f1f2ff;font-size:14px">${workflowNames}</div>
      <div style="margin-top:8px;font-size:12px;color:#a8aed6">Plan: Starter · ${billingLabel}</div>
    </div>

    <p style="color:#a8aed6;font-size:13px;margin:0;line-height:1.5">
      Once your payment clears (usually 1–2 business days), we'll send your onboarding link. Questions? Reply to this email.
    </p>
  </div>
</div>
</body></html>`;

  // Notify admin of wire request
  const adminHtml = `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#06070d;font-family:Inter,sans-serif">
<div style="max-width:480px;margin:40px auto;background:#0e1017;border:1px solid rgba(129,140,248,.13);border-radius:16px;overflow:hidden">
  <div style="padding:20px 24px;border-bottom:1px solid rgba(129,140,248,.13)">
    <div style="color:#f1f2ff;font-size:15px;font-weight:700">🏦 Wire Transfer Request</div>
  </div>
  <div style="padding:20px 24px;font-size:14px">
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="color:#a8aed6;padding:5px 0;width:100px">Client</td><td style="color:#f1f2ff;font-weight:600">${name}</td></tr>
      <tr><td style="color:#a8aed6;padding:5px 0">Email</td><td style="color:#f1f2ff">${email}</td></tr>
      <tr><td style="color:#a8aed6;padding:5px 0">Business</td><td style="color:#f1f2ff">${business || '—'}</td></tr>
      <tr><td style="color:#a8aed6;padding:5px 0">Plan</td><td style="color:#f1f2ff">${billingLabel}</td></tr>
    </table>
    <p style="color:#a8aed6;font-size:13px;margin:12px 0 0">Banking details have been emailed to the client. Watch for their transfer.</p>
  </div>
</div>
</body></html>`;

  if (!RESEND_API_KEY) {
    console.log('wire-request: no RESEND_API_KEY, skipping emails');
    return res.status(200).json({ ok: true });
  }

  try {
    await Promise.all([
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM_EMAIL, to: email,
          subject: 'Wire transfer details — Vela',
          html: clientHtml,
        }),
      }),
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM_EMAIL, to: ADMIN_EMAIL,
          subject: `🏦 Wire request — ${business || name}`,
          html: adminHtml,
        }),
      }),
    ]);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('wire-request error:', err.message);
    return res.status(500).json({ error: 'Failed to send. Please try again.' });
  }
};

const { sendEmail } = require('./_mailer');
const { createClient } = require('@supabase/supabase-js');
const { allow, getIp } = require('./_ratelimit');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ndbvmtuzmzbaaoxudmbk.supabase.co';
let _sb;
const getSb = () => _sb || (_sb = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY));

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!allow(getIp(req), 10, 60_000)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
  }

  const { name, email, business, tier, billing, workflows, method, amount, txn, notes } = req.body || {};

  if (!name || !email || !method || !amount) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'vela.automate@gmail.com';
  const APP_URL     = process.env.APP_URL     || 'https://your-app.vercel.app';

  const billingLabel   = billing === 'monthly' ? '$37/mo' : '$147 one-time';
  const workflowNames  = (workflows || []).map(w => w.replace(/-/g, ' ')).join(', ');

  const onboardingLink = `${APP_URL}/workflow-onboarding.html?workflows=${encodeURIComponent((workflows || []).join(','))}&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&business=${encodeURIComponent(business || '')}&tier=${tier}`;

  // Admin notification
  const adminHtml = `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#06070d;font-family:Inter,sans-serif">
<div style="max-width:560px;margin:40px auto;background:#0e1017;border:1px solid rgba(129,140,248,.13);border-radius:16px;overflow:hidden">
  <div style="padding:24px 28px;border-bottom:1px solid rgba(129,140,248,.13);background:linear-gradient(135deg,rgba(129,140,248,.08),rgba(6,182,212,.08))">
    <div style="font-size:20px;font-weight:800;background:linear-gradient(135deg,#818cf8,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Vela</div>
    <div style="color:#f1f2ff;font-size:16px;font-weight:700;margin-top:6px">💸 Payment Confirmation Received</div>
  </div>
  <div style="padding:24px 28px">
    <table style="width:100%;font-size:14px;border-collapse:collapse">
      <tr><td style="color:#a8aed6;padding:6px 0;width:140px">Client</td><td style="color:#f1f2ff;font-weight:600">${name}</td></tr>
      <tr><td style="color:#a8aed6;padding:6px 0">Email</td><td style="color:#f1f2ff;font-weight:600">${email}</td></tr>
      <tr><td style="color:#a8aed6;padding:6px 0">Business</td><td style="color:#f1f2ff">${business || '—'}</td></tr>
      <tr><td style="color:#a8aed6;padding:6px 0">Plan</td><td style="color:#f1f2ff">${billingLabel}</td></tr>
      <tr><td style="color:#a8aed6;padding:6px 0">Workflows</td><td style="color:#f1f2ff">${workflowNames}</td></tr>
      <tr><td style="color:#a8aed6;padding:6px 0;padding-top:12px;border-top:1px solid rgba(129,140,248,.13)">Payment Via</td><td style="color:#f1f2ff;padding-top:12px;border-top:1px solid rgba(129,140,248,.13);font-weight:600">${method}</td></tr>
      <tr><td style="color:#a8aed6;padding:6px 0">Amount</td><td style="color:#4ade80;font-weight:700;font-size:16px">${amount}</td></tr>
      ${txn ? `<tr><td style="color:#a8aed6;padding:6px 0">Transaction ID</td><td style="color:#f1f2ff;font-family:monospace">${txn}</td></tr>` : ''}
      ${notes ? `<tr><td style="color:#a8aed6;padding:6px 0;vertical-align:top">Notes</td><td style="color:#f1f2ff;line-height:1.5">${notes}</td></tr>` : ''}
    </table>

    <div style="margin-top:20px;padding:14px 16px;background:#161820;border:1px solid rgba(129,140,248,.13);border-radius:10px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#a8aed6;margin-bottom:8px">Action Required</div>
      <p style="color:#f1f2ff;font-size:13px;margin:0 0 12px;line-height:1.5">
        Verify the payment above, then send the client their onboarding link:
      </p>
      <a href="${onboardingLink}" style="display:inline-block;padding:10px 18px;background:linear-gradient(135deg,#818cf8,#06b6d4);color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:13px">
        Open Onboarding Chat →
      </a>
      <p style="color:#a8aed6;font-size:12px;margin:10px 0 0;line-height:1.5">Or copy this link to send: <span style="color:#818cf8;font-family:monospace;font-size:11px">${onboardingLink}</span></p>
    </div>
  </div>
</div>
</body></html>`;

  // Client confirmation email
  const clientHtml = `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#06070d;font-family:Inter,sans-serif">
<div style="max-width:540px;margin:40px auto;background:#0e1017;border:1px solid rgba(129,140,248,.13);border-radius:16px;overflow:hidden">
  <div style="padding:28px 32px;border-bottom:1px solid rgba(129,140,248,.13);background:linear-gradient(135deg,rgba(129,140,248,.08),rgba(6,182,212,.08))">
    <div style="font-size:20px;font-weight:800;background:linear-gradient(135deg,#818cf8,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Vela</div>
    <div style="color:#f1f2ff;font-size:18px;font-weight:700;margin-top:8px">Payment received — we're on it!</div>
  </div>
  <div style="padding:28px 32px">
    <p style="color:#f1f2ff;font-size:15px;margin:0 0 16px">Hi ${name},</p>
    <p style="color:#a8aed6;font-size:14px;line-height:1.6;margin:0 0 20px">
      We've received your payment confirmation of <strong style="color:#f1f2ff">${amount}</strong> via <strong style="color:#f1f2ff">${method}</strong>.
      We'll verify it and send you your onboarding link within a few hours.
    </p>
    <div style="background:#161820;border:1px solid rgba(129,140,248,.13);border-radius:10px;padding:16px 20px;margin-bottom:24px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#a8aed6;margin-bottom:8px">Your Workflows</div>
      <div style="color:#f1f2ff;font-size:14px">${(workflows || []).map(w => '• ' + w.replace(/-/g, ' ')).join('<br>')}</div>
      <div style="margin-top:10px;font-size:12px;color:#a8aed6">Plan: Starter · ${billingLabel}</div>
    </div>
    <p style="color:#a8aed6;font-size:13px;margin:0">
      Questions? Reply to this email and we'll get back to you.
    </p>
  </div>
</div>
</body></html>`;

  try {
    const sbAdmin = getSb();

    await Promise.all([
      sendEmail({ to: ADMIN_EMAIL, subject: `💸 Payment claim — ${business || name} · ${amount} via ${method}`, html: adminHtml }),
      sendEmail({ to: email,       subject: 'Payment received — Vela', html: clientHtml }),
      sbAdmin.from('purchases').insert({
        client_name:    name,
        client_email:   email,
        business_name:  business || null,
        tier:           tier || 'starter',
        billing:        billing || 'monthly',
        amount:         amount,
        payment_method: method,
        transaction_id: txn || null,
        workflows:      workflows || [],
        notes:          notes || null,
        status:         'pending',
      }),
    ]);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('payment-notify error:', err.message);
    return res.status(500).json({ error: 'Failed to send confirmation. Please try again.' });
  }
};

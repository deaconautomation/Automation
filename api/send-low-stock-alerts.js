const { createClient } = require('@supabase/supabase-js');
const { sendEmail } = require('./_mailer');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const APP_URL      = process.env.APP_URL || 'https://your-app.vercel.app';

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing Supabase env vars.' });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Today's day-of-month (1–31) for monthly_days check
  const todayDay = new Date().getDate();

  // Load all enabled low-stock-alerts configs
  const { data: configs, error: cfgErr } = await sb
    .from('automation_configs')
    .select('client_id, config')
    .eq('workflow_id', 'low-stock-alerts');

  if (cfgErr) return res.status(500).json({ error: cfgErr.message });

  // Build per-client config map; skip disabled automations
  const configMap = {};
  for (const row of (configs || [])) {
    if (row.config?._enabled === false) continue;
    configMap[row.client_id] = row.config;
  }

  const activeClientIds = Object.keys(configMap);
  if (activeClientIds.length === 0) {
    return res.status(200).json({ message: 'No clients have low-stock-alerts enabled.' });
  }

  // Fetch auth users to get login emails as fallback
  const usersRes  = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
    headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'apikey': SERVICE_KEY },
  });
  const usersData = await usersRes.json();
  const loginEmailMap = Object.fromEntries((usersData.users || []).map(u => [u.id, u.email]));

  // Fetch all inventory items for active clients
  const { data: allItems, error: itemsErr } = await sb
    .from('inventory_items')
    .select('*, profiles!inner(business_name)')
    .in('client_id', activeClientIds)
    .order('client_id');

  if (itemsErr) return res.status(500).json({ error: itemsErr.message });

  const results = [];

  for (const clientId of activeClientIds) {
    const cfg          = configMap[clientId];
    const monthly_days = Array.isArray(cfg.monthly_days) ? cfg.monthly_days : [];
    const alertEmail   = cfg.alert_email || loginEmailMap[clientId];
    const defaultThreshold = Number(cfg.threshold) || 0;
    const monitorAll   = cfg.monitor_all === true || cfg.monitor_all === 'true';

    if (!alertEmail) continue;

    // Only send on configured days (skip if days are set and today isn't one of them)
    if (monthly_days.length > 0 && !monthly_days.includes(todayDay)) {
      results.push({ email: alertEmail, status: 'skipped', reason: `not a send day (today=${todayDay})` });
      continue;
    }

    const clientItems = (allItems || []).filter(i => i.client_id === clientId);

    // Determine which items are low/out using per-item threshold OR the config default
    const alertItems = clientItems.filter(item => {
      if (item.qty === 0) return true;
      const effectiveThreshold = item.threshold > 0 ? item.threshold : (monitorAll ? defaultThreshold : 0);
      return effectiveThreshold > 0 && item.qty <= effectiveThreshold;
    });

    if (alertItems.length === 0) {
      results.push({ email: alertEmail, status: 'skipped', reason: 'no low/out-of-stock items' });
      continue;
    }

    const businessName = clientItems[0]?.profiles?.business_name || '';
    const outOfStock   = alertItems.filter(i => i.qty === 0);
    const lowStock     = alertItems.filter(i => i.qty > 0);

    const rows = alertItems.map(item => {
      const effectiveThreshold = item.threshold > 0 ? item.threshold : (monitorAll ? defaultThreshold : 0);
      const status = item.qty === 0 ? '🔴 Out of Stock' : '🟡 Low Stock';
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #1e293b">${item.name}${item.sku ? ` <span style="color:#a8aed6;font-size:12px">(${item.sku})</span>` : ''}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e293b;text-align:center">${item.qty}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e293b;text-align:center">${effectiveThreshold || '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e293b">${status}</td>
      </tr>`;
    }).join('');

    const html = `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#06070d;font-family:Inter,sans-serif">
<div style="max-width:560px;margin:40px auto;background:#0e1017;border:1px solid rgba(129,140,248,.13);border-radius:16px;overflow:hidden">
  <div style="padding:28px 32px;border-bottom:1px solid rgba(129,140,248,.13);background:linear-gradient(135deg,rgba(129,140,248,.08),rgba(6,182,212,.08))">
    <div style="font-size:20px;font-weight:800;color:#818cf8">Vela</div>
    <div style="color:#f1f2ff;font-size:18px;font-weight:700;margin-top:8px">Low Stock Alert</div>
    <div style="color:#a8aed6;font-size:13px;margin-top:4px">${outOfStock.length} out of stock · ${lowStock.length} running low</div>
  </div>
  <div style="padding:24px 32px">
    <p style="color:#a8aed6;font-size:14px;margin:0 0 20px">Hi${businessName ? ` ${businessName}` : ''}, here are the items that need your attention:</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;color:#f1f2ff">
      <thead><tr style="background:#161820">
        <th style="padding:8px 12px;text-align:left;color:#a8aed6;font-size:11px;text-transform:uppercase">Item</th>
        <th style="padding:8px 12px;text-align:center;color:#a8aed6;font-size:11px;text-transform:uppercase">Qty</th>
        <th style="padding:8px 12px;text-align:center;color:#a8aed6;font-size:11px;text-transform:uppercase">Threshold</th>
        <th style="padding:8px 12px;color:#a8aed6;font-size:11px;text-transform:uppercase">Status</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:24px">
      <a href="${APP_URL}/inventory.html" style="display:inline-block;padding:10px 20px;background:linear-gradient(135deg,#818cf8,#06b6d4);color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">View Inventory →</a>
    </div>
  </div>
</div>
</body></html>`;

    try {
      await sendEmail({
        to: alertEmail,
        subject: `⚠️ Low Stock Alert — ${alertItems.length} item${alertItems.length !== 1 ? 's' : ''} need attention`,
        html,
      });
      results.push({ email: alertEmail, status: 'sent', items: alertItems.length });
    } catch (e) {
      results.push({ email: alertEmail, status: 'failed', error: e.message, items: alertItems.length });
    }
  }

  return res.status(200).json({ sent: results.filter(r => r.status === 'sent').length, results });
};

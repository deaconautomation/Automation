const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages, workflows, clientName, clientEmail, clientBiz, tier } = req.body || {};

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY.' });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const WORKFLOW_REQUIREMENTS = {
    'low-stock-alerts':       'alert email address, which items to monitor (or all items), and the low stock threshold quantity per item',
    'out-of-stock-alerts':    'alert email address (confirm if same as account email)',
    'weekly-report':          'report email address and preferred day of the week to receive it',
    'supplier-auto-email':    'supplier name, supplier email address, and reorder quantities for each item',
    'reorder-reminders':      'reminder email address and how often they want reminders (weekly/monthly)',
    'csv-auto-import':        'how their CSV is structured (column names), where they get the file from, and import schedule (daily/weekly)',
    'inventory-value-report': 'report email address and preferred frequency (weekly/monthly)',
    'custom-email-alerts':    'what specific conditions should trigger an alert and who to notify',
    'shopify-sync':           'their Shopify store URL and whether they want one-way or two-way sync',
    'quickbooks-sync':        'which accounting software (QuickBooks or Xero) and what data to sync',
    'multi-location':         'how many locations, location names, and whether they need separate logins per location',
    'barcode-scanning':       'what barcode format they use and whether they have existing scanning hardware',
    'ai-forecasting':         'how long they have been tracking inventory and their typical reorder lead times',
    'purchase-orders':        'supplier contact details and their preferred PO format',
    'custom-api':             'what external system they want to connect and what data needs to flow between them',
    'custom-dashboard':       'what KPIs and metrics matter most to their business',
  };

  const PRO_WORKFLOWS = ['shopify-sync','quickbooks-sync','multi-location','barcode-scanning',
    'ai-forecasting','purchase-orders','custom-api','custom-dashboard'];

  const hasProWorkflows = workflows?.some(w => PRO_WORKFLOWS.includes(w));
  const workflowList    = (workflows || []).map(id => {
    const req = WORKFLOW_REQUIREMENTS[id] || 'their specific requirements';
    return `- ${id.replace(/-/g, ' ')}: needs ${req}`;
  }).join('\n');

  const systemPrompt = `You are Vela's AI setup assistant. Your job is to onboard ${clientName || 'a new client'} by collecting the information needed to configure their selected automations.

Client details (pulled from CRM — do NOT ask for these again):
- Name: ${clientName || 'Unknown'}
- Email: ${clientEmail || 'Unknown'}
- Business: ${clientBiz || 'Unknown'}
- Tier: ${tier === 'pro' ? 'Pro / Custom Build' : 'Starter (AI instant setup)'}

Selected workflows and what you need to collect for each:
${workflowList}

Your approach:
1. Greet them by first name, mention their business name, and briefly confirm what you're setting up. You already know who they are — never ask for their name, email, or business name.
2. Ask 1-2 questions at a time — never dump all questions at once.
3. Be conversational, friendly, and efficient.
4. If a workflow is a Pro/custom one (like Shopify sync, QuickBooks, multi-location, barcode scanning, AI forecasting, purchase orders, custom API, custom dashboard), let the client know it requires a custom build and that a specialist will reach out — then set status to escalate.
5. Once you have ALL the information needed for ALL selected workflows, summarize what you've collected, confirm it looks right, and end with status complete.
6. If their requirements are clearly too complex for automated setup, set status to escalate.

Response format:
- Always respond in plain conversational text.
- When setup is fully complete and confirmed: end your message with:
[STATUS:complete]
[CONFIG:{"workflow-id":{"key":"value"},...}]
The CONFIG must be a single line of valid JSON. Only include starter workflows (not Pro ones). Use these exact keys per workflow:
  low-stock-alerts: {"alert_email":"...","threshold":N,"monitor_all":true/false}
  out-of-stock-alerts: {"alert_email":"..."}
  weekly-report: {"report_email":"...","day_of_week":"Monday"}
  supplier-auto-email: {"supplier_name":"...","supplier_email":"..."}
  reorder-reminders: {"reminder_email":"...","frequency":"Weekly"}
  csv-auto-import: {"column_names":"...","schedule":"Daily"}
  inventory-value-report: {"report_email":"...","frequency":"Weekly"}
  custom-email-alerts: {"conditions":"...","notify_email":"..."}
- When escalation is needed: end your message with exactly: [STATUS:escalate]
- Otherwise include no status tag — just keep the conversation going.

Important: be warm, clear, and efficient. Don't be robotic. Make the client feel taken care of.`;

  // Anthropic requires at least one message; seed one when the chat is starting
  const apiMessages = (messages && messages.length > 0)
    ? messages
    : [{ role: 'user', content: 'Please start my onboarding.' }];

  try {
    let config = null;

    const response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      system:     systemPrompt,
      messages:   apiMessages,
    });

    const rawReply = response.content[0]?.text || '';

    let status = 'chatting';
    let reply  = rawReply;

    if (rawReply.includes('[STATUS:complete]')) {
      status = 'complete';
      // Strip both tags from the reply shown to client
      reply = rawReply.replace('[STATUS:complete]', '').replace(/\[CONFIG:.*?\]/s, '').trim();

      // Extract config JSON
      const configMatch = rawReply.match(/\[CONFIG:(.*?)\](?:\s|$)/s);
      if (configMatch) {
        try { config = JSON.parse(configMatch[1]); } catch(e) {}
      }

      // Fire completion email to client
      const { sendEmail } = require('./_mailer');
      const APP_URL = process.env.APP_URL || 'https://your-app.vercel.app';
      const workflowListHtml = (workflows || []).map(w => `<li style="padding:.25rem 0;color:#f1f2ff;font-size:14px">• ${w.replace(/-/g, ' ')}</li>`).join('');
      const completionHtml = `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#06070d;font-family:Inter,sans-serif">
<div style="max-width:540px;margin:40px auto;background:#0e1017;border:1px solid rgba(129,140,248,.13);border-radius:16px;overflow:hidden">
  <div style="padding:28px 32px;border-bottom:1px solid rgba(129,140,248,.13);background:linear-gradient(135deg,rgba(129,140,248,.08),rgba(6,182,212,.08))">
    <div style="font-size:20px;font-weight:800;background:linear-gradient(135deg,#818cf8,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Vela</div>
    <div style="color:#f1f2ff;font-size:18px;font-weight:700;margin-top:8px">Your Vela automations are all set! 🎉</div>
  </div>
  <div style="padding:28px 32px">
    <p style="color:#a8aed6;font-size:14px;line-height:1.6;margin:0 0 16px">
      Hey ${clientName || 'there'}, great news — your automations for <strong style="color:#f1f2ff">${clientBiz || 'your business'}</strong> have been fully configured and are ready to go.
    </p>
    ${workflowListHtml ? `
    <div style="background:#161820;border:1px solid rgba(129,140,248,.13);border-radius:10px;padding:16px 20px;margin-bottom:24px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#a8aed6;margin-bottom:10px">Configured Workflows</div>
      <ul style="list-style:none;margin:0;padding:0">${workflowListHtml}</ul>
    </div>` : ''}
    <p style="color:#a8aed6;font-size:14px;line-height:1.6;margin:0 0 24px">
      Head to your dashboard to view your inventory, monitor stock levels, and see your automations in action.
    </p>
    <a href="${APP_URL}/dashboard.html" style="display:inline-block;padding:13px 26px;background:linear-gradient(135deg,#818cf8,#06b6d4);color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px">
      Go to Dashboard →
    </a>
    <p style="color:#a8aed6;font-size:12px;margin:20px 0 0;line-height:1.5">
      Questions? Just reply to this email — we're here to help.
    </p>
  </div>
</div>
</body></html>`;
      sendEmail({
        to: clientEmail,
        subject: "Your Vela automations are all set! 🎉",
        html: completionHtml,
      }).catch(() => {});
    } else if (rawReply.includes('[STATUS:escalate]')) {
      status = 'escalate';
      reply  = rawReply.replace('[STATUS:escalate]', '').trim();

      // Notify admin of escalation
      const { sendEmail } = require('./_mailer');
      const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'vela.automate@gmail.com';
      const convo = (messages || []).map(m => `${m.role === 'user' ? clientName || 'Client' : 'AI'}: ${m.content}`).join('\n\n');
      sendEmail({
        to: ADMIN_EMAIL,
        subject: `🚨 Escalation needed — ${clientBiz || clientName}`,
        html: `<pre style="font-family:monospace;font-size:13px;line-height:1.6;color:#333">
Client: ${clientName} &lt;${clientEmail}&gt;
Business: ${clientBiz || '—'}
Workflows: ${(workflows || []).join(', ')}

--- Conversation ---
${convo}
        </pre>`,
      }).catch(() => {});
    }

    return res.status(200).json({ reply, status, config });
  } catch (err) {
    console.error('workflow-chat error:', err.message);
    return res.status(500).json({ error: 'AI error. Please try again.' });
  }
};

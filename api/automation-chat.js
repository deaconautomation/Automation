const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages, configs, clientName, clientBiz } = req.body || {};

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY.' });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const configSummary = (configs || []).map(c =>
    `${c.workflow_id}: ${JSON.stringify(c.config)}`
  ).join('\n') || 'No automations configured yet.';

  const systemPrompt = `You are Vela's automation assistant helping ${clientName || 'a client'}${clientBiz ? ` from ${clientBiz}` : ''} update their automation settings through natural conversation.

Current automation configurations:
${configSummary}

When the client wants to change a setting, confirm the change briefly and output an update command on its own line:
[UPDATE:{"workflow_id":"workflow-id-here","config":{"key":"value",...}}]

Rules:
- Always include the COMPLETE config object for the workflow (all fields, not just the changed field)
- Only output [UPDATE:...] when you have a confirmed specific change to make
- You can output multiple [UPDATE:...] lines if updating more than one workflow
- Be concise — 1-2 sentences confirming what changed
- If a workflow isn't configured yet, say so and suggest they contact their admin
- Never ask for their name, email, or business name`;

  const apiMessages = (messages && messages.length > 0)
    ? messages
    : [{ role: 'user', content: 'Hi, what can I change?' }];

  try {
    const response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 512,
      system:     systemPrompt,
      messages:   apiMessages,
    });

    const rawReply = response.content[0]?.text || '';

    const updates = [];
    const pattern = /\[UPDATE:(.*?)\]/gs;
    let match;
    while ((match = pattern.exec(rawReply)) !== null) {
      try { updates.push(JSON.parse(match[1])); } catch(e) {}
    }

    const reply = rawReply.replace(/\[UPDATE:.*?\]/gs, '').trim();

    return res.status(200).json({ reply, updates });
  } catch (err) {
    console.error('automation-chat error:', err.message);
    return res.status(500).json({ error: 'AI error. Please try again.' });
  }
};

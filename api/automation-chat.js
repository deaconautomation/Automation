const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ndbvmtuzmzbaaoxudmbk.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kYnZtdHV6bXpiYWFveHVkbWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNjUyODcsImV4cCI6MjA5Mzg0MTI4N30.CRqNEXZlUf4pRCjbVghCZg2p4rLh2Y-cKQpqSwkUw2k';
let _sbAdmin;
const getSbAdmin = () => _sbAdmin || (_sbAdmin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY));
let _ai;
const getAI = () => _ai || (_ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verify the user's JWT
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorized.' });

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server misconfiguration.' });

  // Use the user's token to verify identity (per-request client — token is caller-specific)
  const sbUser = createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY || ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user }, error: authErr } = await sbUser.auth.getUser();
  if (authErr || !user) return res.status(401).json({ error: 'Invalid or expired session.' });

  // Fetch the user's actual configs from DB using cached admin client
  const { data: configs } = await getSbAdmin()
    .from('automation_configs')
    .select('workflow_id, config')
    .eq('client_id', user.id);

  const { messages, clientName, clientBiz } = req.body || {};

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY.' });
  }

  const client = getAI();

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

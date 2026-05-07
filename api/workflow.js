import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an automation architect. The user will describe a business workflow they want to automate. Parse it and return ONLY valid JSON — no markdown, no explanation, just the JSON object.

Return this exact shape:
{
  "name": "Short workflow name (3-5 words)",
  "summary": "One sentence describing what this automation does",
  "trigger": {
    "label": "Trigger name",
    "description": "What kicks off this workflow",
    "tool": "Name of the app/service (e.g. Gmail, Slack, Typeform, Webhook)"
  },
  "steps": [
    {
      "id": 1,
      "type": "action|condition|transform|notify",
      "label": "Step name",
      "description": "What this step does",
      "tool": "App/service used"
    }
  ],
  "tools": ["list", "of", "all", "tools", "used"],
  "timeSaved": "Estimated time saved per week (e.g. '4 hours/week')",
  "complexity": "simple|moderate|advanced"
}

Rules:
- steps array: minimum 3, maximum 8 steps
- Be specific about tools (use real app names like HubSpot, Notion, Airtable, Google Sheets, Slack, etc.)
- timeSaved should be realistic
- complexity: simple = 1-2 integrations, moderate = 3-4, advanced = 5+
- If the description is vague, make reasonable assumptions for a typical business`;

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { description } = req.body || {};

  if (!description || description.trim().length < 10) {
    return res.status(400).json({ error: "Please describe a workflow (at least 10 characters)." });
  }

  try {
    const message = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: description.trim(),
        },
      ],
    });

    // Extract text content from the response (skip thinking blocks)
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock) {
      return res.status(500).json({ error: "No response from AI." });
    }

    // Parse and validate JSON
    const workflow = JSON.parse(textBlock.text);

    // Basic shape validation
    if (!workflow.name || !workflow.steps || !Array.isArray(workflow.steps)) {
      return res.status(500).json({ error: "Invalid workflow structure returned." });
    }

    return res.status(200).json(workflow);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return res.status(500).json({ error: "AI returned malformed JSON. Please try again." });
    }
    console.error("Workflow API error:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}

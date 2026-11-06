import Anthropic from "@anthropic-ai/sdk";

export const config = { maxDuration: 60 };

const client = new Anthropic();
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const ALLOWED = (process.env.ALLOWED_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

async function userFrom(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ") || auth.length < 20) return null;
  const r = await fetch(SUPABASE_URL + "/auth/v1/user", { headers: { apikey: SUPABASE_ANON_KEY, authorization: auth } });
  return r.ok ? r.json() : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  const user = await userFrom(req);
  if (!user) return res.status(401).json({ error: "Tenés que entrar con tu cuenta" });
  if (ALLOWED.length && !ALLOWED.includes(String(user.email || "").toLowerCase())) return res.status(403).json({ error: "Esta cuenta no puede usar el Copiloto" });

  const { messages, tools } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: "Falta el mensaje" });

  try {
    const msg = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages,
      tools: Array.isArray(tools) ? tools : []
    });
    return res.status(200).json({ content: msg.content, stop_reason: msg.stop_reason });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "Muchas consultas seguidas" });
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: "El Copiloto no respondió (" + (err.status || "sin código") + ")" });
    return res.status(500).json({ error: "Error del servidor" });
  }
}

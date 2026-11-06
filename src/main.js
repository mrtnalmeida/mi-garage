import { createClient } from "@supabase/supabase-js";

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const TABLE = "garage_vehicles";
const $ = (s) => document.querySelector(s);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

/* ---------- Login ---------- */
async function showLogin(msg) {
  $("#login").hidden = false;
  $("#app").hidden = true;
  if (msg) $("#loginMsg").textContent = msg;
}
async function credentials() {
  const f = $("#loginForm");
  return { email: f.email.value.trim(), password: f.password.value };
}
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#loginMsg").textContent = "Entrando…";
  const { error } = await supabase.auth.signInWithPassword(await credentials());
  if (error) $("#loginMsg").textContent = "No pude entrar: revisá el email y la contraseña.";
});
$("#signupBtn").addEventListener("click", async () => {
  const f = $("#loginForm");
  if (!f.reportValidity()) return;
  const { data, error } = await supabase.auth.signUp(await credentials());
  if (error) $("#loginMsg").textContent = "No pude crear la cuenta: " + error.message;
  else if (!data.session) $("#loginMsg").textContent = "Te mandamos un mail para confirmar la cuenta. Confirmala y después entrá.";
});

/* ---------- Datos: misma forma que usaba la app (colección con onSnapshot) ---------- */
function makeDb(user) {
  return {
    collection() {
      const doc = (id) => ({
        async set(body) {
          const { error } = await supabase.from(TABLE).upsert({ user_id: user.id, id, data: body, updated_at: new Date().toISOString() });
          if (error) throw error;
        },
        async delete() {
          const { error } = await supabase.from(TABLE).delete().eq("user_id", user.id).eq("id", id);
          if (error) throw error;
        }
      });
      const onSnapshot = (cb, onErr) => {
        let alive = true;
        const load = async () => {
          const { data, error } = await supabase.from(TABLE).select("id,data").eq("user_id", user.id);
          if (!alive) return;
          if (error) { onErr && onErr(error); return; }
          cb({ metadata: { fromCache: false }, docs: data.map((r) => ({ id: r.id, exists: true, data: () => r.data })) });
        };
        load();
        const ch = supabase.channel("garage-" + user.id)
          .on("postgres_changes", { event: "*", schema: "public", table: TABLE, filter: "user_id=eq." + user.id }, load)
          .subscribe();
        const onVis = () => { if (document.visibilityState === "visible") load(); };
        document.addEventListener("visibilitychange", onVis);
        return () => { alive = false; supabase.removeChannel(ch); document.removeEventListener("visibilitychange", onVis); };
      };
      return { doc, onSnapshot };
    }
  };
}

/* ---------- Copiloto: bucle de herramientas contra /api/copiloto ---------- */
function makeSample() {
  return async function sample(msgs, { tools = [], onText } = {}) {
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    const defs = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
    const messages = msgs.map((m) => ({ role: m.role, content: m.content }));
    for (let turn = 0; turn < 12; turn++) {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch("/api/copiloto", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + (session ? session.access_token : "") },
        body: JSON.stringify({ messages, tools: defs })
      });
      const res = await r.json().catch(() => ({}));
      if (!r.ok) { const e = new Error(res.error || "el servidor respondió " + r.status); if (r.status === 429) e.code = "rate_limited"; throw e; }
      const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      if (res.stop_reason === "refusal") return { text: "Eso no te lo puedo responder. Probá preguntarlo de otra forma." };
      if (res.stop_reason !== "tool_use") { onText && onText({ text }); return { text }; }
      if (text && onText) onText({ text });
      messages.push({ role: "assistant", content: res.content });
      const results = await Promise.all(res.content.filter((b) => b.type === "tool_use").map(async (b) => {
        try {
          const t = byName[b.name];
          if (!t) throw new Error("herramienta desconocida");
          const out = await t.execute(b.input || {});
          return { type: "tool_result", tool_use_id: b.id, content: JSON.stringify(out ?? { ok: true }) };
        } catch (err) {
          return { type: "tool_result", tool_use_id: b.id, content: String(err && err.message || err), is_error: true };
        }
      }));
      messages.push({ role: "user", content: results });
    }
    return { text: "Me quedé sin vueltas para responder. Probá con una pregunta más corta." };
  };
}

/* ---------- Arranque ---------- */
let started = false;
async function start(user) {
  if (started) return;
  started = true;
  $("#login").hidden = true;
  $("#app").hidden = false;
  document.body.classList.remove("locked");
  const db = makeDb(user);
  const sample = makeSample();
  window.claude = { use: async (name) => (name === "db" ? db : name === "sample" ? sample : null) };
  await import("./app.js");
}

supabase.auth.onAuthStateChange((event, session) => {
  if (session && session.user) start(session.user);
  else if (started) location.reload();
});
const { data: { session } } = await supabase.auth.getSession();
if (session && session.user) start(session.user); else showLogin();

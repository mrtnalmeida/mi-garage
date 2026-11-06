
(() => {
"use strict";
/* ---------- Plantillas de plan (editables luego) ---------- */
const TEMPLATES = {
  auto: [
    ["Aceite y filtro de aceite", 10000, 12],
    ["Filtro de aire", 20000, 24],
    ["Filtro de habitáculo", 15000, 12],
    ["Filtro de combustible", 40000, 48],
    ["Rotación y revisión de neumáticos", 10000, 6],
    ["Alineación y balanceo", 10000, 12],
    ["Revisión de frenos (pastillas y discos)", 20000, 12],
    ["Líquido de frenos", null, 24],
    ["Refrigerante", 60000, 48],
    ["Bujías", 40000, 48],
    ["Correa de distribución", 60000, 60],
    ["Revisión de batería", null, 12],
    ["VTV", null, 12]
  ],
  moto: [
    ["Aceite y filtro de aceite", 4000, 6],
    ["Lubricar cadena", 600, null],
    ["Ajuste y revisión de cadena", 1000, 2],
    ["Kit de arrastre (cadena, piñón, corona)", 20000, null],
    ["Filtro de aire", 8000, 12],
    ["Bujía", 8000, 12],
    ["Revisión de pastillas de freno", 5000, 6],
    ["Líquido de frenos", null, 24],
    ["Revisión de neumáticos y presión", 3000, 3],
    ["Luz de válvulas", 12000, null],
    ["Revisión de batería", null, 12],
    ["VTV", null, 12]
  ]
};
const KIND_LABEL = { auto: "Auto", moto: "Moto" };

/* ---------- Utilidades ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const fmtKm = n => (n == null || isNaN(n)) ? "—" : Math.round(n).toLocaleString("es-AR");
const fmtMoney = n => (n == null || n === "" || isNaN(n)) ? "—" : "$ " + Number(n).toLocaleString("es-AR", { maximumFractionDigits: 0 });
const parseISO = s => { if (!s) return null; const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const fmtDate = s => { const d = parseISO(s); return d ? d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" }) : "—"; };
const addMonths = (s, m) => { const d = parseISO(s); d.setMonth(d.getMonth() + m); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
const num = v => { if (v === "" || v == null) return null; const n = Number(String(v).replace(/\./g, "").replace(",", ".")); return isNaN(n) ? null : n; };

function newVehicle(kind) {
  return {
    kind, name: kind === "auto" ? "Mi auto" : "Mi moto", brand: "", model: "", year: null, plate: "",
    km: 0, kmLog: [],
    tasks: TEMPLATES[kind].map(([name, km, months]) => ({ id: uid(), name, km, months, note: "" })),
    services: []
  };
}

/* ---------- Cálculo de vencimientos ---------- */
function kmRate(v) { // km por día según el registro de odómetro
  const log = (v.kmLog || []).filter(e => e && e.date && e.km != null).slice().sort((a, b) => a.date < b.date ? -1 : 1);
  if (log.length < 2) return null;
  const a = log[0], b = log[log.length - 1];
  const days = daysBetween(a.date, b.date);
  if (days < 7 || b.km <= a.km) return null;
  return (b.km - a.km) / days;
}
function lastServiceFor(v, taskId) {
  let best = null;
  for (const s of v.services || []) {
    if (!(s.taskIds || []).includes(taskId)) continue;
    if (!best) { best = s; continue; }
    if (s.date && best.date) { if (s.date > best.date || (s.date === best.date && (s.km || 0) > (best.km || 0))) best = s; }
    else if ((s.km || 0) > (best.km || 0)) best = s;
  }
  return best;
}
function taskStatus(v, t) {
  const last = lastServiceFor(v, t.id);
  const today = todayISO();
  const r = { task: t, last, status: "none", kmLeft: null, daysLeft: null, nextKm: null, nextDate: null, frac: 0, estDate: null, firstPassed: false, approx: !!((last && last.approx) || v.kmApprox) };
  const fr = [];
  if (t.dueKm && (!last || (last.km || 0) < t.dueKm - (t.km || 0) * 0.5)) {
    r.nextKm = t.dueKm; r.kmLeft = t.dueKm - (v.km || 0);
    if (t.km) fr.push(1 - r.kmLeft / t.km);
    const rate = kmRate(v) || (v.kind === "moto" ? 15 : 33);
    if (r.kmLeft > 0) { const d = new Date(); d.setDate(d.getDate() + Math.round(r.kmLeft / rate)); r.estDate = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  }
  if (t.dueDate && (!last || last.date < t.dueDate)) {
    r.nextDate = t.dueDate; r.daysLeft = daysBetween(today, t.dueDate);
    if (t.months) fr.push(1 - r.daysLeft / (t.months * 30.44));
  }
  if (!last && !t.dueDate && !t.dueKm) { r.firstPassed = !!(t.km && (v.km || 0) >= t.km); return r; }
  if (last && t.km && last.km != null && r.nextKm == null) {
    r.nextKm = last.km + t.km; r.kmLeft = r.nextKm - (v.km || 0);
    fr.push(((v.km || 0) - last.km) / t.km);
    const rate = kmRate(v);
    if (rate && r.kmLeft > 0) { const d = new Date(); d.setDate(d.getDate() + Math.round(r.kmLeft / rate)); r.estDate = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  }
  if (t.months && last && last.date && r.nextDate == null) {
    r.nextDate = addMonths(last.date, t.months); r.daysLeft = daysBetween(today, r.nextDate);
    fr.push(daysBetween(last.date, today) / (t.months * 30.44));
  }
  if (!fr.length && r.daysLeft == null && r.kmLeft == null) return r;
  r.frac = fr.length ? Math.max(0, Math.min(1, Math.max(...fr))) : 0;
  const overdue = (r.kmLeft != null && r.kmLeft <= 0) || (r.daysLeft != null && r.daysLeft <= 0);
  const soon = (r.kmLeft != null && r.kmLeft <= Math.max(300, t.km * 0.1)) || (r.daysLeft != null && r.daysLeft <= 30) || (r.estDate && daysBetween(today, r.estDate) <= 30);
  r.status = overdue ? "bad" : soon ? "warn" : "ok";
  return r;
}
/* ---------- Estado y almacenamiento ---------- */
const state = { vehicles: {}, vid: null, view: "ruta", sub: "plan", fogOpen: false, db: null, loaded: false, readOnly: false };
let col = null;
const writeQueues = {};

function setBanner(msg) { const b = $("#banner"); if (msg) { b.textContent = msg; b.hidden = false; } else b.hidden = true; }

async function save(id) {
  const v = state.vehicles[id];
  render();
  if (!state.db) return;
  const body = JSON.parse(JSON.stringify(v));
  delete body.id;
  body.updatedAt = new Date().toISOString();
  const prev = writeQueues[id] || Promise.resolve();
  writeQueues[id] = prev.then(() => col.doc(id).set(body)).catch(e => {
    if (e && e.code === "invalid_argument") { state.readOnly = true; setBanner("No tenés permiso para guardar cambios en esta página."); }
    else if (e && e.code === "quota_exceeded") setBanner("Se llenó el espacio de datos: " + (e.message || ""));
    else setBanner("No se pudo guardar el último cambio. Probá de nuevo en un momento.");
  });
  return writeQueues[id];
}
async function removeVehicle(id) {
  delete state.vehicles[id];
  if (state.vid === id) state.vid = null;
  render();
  if (state.db) { try { await col.doc(id).delete(); } catch (e) { setBanner("No se pudo borrar el vehículo."); } }
}
function addVehicle(kind) {
  let id = kind, i = 2;
  while (state.vehicles[id]) id = kind + i++;
  state.vehicles[id] = { id, ...newVehicle(kind) };
  state.vid = id;
  save(id);
  return id;
}


/* ---------- Diálogos ---------- */
const dlg = $("#dlg"), dlgForm = $("#dlgForm");
let dlgSubmit = null;
function openDialog(html, onSubmit, cls) {
  dlg.className = cls || "";
  dlgForm.innerHTML = html;
  dlgSubmit = onSubmit;
  dlg.showModal();
  const f = dlgForm.querySelector("input,select,textarea"); if (f) f.focus();
}
dlgForm.addEventListener("submit", e => {
  e.preventDefault();
  const btn = e.submitter;
  if (btn && btn.value === "cancel") { dlg.close(); return; }
  const fd = Object.fromEntries(new FormData(dlgForm).entries());
  fd._all = new FormData(dlgForm);
  fd._action = btn ? btn.value : "ok";
  const err = dlgSubmit && dlgSubmit(fd);
  if (err === "keep") return;
  if (typeof err === "string") { let p = dlgForm.querySelector(".err"); if (!p) { p = document.createElement("p"); p.className = "err"; p.style.color = "var(--bad)"; p.style.margin = "0"; dlgForm.insertBefore(p, dlgForm.lastElementChild); } p.textContent = err; return; }
  dlg.close();
});
const btns = (okLabel, extra = "") => `<div class="row spread">${extra || "<span></span>"}<div class="row"><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn solid" value="ok">${okLabel}</button></div></div>`;

function setKm(vid, km, date, approx) {
  const v = state.vehicles[vid];
  v.kmLog = (v.kmLog || []).filter(e => e.date !== date);
  const e = { date, km }; if (approx) e.approx = true;
  v.kmLog.push(e);
  const latest = v.kmLog.slice().sort((a, b) => a.date < b.date ? -1 : 1).pop();
  if (date >= latest.date) { v.km = km; v.kmApprox = !!approx; }
}
function dlgService(vid, presetTid, sid) {
  const v = state.vehicles[vid];
  const s = sid ? (v.services || []).find(x => x.id === sid) : null;
  const sel = new Set(s ? s.taskIds : presetTid ? [presetTid] : []);
  openDialog(`<h2>${s ? "Editar service" : "Registrar service"} · ${esc(v.name)}</h2>
    <div class="grid2"><div class="field"><label for="f-date">Fecha</label><input id="f-date" name="date" type="date" value="${s ? (s.date || "") : todayISO()}"></div>
    <div class="field"><label for="f-km">Km en ese momento</label><input id="f-km" name="km" inputmode="numeric" value="${s ? (s.km ?? "") : (v.km || "")}"></div></div>
    <div class="field"><label for="f-title">Descripción</label><input id="f-title" name="title" value="${esc(s ? s.title || "" : "")}" placeholder="Opcional si marcás tareas del plan. Ej: cambio de vidrio del espejo"></div>
    <div class="field"><label>Tareas del plan que se hicieron</label><div class="checks">${(v.tasks || []).map(t => `<label><input type="checkbox" name="task" value="${esc(t.id)}" ${sel.has(t.id) ? "checked" : ""}> ${esc(t.name)}</label>`).join("")}</div></div>
    <div class="grid2"><div class="field"><label for="f-cost">Costo</label><input id="f-cost" name="cost" inputmode="decimal" value="${s && s.cost != null ? s.cost : ""}" placeholder="Opcional"></div>
    <div class="field"><label for="f-shop">Taller</label><input id="f-shop" name="shop" value="${esc(s ? s.shop || "" : "")}" placeholder="Opcional"></div></div>
    <label class="inline"><input type="checkbox" name="approx" ${s && s.approx ? "checked" : ""}> Los km o la fecha son aproximados</label>
    <div class="field"><label for="f-notes">Notas</label><textarea id="f-notes" name="notes" rows="2" placeholder="Marca de aceite, repuestos, etc.">${esc(s ? s.notes || "" : "")}</textarea></div>
    ${btns("Guardar", s ? `<button class="btn danger" value="delete" formnovalidate>Borrar</button>` : "")}`, fd => {
      if (fd._action === "delete") { v.services = v.services.filter(x => x.id !== sid); save(vid); return; }
      const taskIds = fd._all.getAll("task");
      const title = (fd.title || "").trim();
      if (!taskIds.length && !title) return "Marcá una tarea del plan o escribí una descripción.";
      const rec = { id: s ? s.id : uid(), date: fd.date || null, km: num(fd.km), taskIds, title, cost: num(fd.cost), shop: (fd.shop || "").trim(), notes: (fd.notes || "").trim() };
      if (fd.approx) rec.approx = true;
      logService(vid, rec); save(vid);
    });
}
function logService(vid, rec) {
  const v = state.vehicles[vid];
  v.services = (v.services || []).filter(x => x.id !== rec.id);
  v.services.push(rec);
  (rec.taskIds || []).forEach(tid => { const t = v.tasks.find(x => x.id === tid); if (!t) return; if (t.dueDate && rec.date && rec.date >= addMonths(t.dueDate, -3)) delete t.dueDate; if (t.dueKm && rec.km != null && rec.km >= t.dueKm - (t.km || 0) * 0.5) delete t.dueKm; });
  if (rec.km != null && rec.km > (v.km || 0)) setKm(vid, rec.km, rec.date || todayISO(), rec.approx);
}
function dlgTask(vid, tid) {
  const v = state.vehicles[vid];
  const t = tid ? v.tasks.find(x => x.id === tid) : null;
  openDialog(`<h2>${t ? "Editar tarea" : "Nueva tarea"}</h2>
    <div class="field"><label for="f-name">Nombre</label><input id="f-name" name="name" required value="${esc(t ? t.name : "")}"></div>
    <div class="grid2"><div class="field"><label for="f-ikm">Cada cuántos km</label><input id="f-ikm" name="km" inputmode="numeric" value="${t && t.km ? t.km : ""}" placeholder="Vacío si no aplica"></div>
    <div class="field"><label for="f-im">Cada cuántos meses</label><input id="f-im" name="months" inputmode="numeric" value="${t && t.months ? t.months : ""}" placeholder="Vacío si no aplica"></div></div>
    <div class="field"><label for="f-due">Vence el (opcional, para fechas fijas como la VTV)</label><input id="f-due" name="dueDate" type="date" value="${t && t.dueDate ? t.dueDate : ""}"></div>
    <div class="field"><label for="f-note">Nota</label><input id="f-note" name="note" value="${esc(t ? t.note || "" : "")}" placeholder="Ej: según manual, pág. G-16"></div>
    ${btns("Guardar", t ? `<button class="btn danger" value="delete" formnovalidate>Quitar del plan</button>` : "")}`, fd => {
      if (fd._action === "delete") { v.tasks = v.tasks.filter(x => x.id !== tid); save(vid); return; }
      const km = num(fd.km), months = num(fd.months);
      if (!km && !months && !fd.dueDate) return "Poné un intervalo en km, en meses o una fecha de vencimiento.";
      const rec = { id: t ? t.id : uid(), name: fd.name.trim(), km: km || null, months: months || null, note: (fd.note || "").trim() };
      if (fd.dueDate) rec.dueDate = fd.dueDate;
      v.tasks = t ? v.tasks.map(x => x.id === tid ? rec : x) : [...v.tasks, rec];
      save(vid);
    });
}
function dlgVehicle(vid) {
  const v = state.vehicles[vid];
  openDialog(`<h2>Datos del vehículo</h2>
    <div class="field"><label for="f-n">Nombre</label><input id="f-n" name="name" required value="${esc(v.name)}"></div>
    <div class="grid2"><div class="field"><label for="f-b">Marca</label><input id="f-b" name="brand" value="${esc(v.brand)}"></div>
    <div class="field"><label for="f-m">Modelo</label><input id="f-m" name="model" value="${esc(v.model)}"></div>
    <div class="field"><label for="f-y">Año</label><input id="f-y" name="year" inputmode="numeric" value="${esc(v.year || "")}"></div>
    <div class="field"><label for="f-p">Patente</label><input id="f-p" name="plate" value="${esc(v.plate)}"></div></div>
    <div class="field"><label for="f-specs">Ficha (un dato por línea, "Campo: valor")</label><textarea id="f-specs" name="specs" rows="6" placeholder="Motor: 1.8 16v nafta&#10;Aceite: 5W30, 4,7 L&#10;Neumáticos: 205/45 R17">${esc((v.specs || []).map(([k, x]) => k + ": " + x).join("\n"))}</textarea></div>
    <div class="field"><label for="f-pend">Pendientes y observaciones</label><textarea id="f-pend" name="pending" rows="3">${esc(v.pending || "")}</textarea></div>
    ${btns("Guardar")}`, fd => {
      const specs = (fd.specs || "").split("\n").map(l => l.trim()).filter(Boolean).map(l => { const i = l.indexOf(":"); return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : ["Dato", l]; });
      Object.assign(v, { name: fd.name.trim(), brand: fd.brand.trim(), model: fd.model.trim(), year: num(fd.year), plate: fd.plate.trim().toUpperCase(), specs, pending: (fd.pending || "").trim() });
      save(vid);
    });
}
function dlgDelete(vid) {
  const v = state.vehicles[vid];
  openDialog(`<h2>¿Borrar ${esc(v.name)}?</h2><p>Se borran su plan, su historial de services y sus lecturas de km. No se puede deshacer.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn danger" value="ok">Borrar</button></div>`, () => { removeVehicle(vid); });
}


/* ---------- Ayudas de presentación ---------- */
const kmTxt = (n, approx) => (approx ? "≈ " : "") + fmtKm(n) + " km";
const STATUS_COLOR = { bad: "var(--red)", warn: "var(--yellow)", ok: "var(--sign)", none: "#b9b19a" };
const STATUS_TXT = { bad: "Vencido", warn: "Pronto", ok: "Al día", none: "Sin registro" };
function vehicleIds() { return Object.keys(state.vehicles).sort((a, b) => (state.vehicles[a].kind + a).localeCompare(state.vehicles[b].kind + b)); }
function cur() { if (!state.vid || !state.vehicles[state.vid]) state.vid = vehicleIds()[0] || null; return state.vid ? state.vehicles[state.vid] : null; }
function statusesFor(v) { return (v.tasks || []).map(t => taskStatus(v, t)); }
function counts(v) { const c = { bad: 0, warn: 0, ok: 0, none: 0 }; statusesFor(v).forEach(s => c[s.status]++); return c; }
function worst(v) { const c = counts(v); return c.bad ? "bad" : c.warn ? "warn" : c.ok ? "ok" : "none"; }
function rateOf(v) { return kmRate(v) || (v.kind === "moto" ? 15 : 33); }
function etaDays(st, v) { // días estimados hasta el vencimiento, para ordenar la ruta
  const opts = [];
  if (st.daysLeft != null) opts.push(st.daysLeft);
  if (st.kmLeft != null) opts.push(st.kmLeft / rateOf(v));
  return opts.length ? Math.min(...opts) : Infinity;
}
function dueLine(st) {
  const p = [];
  if (st.kmLeft != null) p.push(st.kmLeft <= 0 ? `pasado por ${fmtKm(-st.kmLeft)} km` : `faltan ${fmtKm(st.kmLeft)} km`);
  if (st.daysLeft != null) p.push(st.daysLeft <= 0 ? `venció el ${fmtDate(st.nextDate)}` : st.daysLeft <= 60 ? `quedan ${st.daysLeft} días` : `vence el ${fmtDate(st.nextDate)}`);
  if (st.estDate && st.status !== "bad" && st.daysLeft == null) p.push(`a tu ritmo, cerca del ${fmtDate(st.estDate)}`);
  const s = p.join(" · ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function signKey(st) {
  const p = [];
  if (st.nextKm != null) p.push("KM " + fmtKm(st.nextKm));
  if (st.nextDate) p.push(parseISO(st.nextDate).toLocaleDateString("es-AR", { day: "numeric", month: "short" }).toUpperCase().replace(".", ""));
  return p.join(" · ") || "PRÓXIMO";
}
function intervalText(t) {
  const p = [];
  if (t.km) p.push(`cada ${fmtKm(t.km)} km`);
  if (t.months) p.push(`cada ${t.months} ${t.months === 1 ? "mes" : "meses"}`);
  return p.length ? p.join(" o ") : "fecha fija";
}

/* ---------- XP y medallas (se calculan del historial, no se guardan) ---------- */
function progress() {
  const vs = vehicleIds().map(id => state.vehicles[id]);
  let xp = 0;
  vs.forEach(v => { (v.services || []).forEach(s => { xp += (s.taskIds || []).length * 25 + (s.title ? 10 : 0); }); xp += (v.kmLog || []).length * 5; });
  const level = Math.floor(xp / 100) + 1;
  const known = vs.reduce((a, v) => a + statusesFor(v).filter(s => s.last).length, 0);
  const anyBad = vs.some(v => counts(v).bad > 0);
  const anyKnown = vs.some(v => statusesFor(v).some(s => s.status !== "none"));
  const readings = vs.reduce((a, v) => a + (v.kmLog || []).length, 0);
  const medals = [
    { t: "Primer service", s: "Registraste un service", on: vs.some(v => (v.services || []).length) },
    { t: "Sin vencidos", s: "Nada vencido en el garage", on: anyKnown && !anyBad },
    { t: "Dúo dinámico", s: "Los dos vehículos con km", on: vs.length >= 2 && vs.every(v => v.km > 0) },
    { t: "Detective", s: `8 tareas con historia (${Math.min(known, 8)}/8)`, on: known >= 8 },
    { t: "Kilometrero", s: `10 lecturas de km (${Math.min(readings, 10)}/10)`, on: readings >= 10 },
    { t: "Viajero", s: "Más de 1.000 km por mes", on: vs.some(v => (kmRate(v) || 0) * 30.44 >= 1000) }
  ];
  return { xp, level, inLevel: xp % 100, medals };
}

/* ---------- Personajes ---------- */
function face(mood) {
  const eyes = mood === "none" ? `<path d="M54 42h8M70 42h8" stroke="#1c1840" stroke-width="3" stroke-linecap="round"></path>` : `<circle cx="58" cy="42" r="4" fill="#1c1840"></circle><circle cx="74" cy="42" r="4" fill="#1c1840"></circle>`;
  const mouth = { ok: `<path d="M58 49 Q66 56 74 49" fill="none" stroke="#1c1840" stroke-width="3" stroke-linecap="round"></path>`, warn: `<path d="M58 51 H74" stroke="#1c1840" stroke-width="3" stroke-linecap="round"></path>`, bad: `<path d="M58 54 Q66 47 74 54" fill="none" stroke="#1c1840" stroke-width="3" stroke-linecap="round"></path><path d="M84 30 q3 6 0 8 q-3 -2 0 -8" fill="#7fc8ff"></path>`, none: `<ellipse cx="66" cy="52" rx="3" ry="2.5" fill="#1c1840"></ellipse><text x="88" y="22" font-family="Fredoka" font-size="14" font-weight="700" fill="#ffffff">z z</text>` }[mood];
  return eyes + mouth;
}
function carSvg(mood) {
  return `<svg width="120" height="84" viewBox="0 0 120 84" role="img" aria-label="El auto, con cara de ${STATUS_TXT[mood].toLowerCase()}">
    <path d="M10 56 Q12 36 30 32 L44 18 Q50 12 60 12 L78 12 Q88 12 94 20 L104 32 Q114 36 114 56 Z" fill="#ffffff"></path>
    <path d="M46 22 L56 18 L76 18 L88 30 L44 32 Z" fill="#b9c8ff"></path>
    <circle cx="34" cy="62" r="13" fill="#1c1840"></circle><circle cx="34" cy="62" r="5" fill="#d9d2ff"></circle>
    <circle cx="90" cy="62" r="13" fill="#1c1840"></circle><circle cx="90" cy="62" r="5" fill="#d9d2ff"></circle>
    <g transform="translate(0,0)">${face(mood)}</g></svg>`;
}
function motoSvg(mood) {
  return `<svg width="124" height="86" viewBox="0 0 124 86" role="img" aria-label="La moto, con cara de ${STATUS_TXT[mood].toLowerCase()}">
    <circle cx="24" cy="64" r="18" fill="#1c1840"></circle><circle cx="24" cy="64" r="7" fill="#d8c3a5"></circle>
    <circle cx="100" cy="64" r="18" fill="#1c1840"></circle><circle cx="100" cy="64" r="7" fill="#d8c3a5"></circle>
    <path d="M24 64 L44 44 M100 64 L92 34" stroke="#d8c3a5" stroke-width="5" stroke-linecap="round"></path>
    <path d="M14 46 Q24 38 40 42" fill="none" stroke="#f3e6d2" stroke-width="6" stroke-linecap="round"></path>
    <path d="M30 44 Q34 34 46 34 L50 46 Z" fill="#f3e6d2"></path>
    <path d="M44 46 Q46 16 70 14 Q94 14 96 34 Q96 46 84 48 L50 48 Z" fill="#b5773f" stroke="#f3e6d2" stroke-width="3"></path>
    <path d="M90 22 L104 12" stroke="#f3e6d2" stroke-width="5" stroke-linecap="round"></path>
    <circle cx="104" cy="30" r="6" fill="#ffe8a3" stroke="#f3e6d2" stroke-width="2"></circle>
    <g transform="translate(4,-14)">${face(mood)}</g></svg>`;
}
function phrase(v) {
  const sts = statusesFor(v);
  const bad = sts.find(s => s.status === "bad"), warn = sts.filter(s => s.status === "warn").sort((a, b) => etaDays(a, v) - etaDays(b, v))[0];
  if (!v.km) return "Zzz… cargame los km y me despierto";
  if (bad) return `¡Ayuda! Se me venció: ${bad.task.name.toLowerCase()}`;
  if (warn) return /vtv/i.test(warn.task.name) ? "Me pica la VTV" : `Ya casi me toca: ${warn.task.name.toLowerCase()}`;
  return "Estoy joya, seguí rodando";
}

/* ---------- Render ---------- */
function render() {
  const v = cur();
  renderHeader(v);
  document.querySelectorAll("nav.bottom .tab").forEach(b => b.setAttribute("aria-current", b.dataset.view === state.view ? "page" : "false"));
  $("#view-chat").hidden = state.view !== "copiloto";
  const m = $("#view-main");
  m.hidden = state.view === "copiloto";
  if (state.view === "copiloto") return;
  if (!state.loaded) { m.innerHTML = `<p class="empty">Cargando tus vehículos…</p>`; return; }
  if (!v) { m.innerHTML = `<div class="pad"><span class="h2fun">Empecemos</span><p style="margin:0">Todavía no hay vehículos. Creá uno con un plan típico que después ajustás.</p><div class="row"><button class="btn solid" data-act="add" data-kind="auto" type="button">Agregar auto</button><button class="btn solid" data-act="add" data-kind="moto" type="button">Agregar moto</button></div></div>`; return; }
  m.innerHTML = state.view === "misiones" ? renderMissions(v) : state.view === "libreta" ? renderBook(v) : renderRoad(v);
}
function renderHeader(v) {
  const p = progress();
  $("#lvl").textContent = p.level;
  $("#xptxt").textContent = `Nivel ${p.level} · ${p.xp} XP`;
  $("#vtitle").textContent = state.view === "misiones" ? "Misiones" : state.view === "libreta" ? "Libreta" : state.view === "copiloto" ? "Copiloto" : "Hoja de ruta";
  $("#vswitch").innerHTML = vehicleIds().map(id => { const x = state.vehicles[id]; return `<button type="button" data-vid-pick="${esc(id)}" aria-pressed="${id === state.vid}"><span class="dot" style="background:${STATUS_COLOR[worst(x)]}"></span>${esc(x.name)}</button>`; }).join("");
}

function renderRoad(v) {
  const sts = statusesFor(v);
  const live = sts.filter(s => s.status !== "none").sort((a, b) => etaDays(b, v) - etaDays(a, v));
  const fog = sts.filter(s => s.status === "none").sort((a, b) => (b.firstPassed - a.firstPassed));
  const rate = kmRate(v);
  const past = (v.services || []).slice().sort((a, b) => (b.km || 0) - (a.km || 0) || String(b.date || "").localeCompare(String(a.date || ""))).slice(0, 3);
  const names = Object.fromEntries((v.tasks || []).map(t => [t.id, t.name]));
  const pin = st => st.status === "warn" ? `<div class="diamond" aria-hidden="true"></div>` : st.status === "bad" ? `<div class="octa" aria-hidden="true">PARE</div>` : `<div class="pin-dot" aria-hidden="true"></div>`;
  const groups = [];
  live.forEach(st => { const g = st.nextKm != null && groups.find(x => x.km === st.nextKm); if (g) g.items.push(st); else groups.push({ km: st.nextKm, items: [st] }); });
  const rank = { bad: 0, warn: 1, ok: 2 };
  const stops = groups.map(g => {
    const st = g.items.slice().sort((x, y) => rank[x.status] - rank[y.status])[0];
    if (g.items.length === 1) return `<div class="stop"><div class="pin">${pin(st)}</div>
      <button class="sign ${st.status}${st.approx ? " approx" : ""}" type="button" data-act="sign" data-tid="${esc(st.task.id)}">
        <span class="k">${esc(st.status === "bad" ? "VENCIDO · " + signKey(st) : signKey(st))}</span><span class="n">${esc(st.task.name)}</span><span class="d">${esc(dueLine(st))}</span>
      </button></div>`;
    const kmLine = st.kmLeft <= 0 ? `Pasado por ${fmtKm(-st.kmLeft)} km` : `Faltan ${fmtKm(st.kmLeft)} km`;
    return `<div class="stop"><div class="pin">${pin(st)}</div>
      <div class="sign ${st.status}${st.approx ? " approx" : ""}" style="gap:4px">
        <span class="k">${esc((st.status === "bad" ? "VENCIDO · " : "") + "KM " + fmtKm(g.km) + " · PARADA")}</span><span class="n">Service de los ${esc(fmtKm(g.km))}</span><span class="d">${esc(kmLine)} · ${g.items.length} trabajos</span>
        <span style="display:grid;gap:4px;margin-top:4px">${g.items.map(x => `<button type="button" data-act="sign" data-tid="${esc(x.task.id)}" style="text-align:left;border:none;border-radius:6px;padding:6px 8px;background:rgb(255 255 255 / .18);color:inherit;font-size:14px;font-weight:700">${esc(x.task.name)}</button>`).join("")}</span>
      </div></div>`;
  }).join("");
  const fogN = fog.length, fogPassed = fog.filter(s => s.firstPassed).length;
  const fogBlock = fogN ? `<div class="stop"><div class="pin"><div class="pin-dot" style="display:grid;place-items:center;width:30px;height:30px;font:800 15px var(--font-body)" aria-hidden="true">?</div></div>
      <div><button class="fog" type="button" data-act="fog" aria-expanded="${state.fogOpen}">
        <span class="k">TRAMO SIN MAPA</span><span class="n">${fogN} ${fogN === 1 ? "tarea" : "tareas"} sin registro</span>
        <span class="d">${fogPassed ? `${fogPassed} ya cumplieron su intervalo. ` : ""}Cargalas y aparecen en la ruta.</span></button>
        ${state.fogOpen ? `<div class="foglist">${fog.map(s => `<button type="button" data-act="service" data-tid="${esc(s.task.id)}"><span>${esc(s.task.name)}</span><span>Registrar +25</span></button>`).join("")}</div>` : ""}
      </div></div>` : "";
  const vehicleToken = v.kind === "moto"
    ? `<svg width="40" height="74" viewBox="0 0 40 74" role="img" aria-label="Tu moto"><rect x="14" y="4" width="12" height="20" rx="6" fill="#1f2420"></rect><rect x="14" y="50" width="12" height="20" rx="6" fill="#1f2420"></rect><rect x="9" y="18" width="22" height="38" rx="10" fill="#7a4a2a" stroke="#1f2420" stroke-width="3"></rect><path d="M4 22 H36" stroke="#1f2420" stroke-width="4" stroke-linecap="round"></path></svg>`
    : `<svg width="44" height="74" viewBox="0 0 44 72" role="img" aria-label="Tu auto"><rect x="4" y="4" width="36" height="64" rx="12" fill="#f7f7f4" stroke="#1f2420" stroke-width="3"></rect><rect x="10" y="16" width="24" height="14" rx="4" fill="#b8d4e3"></rect><rect x="10" y="44" width="24" height="10" rx="3" fill="#b8d4e3"></rect></svg>`;
  const here = `<div class="stop" style="min-height:96px"><div class="pin">${vehicleToken}</div>
      <div class="here"><span class="k">ESTÁS ACÁ</span><span class="n num">${esc(kmTxt(v.km, v.kmApprox))}</span><span class="d">${rate ? `~${fmtKm(rate * 30.44)} km por mes` : v.kmApprox ? "Dato aproximado: corregilo cuando tengas el exacto" : "Cargá km seguido y calculo tu ritmo"}</span></div></div>`;
  const pastRows = past.map(s => `<div class="stop" style="min-height:56px"><div class="pin"><div class="pin-dot" style="width:12px;height:12px;border-width:3px;opacity:.7" aria-hidden="true"></div></div>
      <button class="past" type="button" data-act="editService" data-sid="${esc(s.id)}" style="border:none;background:none;text-align:left;padding:0"><span class="k">${s.km != null ? "KM " + (s.approx ? "≈ " : "") + fmtKm(s.km) : ""}${s.date ? (s.km != null ? " · " : "") + fmtDate(s.date).toUpperCase() : ""}</span><span class="n">${esc([s.title, ...(s.taskIds || []).filter(() => !s.title).map(t => names[t])].filter(Boolean).join(", ") || "Service")}</span></button></div>`).join("");
  return `<div class="road">${stops}${fogBlock}${here}${pastRows}</div>
    <div class="roadactions"><button class="btn solid" style="flex:1" type="button" data-act="service">Registrar service</button><button class="btn" style="flex:1" type="button" data-act="trip">Planear viaje</button></div>`;
}

function renderMissions(v) {
  const sts = statusesFor(v);
  const c = counts(v), total = sts.length || 1;
  const p = progress();
  const mood = !v.km ? "none" : worst(v);
  const urgent = sts.filter(s => s.status === "bad" || s.status === "warn").sort((a, b) => etaDays(a, v) - etaDays(b, v));
  const fog = sts.filter(s => s.status === "none").sort((a, b) => b.firstPassed - a.firstPassed);
  const icon = st => st.status === "bad"
    ? `<span class="ic" style="background:#fde2df"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c4362b" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 3l10 18H2z"></path><path d="M12 10v4M12 17.5v.01"></path></svg></span>`
    : `<span class="ic" style="background:#fff1c9"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9a6200" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="13" r="8"></circle><path d="M12 9v4l3 2M9 2h6"></path></svg></span>`;
  const missions = urgent.map(st => `<div class="mission">${icon(st)}<div><div class="t">${esc(st.task.name)}</div><div class="s">${esc(dueLine(st))}${st.approx ? " (aprox.)" : ""}</div></div>
      <button class="pts" type="button" data-act="service" data-tid="${esc(st.task.id)}">Hecho +${st.status === "bad" ? 50 : 40}</button></div>`).join("");
  const det = fog.slice(0, 3).map(st => `<div class="mission"><span class="ic" style="background:#ebe7ff"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b2fd1" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M21 21l-5-5"></path></svg></span>
      <div><div class="t">Detective: ${esc(st.task.name.toLowerCase())}</div><div class="s">${st.firstPassed ? "Ya cumplió su intervalo. ¿Se hizo alguna vez?" : "Averiguá cuándo se hizo por última vez"}</div></div>
      <button class="pts" type="button" data-act="service" data-tid="${esc(st.task.id)}">+25</button></div>`).join("");
  const seg = (n, col, extra = "") => n ? `<i style="flex:${n};background:${col};${extra}"></i>` : "";
  return `<div class="pad">
    <div class="hero ${v.kind === "moto" ? "moto" : ""}">
      <div class="who">${v.kind === "moto" ? motoSvg(mood) : carSvg(mood)}
        <div style="display:grid;gap:3px"><span class="name">${esc(v.name)}</span><span class="sub num">${esc(kmTxt(v.km, v.kmApprox))} recorridos</span><span class="say">“${esc(phrase(v))}”</span></div></div>
      <div class="health"><div class="lbl"><span>Salud del plan</span><span>${c.ok + c.warn + c.bad} de ${sts.length} a la vista</span></div>
        <div class="hbar" role="img" aria-label="${c.ok} al día, ${c.warn} pronto, ${c.bad} vencidas, ${c.none} sin registro">${seg(c.ok, "#4be3a1")}${seg(c.warn, "#ffc93c")}${seg(c.bad, "#ff6b5e")}${seg(c.none, "repeating-linear-gradient(90deg, rgb(255 255 255 / .28) 0 8px, rgb(255 255 255 / .12) 8px 11px)")}</div>
        <span class="sub">${c.none ? `${c.none} en niebla: registralas y se revelan` : "Todo el plan a la vista"}</span></div>
      <div class="health"><div class="lbl"><span>Nivel ${p.level}</span><span>${p.inLevel}/100 XP</span></div><div class="xpbar"><i style="width:${p.inLevel}%"></i></div></div>
    </div>
    <span class="h2fun">Misiones activas</span>
    ${missions || `<p style="margin:0;color:var(--ink-2)">Nada urgente en ${esc(v.name)}. ¡Bien ahí!</p>`}
    ${det ? `<span class="h2fun">Para detectives${fog.length > 3 ? ` <span style="font-size:14px;color:var(--muted)">y ${fog.length - 3} más en la ruta</span>` : ""}</span>${det}` : ""}
    <span class="h2fun">Medallas</span>
    <div class="medals">${p.medals.map(md => `<div class="medal ${md.on ? "" : "locked"}"><span class="m"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${md.on ? "#1f2420" : "#7d7765"}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${md.on ? `<path d="M5 12l4 4 10-10"></path>` : `<rect x="6" y="11" width="12" height="9" rx="2"></rect><path d="M9 11V8a3 3 0 0 1 6 0v3"></path>`}</svg></span><span class="t">${esc(md.t)}</span><span class="s">${esc(md.s)}</span></div>`).join("")}</div>
    <p style="margin:0;font-size:13px;color:var(--muted)">Ganás XP registrando: 25 por tarea del plan, 10 por arreglo suelto y 5 por cada lectura de km.</p>
  </div>`;
}

function renderBook(v) {
  const id = v.id;
  const subs = [["plan", "Plan"], ["historial", "Historial"], ["datos", "Ficha"]];
  let body = "";
  if (state.sub === "plan") {
    const order = { bad: 0, warn: 1, ok: 2, none: 3 };
    const sts = statusesFor(v).sort((a, b) => order[a.status] - order[b.status] || etaDays(a, v) - etaDays(b, v));
    body = `<div class="card">${sts.map(st => `<div class="trow"><span class="st" style="background:${STATUS_COLOR[st.status]}"></span>
      <div><div class="n">${esc(st.task.name)}</div><div class="m">${esc(intervalText(st.task))}${st.last ? ` · último: ${st.last.km != null ? kmTxt(st.last.km, st.last.approx) : ""}${st.last.date ? " " + fmtDate(st.last.date) : ""}` : ""}</div>
      <div class="m"><b>${STATUS_TXT[st.status]}</b>${st.status !== "none" ? " · " + esc(dueLine(st)) : st.firstPassed ? " · ya cumplió su intervalo" : ""}</div>${st.task.note ? `<div class="m" style="color:var(--muted)">${esc(st.task.note)}</div>` : ""}</div>
      <div style="display:grid;gap:4px"><button class="btn small" type="button" data-act="service" data-tid="${esc(st.task.id)}">Hecho</button><button class="btn ghost small" type="button" data-act="editTask" data-tid="${esc(st.task.id)}">Editar</button></div></div>`).join("")}</div>
      <button class="btn" type="button" data-act="newTask">+ Agregar tarea al plan</button>`;
  } else if (state.sub === "historial") {
    const svcs = (v.services || []).slice().sort((a, b) => (b.km || 0) - (a.km || 0) || String(b.date || "").localeCompare(String(a.date || "")));
    const total = svcs.reduce((s, x) => s + (Number(x.cost) || 0), 0);
    const names = Object.fromEntries((v.tasks || []).map(t => [t.id, t.name]));
    body = svcs.length ? `<div class="card tablewrap"><table><thead><tr><th>Km · fecha</th><th>Qué se hizo</th><th class="r">Costo</th></tr></thead><tbody>
      ${svcs.map(s => `<tr><td class="num">${s.km != null ? esc(kmTxt(s.km, s.approx)) : "—"}<div style="font-size:12px;color:var(--muted)">${s.date ? fmtDate(s.date) : "sin fecha"}</div></td>
        <td>${esc([s.title, ...(s.taskIds || []).map(t => names[t] || "Tarea borrada")].filter(Boolean).join(", "))}${s.shop ? `<div style="font-size:12px;color:var(--muted)">${esc(s.shop)}</div>` : ""}${s.notes ? `<div style="font-size:12px;color:var(--muted)">${esc(s.notes)}</div>` : ""}<div><button class="btn ghost small" type="button" data-act="editService" data-sid="${esc(s.id)}" style="padding:0;min-height:28px">Editar</button></div></td>
        <td class="r num">${fmtMoney(s.cost)}</td></tr>`).join("")}
      </tbody><tfoot><tr><th colspan="2">Total gastado</th><th class="r num">${fmtMoney(total)}</th></tr></tfoot></table></div>`
      : `<p class="empty" style="padding:0">Todavía no hay services registrados.</p>`;
  } else {
    body = `<div class="card tablewrap"><table><tbody>
      <tr><th>Vehículo</th><td>${esc([v.brand, v.model].filter(Boolean).join(" ") || "—")}</td></tr><tr><th>Año</th><td>${esc(v.year || "—")}</td></tr><tr><th>Patente</th><td>${esc(v.plate || "—")}</td></tr>
      <tr><th>Km</th><td class="num">${esc(kmTxt(v.km, v.kmApprox))}</td></tr>
      <tr><th>Manual</th><td>${v.manual ? esc(v.manual.titulo) + `<div style="font-size:12px;color:var(--muted)">Preguntale al Copiloto lo que quieras del manual</div>` : "Sin cargar"}</td></tr>
      ${(v.specs || []).map(([k, x]) => `<tr><th>${esc(k)}</th><td>${esc(x)}</td></tr>`).join("")}</tbody></table></div>
      ${v.pending ? `<div class="card"><b>Pendientes</b><p style="white-space:pre-wrap;margin:0">${esc(v.pending)}</p></div>` : ""}
      <div class="row"><button class="btn" type="button" data-act="editVehicle">Editar ficha</button><button class="btn danger" type="button" data-act="deleteVehicle">Borrar vehículo</button></div>
      <div class="row">${["auto", "moto"].map(k => `<button class="btn ghost small" data-act="add" data-kind="${k}" type="button">+ Agregar ${k}</button>`).join("")}</div>`;
  }
  return `<div class="pad"><div class="subtabs" role="tablist">${subs.map(([k, l]) => `<button type="button" role="tab" data-sub="${k}" aria-selected="${state.sub === k}">${l}</button>`).join("")}</div>${body}</div>`;
}

/* ---------- Detalle de un cartel ---------- */
function dlgSign(vid, tid) {
  const v = state.vehicles[vid], t = v.tasks.find(x => x.id === tid); if (!t) return;
  const st = taskStatus(v, t);
  openDialog(`<span class="eyebrow">${esc(v.name)} · ${STATUS_TXT[st.status]}</span><h2>${esc(t.name)}</h2>
    <p style="margin:0">${esc(dueLine(st))}${st.approx ? " (sobre datos aproximados)" : ""}</p>
    <p style="margin:0;color:var(--ink-2);font-size:14px">${esc(intervalText(t))}${st.last ? ` · última vez: ${st.last.km != null ? kmTxt(st.last.km, st.last.approx) : ""}${st.last.date ? " el " + fmtDate(st.last.date) : ""}` : ""}</p>
    ${t.note ? `<p style="margin:0;color:var(--muted);font-size:13px">${esc(t.note)}</p>` : ""}
    <div class="row spread"><button class="btn ghost" value="edit" formnovalidate>Editar tarea</button><div class="row"><button class="btn" value="cancel" formnovalidate>Cerrar</button><button class="btn solid" value="done">Registrar hecho</button></div></div>`, fd => {
      if (fd._action === "edit") { setTimeout(() => dlgTask(vid, tid)); return; }
      if (fd._action === "done") { setTimeout(() => dlgService(vid, tid)); return; }
    });
}

/* ---------- Tablero: cargar km ---------- */
const LAMP_ICON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><path d="M12 8v5M12 16v.01"></path></svg>`;
function gaugeInfo(v) {
  const sts = statusesFor(v).filter(s => s.kmLeft != null && s.task.km).sort((a, b) => a.kmLeft - b.kmLeft);
  const st = sts[0];
  if (!st) return { frac: 0, big: "—", cap: "Sin services por km registrados todavía" };
  return { frac: Math.max(0, Math.min(1, 1 - st.kmLeft / st.task.km)), big: st.kmLeft <= 0 ? "¡YA!" : fmtKm(st.kmLeft) + " km", cap: (st.kmLeft <= 0 ? "Vencido: " : "Para: ") + st.task.name };
}
function lampsHTML(v, lit) {
  const sts = statusesFor(v).filter(s => s.status === "bad" || s.status === "warn").sort((a, b) => etaDays(a, v) - etaDays(b, v)).slice(0, 5);
  const fogN = statusesFor(v).filter(s => s.status === "none").length;
  const items = sts.map(s => ({ cls: s.status, t: s.task.name.length > 22 ? s.task.name.slice(0, 20) + "…" : s.task.name }));
  if (!items.length) items.push({ cls: "ok", t: "Todo en orden" });
  if (fogN) items.push({ cls: "fog", t: `${fogN} sin dato` });
  return items.map(x => `<div class="lamp ${x.cls} ${lit ? "on" : ""}">${LAMP_ICON}<span>${esc(x.t)}</span></div>`).join("");
}
function dlgKm(vid) {
  const v = state.vehicles[vid]; if (!v) return;
  const g = gaugeInfo(v);
  openDialog(`<span class="eyebrow">Tablero · ${esc(v.name)}</span>
    <div class="gauge">
      <svg viewBox="0 0 300 170" role="img" aria-label="Medidor hasta el próximo service por km">
        <path d="M30 150 A120 120 0 0 1 270 150" fill="none" stroke="#263035" stroke-width="16" stroke-linecap="round"></path>
        <path d="M30 150 A120 120 0 0 1 210 46" fill="none" stroke="#3ccf91" stroke-width="16" stroke-linecap="round" opacity=".85"></path>
        <path d="M210 46 A120 120 0 0 1 255 95" fill="none" stroke="#ffb547" stroke-width="16" opacity=".85"></path>
        <path d="M255 95 A120 120 0 0 1 270 150" fill="none" stroke="#ff6b5e" stroke-width="16" stroke-linecap="round" opacity=".85"></path>
        <g id="needle"><line x1="150" y1="150" x2="150" y2="48" stroke="#e9eef0" stroke-width="5" stroke-linecap="round"></line></g>
        <circle cx="150" cy="150" r="11" fill="#e9eef0"></circle><circle cx="150" cy="150" r="4" fill="#0e1113"></circle>
      </svg>
      <span class="big" id="gbig">${esc(g.big)}</span><span class="cap" id="gcap">${esc(g.cap)}</span>
    </div>
    <div class="odo"><label for="f-km" class="eyebrow">ODO</label><input id="f-km" name="km" inputmode="numeric" required value="${v.km || ""}" autocomplete="off"></div>
    <label class="inline"><input type="checkbox" name="approx" ${v.kmApprox ? "checked" : ""}> Es un valor aproximado</label>
    <div class="lamps" id="lamps">${lampsHTML(v, false)}</div>
    <p class="reward" id="reward" hidden></p>
    <div class="row" id="dashBtns" style="justify-content:center;gap:16px"><button class="btn" value="cancel" formnovalidate>Cerrar</button><button class="btn go" value="ok">ARRANCAR</button></div>`, fd => {
      const km = num(fd.km);
      if (km == null || km < 0) return "Escribí los km como número, por ejemplo 45200.";
      const before = v.km || 0;
      setKm(vid, km, todayISO(), !!fd.approx); save(vid);
      const g2 = gaugeInfo(state.vehicles[vid]);
      const needle = $("#needle");
      needle.style.transform = "rotate(90deg)";
      setTimeout(() => { needle.style.transform = `rotate(${-90 + g2.frac * 180}deg)`; $("#gbig").textContent = g2.big; $("#gcap").textContent = g2.cap; }, 650);
      $("#lamps").innerHTML = lampsHTML(state.vehicles[vid], false);
      [...$("#lamps").children].forEach((el, i) => setTimeout(() => el.classList.add("on"), 900 + i * 180));
      const r = $("#reward"); r.hidden = false; r.textContent = `+5 XP · ${km >= before ? "+" + fmtKm(km - before) + " km rodados" : "km corregidos"}`;
      $("#dashBtns").innerHTML = `<button class="btn solid" value="cancel" formnovalidate style="background:#e9eef0;color:#0e1113">Listo</button>`;
      return "keep";
    }, "dash");
  requestAnimationFrame(() => { const n = $("#needle"); if (n) n.style.transform = `rotate(${-90 + g.frac * 180}deg)`; });
}

/* ---------- Eventos ---------- */
document.addEventListener("click", e => {
  const pick = e.target.closest("[data-vid-pick]");
  if (pick) { state.vid = pick.dataset.vidPick; state.fogOpen = false; render(); return; }
  const view = e.target.closest("[data-view]");
  if (view) { state.view = view.dataset.view; render(); window.scrollTo(0, 0); return; }
  const sub = e.target.closest("[data-sub]");
  if (sub) { state.sub = sub.dataset.sub; render(); return; }
  const a = e.target.closest("[data-act]");
  if (!a) return;
  const act = a.dataset.act, vid = state.vid, { tid, sid, kind } = a.dataset;
  if (act === "fog") { state.fogOpen = !state.fogOpen; render(); return; }
  if (act === "sign") { dlgSign(vid, tid); return; }
  if (act === "trip") { state.view = "copiloto"; render(); const v = cur(); $("#chatInput").value = `Me voy de viaje con ${v ? "la " + v.name : "el vehículo"}, unos ___ km. ¿Qué reviso antes?`; $("#chatInput").focus(); return; }
  if (state.readOnly) { setBanner("No tenés permiso para guardar cambios en esta página."); return; }
  if (!vid && act !== "add") return;
  ({
    add: () => { addVehicle(kind); },
    km: () => dlgKm(vid),
    service: () => dlgService(vid, tid),
    editService: () => dlgService(vid, null, sid),
    editTask: () => dlgTask(vid, tid),
    newTask: () => dlgTask(vid),
    editVehicle: () => dlgVehicle(vid),
    deleteVehicle: () => dlgDelete(vid)
  })[act]?.();
});

/* ---------- Asistente (agente) ---------- */
const msgsEl = $("#msgs");
let chatHistory = [];
let sample = null;
const HINTS = ["¿Qué le toca a cada vehículo?", "¿Qué presión llevan las cubiertas del Cronos?", "¿Qué significa el testigo naranja con un motor?", "Me voy de viaje 1.500 km con la moto, ¿qué reviso antes?"];
function addMsg(role, text) { const d = document.createElement("div"); d.className = "msg " + role; d.textContent = text; msgsEl.appendChild(d); msgsEl.scrollTop = msgsEl.scrollHeight; return d; }
function resetChat() {
  chatHistory = []; msgsEl.innerHTML = "";
  addMsg("bot", "Hola Martín. Contame los km, lo que le hiciste a cada vehículo o preguntame qué toca, y yo actualizo el plan.");
}
$("#hints").innerHTML = HINTS.map(h => `<button type="button">${esc(h)}</button>`).join("");
$("#hints").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { $("#chatInput").value = b.textContent; $("#chatInput").focus(); } });
$("#chatReset").addEventListener("click", resetChat);
$("#chatInput").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#chatForm").requestSubmit(); } });

function snapshotForAgent() {
  return vehicleIds().map(id => {
    const v = state.vehicles[id];
    return {
      id, tipo: v.kind, nombre: v.name, marca: v.brand, modelo: v.model, anio: v.year, patente: v.plate, km: v.km, km_aproximado: !!v.kmApprox, manual: v.manual ? v.manual.titulo : "sin manual cargado", ficha: Object.fromEntries(v.specs || []), pendientes: v.pending || undefined,
      km_por_mes: kmRate(v) ? Math.round(kmRate(v) * 30.44) : null,
      tareas: statusesFor(v).map(s => ({ id: s.task.id, nombre: s.task.name, cada_km: s.task.km, cada_meses: s.task.months, nota: s.task.note || undefined, vence_el_fijo: s.task.dueDate, estado: STATUS_TXT[s.status] + (s.firstPassed ? " (intervalo cumplido sin registro)" : ""), ultimo: s.last ? { fecha: s.last.date, km: s.last.km, aproximado: !!s.last.approx } : null, vence_en_km_fijo: s.task.dueKm, proximo_km: s.nextKm, proxima_fecha: s.nextDate, km_restantes: s.kmLeft, dias_restantes: s.daysLeft, fecha_estimada_por_km: s.estDate })),
      ultimos_services: (v.services || []).slice().sort((a, b) => (b.km || 0) - (a.km || 0)).slice(0, 8).map(s => ({ fecha: s.date, km: s.km, aproximado: !!s.approx, descripcion: s.title || undefined, trabajos: (s.taskIds || []).map(t => (v.tasks.find(x => x.id === t) || {}).name || "?"), costo: s.cost, taller: s.shop, notas: s.notes })),
      gasto_total: (v.services || []).reduce((a, s) => a + (Number(s.cost) || 0), 0)
    };
  });
}
function findVehicle(ref) {
  const ids = vehicleIds(); if (!ref) return null;
  const r = String(ref).toLowerCase();
  return ids.find(id => id === r) || ids.find(id => state.vehicles[id].kind === r) || ids.find(id => (state.vehicles[id].name || "").toLowerCase() === r) || null;
}
function findTasks(v, refs) {
  const out = [], missing = [];
  for (const ref of refs || []) {
    const r = String(ref).toLowerCase();
    const t = v.tasks.find(x => x.id === ref) || v.tasks.find(x => x.name.toLowerCase() === r) || v.tasks.find(x => x.name.toLowerCase().includes(r));
    t ? out.push(t.id) : missing.push(ref);
  }
  return { ids: out, missing };
}
/* ---------- Manuales (archivos de la propia página) ---------- */
const manualCache = {};
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const STOP = new Set("que cual cuales como cuando donde para por con sin del las los una uno unos unas este esta estos estas cada hay tiene tengo debo puedo hace hacer sobre entre desde hasta mas menos muy pero porque the and auto moto manual".split(" "));
async function loadManual(v) {
  const file = v && v.manual && v.manual.file;
  if (!file) throw new Error(`No hay manual cargado para ${v ? v.name : "ese vehículo"}.`);
  if (!manualCache[file]) manualCache[file] = fetch(file).then(r => { if (!r.ok) throw new Error("No pude abrir el manual (" + r.status + ")"); return r.json(); }).then(m => { m.partes.forEach(p => { p.n = norm(p.t); }); return m; });
  try { return await manualCache[file]; } catch (e) { delete manualCache[file]; throw e; }
}
async function searchManual(v, query, max = 5) {
  const m = await loadManual(v);
  const terms = [...new Set(norm(query).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOP.has(w)))];
  if (!terms.length) throw new Error("Decime qué buscar con alguna palabra concreta.");
  const N = m.partes.length;
  const df = Object.fromEntries(terms.map(w => [w, m.partes.filter(p => p.n.includes(w.slice(0, Math.max(4, w.length - 2)))).length || 1]));
  const scored = m.partes.map((p, i) => {
    let sc = 0, hit = 0;
    for (const w of terms) { const stem = w.slice(0, Math.max(4, w.length - 2)); const c = p.n.split(stem).length - 1; if (c) { hit++; sc += (1 + Math.log(c)) * Math.log(1 + N / df[w]); } }
    if (p.n.includes(norm(query).trim())) sc += 5;
    return { i, sc: sc * (hit / terms.length) };
  }).filter(x => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, max);
  return { manual: m.titulo, resultados: scored.map(x => ({ pagina: m.partes[x.i].p, texto: m.partes[x.i].t.slice(0, 1800) })) };
}
async function readManualPages(v, pages) {
  const m = await loadManual(v);
  const want = new Set((pages || []).map(p => String(p).toUpperCase().replace(/\s+/g, "")));
  const out = m.partes.filter(p => want.has(p.p.toUpperCase())).map(p => ({ pagina: p.p, texto: p.t.slice(0, 3500) }));
  if (!out.length) throw new Error("No encontré esas páginas. Las páginas tienen formato como G-16.");
  return { manual: m.titulo, paginas: out.slice(0, 6) };
}

function guardWrite() { if (state.readOnly) throw new Error("La app está en modo solo lectura."); }
const TOOLS = [
  { name: "leer_garaje", description: "Devuelve los vehículos, su km, el plan con el estado de cada tarea (vencido, pronto, al día, sin registro) y los últimos services.", inputSchema: { type: "object", properties: {} }, execute: () => ({ hoy: todayISO(), vehiculos: snapshotForAgent() }) },
  { name: "buscar_manual", description: "Busca en el manual del fabricante de un vehículo y devuelve los fragmentos más relevantes con su número de página. Usalo para cualquier pregunta técnica o de uso (presiones, capacidades, testigos, fusibles, mantenimiento, procedimientos). Si no encontrás, probá otra vez con sinónimos.", inputSchema: { type: "object", properties: { vehiculo: { type: "string" }, consulta: { type: "string", description: "palabras clave en español, ej. 'presión neumáticos'" } }, required: ["vehiculo", "consulta"] },
    execute: async ({ vehiculo, consulta }) => { const id = findVehicle(vehiculo); if (!id) throw new Error("No encontré ese vehículo"); return searchManual(state.vehicles[id], consulta); } },
  { name: "leer_paginas_manual", description: "Lee páginas puntuales del manual, por su número (ej. ['G-16','G-17']). Útil para seguir leyendo alrededor de un resultado de buscar_manual.", inputSchema: { type: "object", properties: { vehiculo: { type: "string" }, paginas: { type: "array", items: { type: "string" } } }, required: ["vehiculo", "paginas"] },
    execute: async ({ vehiculo, paginas }) => { const id = findVehicle(vehiculo); if (!id) throw new Error("No encontré ese vehículo"); return readManualPages(state.vehicles[id], paginas); } },
  { name: "actualizar_km", description: "Registra una lectura de odómetro.", inputSchema: { type: "object", properties: { vehiculo: { type: "string", description: "id del vehículo (ej. auto, moto)" }, km: { type: "number" }, fecha: { type: "string", description: "YYYY-MM-DD; hoy si se omite" }, aproximado: { type: "boolean", description: "true si Martín dice que es un valor aproximado" } }, required: ["vehiculo", "km"] },
    execute: ({ vehiculo, km, fecha, aproximado }) => { guardWrite(); const id = findVehicle(vehiculo); if (!id) throw new Error("No encontré ese vehículo"); setKm(id, Number(km), fecha || todayISO(), !!aproximado); save(id); return { ok: true, vehiculo: id, km: state.vehicles[id].km }; } },
  { name: "registrar_service", description: "Registra trabajos hechos. 'tareas' son nombres o ids de tareas del plan (puede ir vacío). 'descripcion' es texto libre para arreglos que no son del plan (ej. cambio de espejo, neumáticos nuevos).", inputSchema: { type: "object", properties: { vehiculo: { type: "string" }, tareas: { type: "array", items: { type: "string" } }, descripcion: { type: "string" }, fecha: { type: "string" }, km: { type: "number" }, costo: { type: "number" }, taller: { type: "string" }, notas: { type: "string" }, aproximado: { type: "boolean" } }, required: ["vehiculo"] },
    execute: ({ vehiculo, tareas, descripcion, fecha, km, costo, taller, notas, aproximado }) => {
      guardWrite(); const id = findVehicle(vehiculo); if (!id) throw new Error("No encontré ese vehículo"); const v = state.vehicles[id];
      const { ids, missing } = findTasks(v, tareas); if (!ids.length && !descripcion) throw new Error("Ninguna tarea coincide: " + missing.join(", ") + ". Usá 'descripcion' o creá la tarea.");
      logService(id, { id: uid(), date: fecha || todayISO(), km: km ?? v.km ?? null, taskIds: ids, title: descripcion || "", cost: costo ?? null, shop: taller || "", notes: notas || "", ...(aproximado ? { approx: true } : {}) }); save(id);
      return { ok: true, registradas: ids.map(t => v.tasks.find(x => x.id === t).name), no_encontradas: missing };
    } },
  { name: "guardar_tarea", description: "Crea o modifica una tarea del plan. Si 'tarea_id' se omite y no existe una con ese nombre, la crea.", inputSchema: { type: "object", properties: { vehiculo: { type: "string" }, tarea_id: { type: "string" }, nombre: { type: "string" }, cada_km: { type: ["number", "null"] }, cada_meses: { type: ["number", "null"] }, vence_el: { type: ["string", "null"], description: "fecha fija YYYY-MM-DD, ej. VTV" }, vence_a_los_km: { type: ["number", "null"], description: "km fijo planificado, ej. cambio de kit a los 20000" }, nota: { type: "string" } }, required: ["vehiculo", "nombre"] },
    execute: ({ vehiculo, tarea_id, nombre, cada_km, cada_meses, vence_el, vence_a_los_km, nota }) => {
      guardWrite(); const id = findVehicle(vehiculo); if (!id) throw new Error("No encontré ese vehículo"); const v = state.vehicles[id];
      let t = v.tasks.find(x => x.id === tarea_id) || v.tasks.find(x => x.name.toLowerCase() === String(nombre).toLowerCase());
      if (!t) { t = { id: uid(), name: nombre, km: null, months: null, note: "" }; v.tasks.push(t); }
      t.name = nombre; if (cada_km !== undefined) t.km = cada_km || null; if (cada_meses !== undefined) t.months = cada_meses || null; if (nota !== undefined) t.note = nota; if (vence_el !== undefined) { if (vence_el) t.dueDate = vence_el; else delete t.dueDate; } if (vence_a_los_km !== undefined) { if (vence_a_los_km) t.dueKm = vence_a_los_km; else delete t.dueKm; }
      save(id); return { ok: true, tarea: t };
    } },
  { name: "quitar_tarea", description: "Quita una tarea del plan (el historial se conserva).", inputSchema: { type: "object", properties: { vehiculo: { type: "string" }, tarea: { type: "string" } }, required: ["vehiculo", "tarea"] },
    execute: ({ vehiculo, tarea }) => { guardWrite(); const id = findVehicle(vehiculo); if (!id) throw new Error("No encontré ese vehículo"); const v = state.vehicles[id]; const { ids } = findTasks(v, [tarea]); if (!ids.length) throw new Error("No encontré esa tarea"); v.tasks = v.tasks.filter(x => x.id !== ids[0]); save(id); return { ok: true }; } },
  { name: "editar_vehiculo", description: "Cambia nombre, marca, modelo, año, patente, la ficha (datos como motor, aceite, neumáticos, batería, taller, seguro) o los pendientes. 'ficha' se fusiona con la existente; un valor vacío borra ese dato.", inputSchema: { type: "object", properties: { vehiculo: { type: "string" }, nombre: { type: "string" }, marca: { type: "string" }, modelo: { type: "string" }, anio: { type: "number" }, patente: { type: "string" }, ficha: { type: "object", additionalProperties: { type: "string" } }, pendientes: { type: "string" } }, required: ["vehiculo"] },
    execute: (a) => { guardWrite(); const id = findVehicle(a.vehiculo); if (!id) throw new Error("No encontré ese vehículo"); const v = state.vehicles[id]; if (a.nombre) v.name = a.nombre; if (a.marca !== undefined) v.brand = a.marca; if (a.modelo !== undefined) v.model = a.modelo; if (a.anio !== undefined) v.year = a.anio; if (a.patente !== undefined) v.plate = String(a.patente).toUpperCase();
      if (a.ficha) { const m = new Map(v.specs || []); for (const [k, x] of Object.entries(a.ficha)) { if (x) m.set(k, String(x)); else m.delete(k); } v.specs = [...m.entries()]; }
      if (a.pendientes !== undefined) v.pending = a.pendientes; save(id); return { ok: true }; } },
  { name: "agregar_vehiculo", description: "Crea un vehículo nuevo con el plan típico de su tipo.", inputSchema: { type: "object", properties: { tipo: { type: "string", enum: ["auto", "moto"] } }, required: ["tipo"] },
    execute: ({ tipo }) => { guardWrite(); const id = addVehicle(tipo); return { ok: true, id }; } }
];
const SYSTEM = `Sos el asistente de mantenimiento de los vehículos de Martín. Hoy tiene un Fiat Cronos 2018 y una Royal Enfield Meteor 350, pero los datos de cada vehículo salen siempre de leer_garaje, no de este texto. Hablás en español rioplatense, breve y concreto, como un mecánico de confianza que lleva la libreta de service.
Qué hacés:
- Antes de responder sobre el estado o de modificar algo, llamá a leer_garaje.
- Cuando Martín te cuenta km, trabajos hechos, costos o cambios en el plan, guardalo con las herramientas y confirmá en una línea qué guardaste.
- Si un trabajo que te cuenta no está en el plan, agregalo con guardar_tarea con un intervalo razonable para ese vehículo y avisale qué intervalo pusiste.
- Para "qué toca", ordená por urgencia: primero vencido, después pronto (30 días o 10% del intervalo). Indicá km o fecha que faltan.
- Los planes del Cronos (manual 2018, motor 1.8 16V) y de la Meteor (manual del propietario) ya están cargados con la fuente en la nota de cada tarea. Para otro vehículo, sugerí ajustar intervalos al manual del fabricante y aclará que es una referencia general.
- Para preguntas sobre cómo funciona algo, especificaciones, testigos, fusibles, capacidades o mantenimiento, buscá en el manual con buscar_manual (y leer_paginas_manual para ampliar). Lo importante es la respuesta concreta a lo que pregunta Martín (valores, pasos, qué hacer), no la cita: respondé directo con lo que dice el manual y, como mucho, agregá la página entre paréntesis al final. Si la primera búsqueda no alcanza, buscá de nuevo con otras palabras o leé las páginas vecinas antes de responder. Si el manual no lo dice o el vehículo no tiene manual cargado, decilo y aclarás que lo que sigue es conocimiento general.
- Si Martín te da datos de la ficha (batería, taller, seguro, color, km de compra), guardalos con editar_vehiculo.
- Si una tarea figura "intervalo cumplido sin registro", recordale que puede haberse hecho antes y no estar anotada.
- Antes de un viaje, sugerí una revisión previa (presión y estado de neumáticos, aceite, refrigerante, frenos, luces; en moto también cadena) además de lo que vence durante el viaje según los km.
- Si falta un dato imprescindible (qué vehículo, qué km), preguntalo en una línea. Las fechas van en formato YYYY-MM-DD; hoy es ${todayISO()}.
- Si Martín dice que un dato es aproximado ("más o menos", "unos"), guardalo con aproximado: true. Si falta la fecha de un service, podés registrarlo sin fecha.
- No inventes services que Martín no contó. No uses markdown con tablas; usá frases cortas o listas simples.`;

$("#chatForm").addEventListener("submit", async e => {
  e.preventDefault();
  const input = $("#chatInput"); const text = input.value.trim(); if (!text) return;
  if (!sample) { addMsg("bot", "El asistente no está disponible en esta vista. Podés usar los botones de la app."); return; }
  input.value = ""; addMsg("user", text);
  chatHistory.push({ role: "user", content: text });
  const send = $("#chatSend"); send.disabled = true;
  const bubble = addMsg("bot", "Pensando…");
  try {
    const msgs = [{ role: "user", content: SYSTEM + "\n\n---\nMensaje de Martín:\n" + chatHistory[0].content }, ...chatHistory.slice(1)];
    const tools = TOOLS.map(t => ({ ...t, execute: async (inp) => { const r = await t.execute(inp || {}); const lbl = { buscar_manual: "Busqué en el manual", leer_paginas_manual: "Leí el manual", leer_garaje: "Leí el garage", actualizar_km: "Actualicé los km", registrar_service: "Registré el service", guardar_tarea: "Actualicé el plan", quitar_tarea: "Quité una tarea", editar_vehiculo: "Actualicé los datos", agregar_vehiculo: "Agregué un vehículo" }[t.name]; const n = document.createElement("div"); n.className = "msg tool"; n.textContent = "✓ " + lbl; msgsEl.insertBefore(n, bubble); return r; } }));
    const res = await sample(msgs, { tools, cache: false, onText: ({ text }) => { bubble.textContent = text || "Pensando…"; msgsEl.scrollTop = msgsEl.scrollHeight; } });
    bubble.textContent = res.text || "Listo.";
    chatHistory.push({ role: "assistant", content: res.text || "Listo." });
  } catch (err) {
    chatHistory.pop();
    if (err && err.code === "not_granted") { bubble.textContent = "El asistente no tiene permiso en esta vista."; }
    else if (err && err.code === "rate_limited") { bubble.textContent = "Muchas consultas seguidas. Esperá un minuto y probá de nuevo."; }
    else bubble.textContent = "No pude responder: " + (err && err.message ? err.message : "error desconocido") + ". Probá de nuevo.";
  } finally { send.disabled = false; }
});


/* ---------- Inicio ---------- */
resetChat();
render();
let loadTimer = null;
(async () => {
  const claude = window.claude;
  const [db, smp] = await Promise.all([
    claude && claude.use ? claude.use("db").catch(() => null) : null,
    claude && claude.use ? claude.use("sample").catch(() => null) : null
  ]);
  sample = smp;
  if (!sample) { $("#chatInput").disabled = true; $("#chatSend").disabled = true; addMsg("bot", "El copiloto no está disponible ahora. Mientras tanto podés usar los botones."); }
  if (!db) {
    state.loaded = true;
    setBanner("No pude conectar con tus datos: los cambios no se guardan. Recargá la app.");
    ["auto", "moto"].forEach(k => { state.vehicles[k] = { id: k, ...newVehicle(k) }; });
    render(); return;
  }
  state.db = db;
  col = db.collection("garage");
  loadTimer = setTimeout(() => { setBanner("No pude conectar con tus datos todavía. Lo que ves puede estar desactualizado."); if (!state.loaded) { state.loaded = true; render(); } }, 10000);
  col.onSnapshot(snap => {
    const next = {};
    snap.docs.forEach(d => { if (d.exists) { const v = JSON.parse(JSON.stringify(d.data())); v.id = d.id; v.tasks = v.tasks || []; v.services = v.services || []; v.kmLog = v.kmLog || []; next[d.id] = v; } });
    state.vehicles = next;
    state.loaded = true;
    if (!snap.metadata.fromCache) { clearTimeout(loadTimer); setBanner(""); }
    if (!dlg.open) render(); else renderHeader(cur());
  }, err => {
    clearTimeout(loadTimer); state.loaded = true;
    setBanner(err && err.code === "revoked" ? "Esta vista ya no tiene acceso a los datos." : "Se cortó la conexión con tus datos. Recargá la página para reconectar.");
    render();
  });
})();
dlg.addEventListener("close", () => { dlg.className = ""; render(); });
})();



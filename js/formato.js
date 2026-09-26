// Normalización, validación y armado de la nómina BancoEstado.
// Funciones puras: no tocan el DOM ni Firestore, así se prueban en Node
// contra el panel de referencia (tests/formato.test.mjs).
// La lógica es la misma de referencia/panel_actual_claude.html.

import { M_BANCO, M_FORMA, M_SECTOR, M_TIPO, NC, DIAS } from "./catalogos.js";

// ---------- normalizadores ----------
export const S = v => v == null ? "" : String(v).trim();
export function dvOf(body) { let s = 0, m = 2; for (let i = body.length - 1; i >= 0; i--) { s += (+body[i]) * m; m = m === 7 ? 2 : m + 1 } const r = 11 - s % 11; return r === 11 ? "0" : r === 10 ? "K" : String(r) }
export function normRut(v) { return S(v).toUpperCase().replace(/[^0-9K]/g, "") }
export function rutOk(r) { return /^\d{6,9}[0-9K]$/.test(r) && dvOf(r.slice(0, -1)) === r.slice(-1) }
export function fmtRut(r) { if (!r || r.length < 2) return r; const b = r.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, "."); return b + "-" + r.slice(-1) }
export function cleanName(v) { return S(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/Ñ/g, "N").replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim() }
export const normFuente = v => cleanName(v).slice(0, 30);
export function pad(v, n) { const d = S(v).replace(/\D/g, ""); return d ? d.padStart(n, "0") : "" }
export function normCuenta(v) { if (typeof v === "number") v = Math.round(v).toString(); return S(v).toUpperCase().replace(/[A-Z]/g, "0").replace(/\D/g, "") }
export function parseMonto(v) {
  if (typeof v === "number") return isFinite(v) ? Math.round(v) : NaN;
  let s = S(v).replace(/[$\s]/g, ""); if (!s) return NaN;
  s = s.replace(/,\d{1,2}$/, "").replace(/[.,]/g, "");
  return /^-?\d+$/.test(s) ? parseInt(s, 10) : NaN;
}
// DC opcional (ej. "DC 54"): texto libre, sin espacios repetidos, máx. 30.
export const normDc = v => S(typeof v === "number" ? Math.round(v) : v).replace(/\s+/g, " ").slice(0, 30);
export function validDate(d, m, y) { const t = new Date(Date.UTC(y, m - 1, d)); return y > 1990 && y < 2100 && t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d }
export function two(n) { return String(n).padStart(2, "0") }
export function parseFecha(v) { // → DDMMAAAA o ""
  if (v instanceof Date && !isNaN(v)) return two(v.getDate()) + two(v.getMonth() + 1) + v.getFullYear();
  if (typeof v === "number" && v > 20000 && v < 80000) { const t = new Date(Math.round((v - 25569) * 864e5)); return two(t.getUTCDate()) + two(t.getUTCMonth() + 1) + t.getUTCFullYear() }
  let s = S(v); if (!s) return "";
  let m;
  if (/^\d{8}$/.test(s)) {
    const a = [+s.slice(0, 2), +s.slice(2, 4), +s.slice(4)];
    if (validDate(a[0], a[1], a[2])) return s;
    const b = [+s.slice(6), +s.slice(4, 6), +s.slice(0, 4)];
    if (validDate(b[0], b[1], b[2])) return two(b[0]) + two(b[1]) + b[2];
    return "";
  }
  if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) { const [, y, mo, d] = m; return validDate(+d, +mo, +y) ? two(d) + two(mo) + y : "" }
  if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/))) { let [, d, mo, y] = m; if (y.length === 2) y = "20" + y; return validDate(+d, +mo, +y) ? two(d) + two(mo) + y : "" }
  return "";
}
export function money(n) { return "$" + Math.round(n).toLocaleString("es-CL") }
export function fmtFecha(f) { return f && f.length === 8 ? f.slice(0, 2) + "/" + f.slice(2, 4) + "/" + f.slice(4) : f }

// ---------- fechas del calendario ----------
export function today(d = new Date()) { return d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()) }
export function todayISO(d = new Date()) { return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()) }
export function fmtISO(s) { if (!s) return ""; const [y, m, d] = s.slice(0, 10).split("-"); return d + "/" + m + "/" + y }
export function isoLocal(ts) { const d = new Date(ts); return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()) }
// Resultado del banco: 14:00 del día hábil siguiente a la carga.
// Salta sábados, domingos y los feriados (fechas ISO) de pago_config/general.
export function resultDue(ymd, feriados = []) {
  const fer = new Set(feriados);
  const [y, m, d] = ymd.split("-").map(Number); const t = new Date(y, m - 1, d, 14, 0, 0);
  do { t.setDate(t.getDate() + 1) } while (t.getDay() === 0 || t.getDay() === 6 || fer.has(todayISO(t)));
  return t;
}
// Día hábil siguiente (ISO), saltando fines de semana y feriados.
export function diaHabilSiguiente(ymd, feriados = []) { return todayISO(resultDue(ymd, feriados)) }
// ¿Es día hábil? (no sábado, domingo ni feriado)
export function esHabil(ymd, feriados = []) { const [y, m, d] = ymd.split("-").map(Number); const t = new Date(y, m - 1, d); return t.getDay() !== 0 && t.getDay() !== 6 && !feriados.includes(ymd) }
// Resultado del banco: 14:00 del día de pago de la nómina (si cae en día no
// hábil, del hábil siguiente). Las nóminas sin fecha de pago usan la regla
// anterior: 14:00 del día hábil siguiente a la carga.
export function resultadoDesde(n, feriados = []) {
  if (!n.fechaPago) return resultDue(n.fechaCarga, feriados);
  const [y, m, d] = n.fechaPago.split("-").map(Number); const t = new Date(y, m - 1, d, 14, 0, 0);
  while (!esHabil(todayISO(t), feriados)) t.setDate(t.getDate() + 1);
  return t;
}
// Nombre para mostrar a partir del correo: juana.perez@… → Juana Perez.
export const nombreDe = email => S(email).split("@")[0].split(/[._-]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
export function fmtDue(t) { return DIAS[t.getDay()] + " " + two(t.getDate()) + "/" + two(t.getMonth() + 1) + " 14:00" }

// ---------- validación ----------
export function checkProv(p, emailDefecto = "") {
  const e = [], w = [];
  const rut = normRut(p.rut);
  if (!rut) e.push("falta RUT"); else if (!rutOk(rut)) e.push("RUT " + rut + " con dígito verificador inválido");
  if (rut.length > 10) e.push("RUT supera 10 caracteres");
  const nombre = cleanName(p.nombre);
  if (!nombre) e.push("falta razón social");
  if (nombre.length > 60) e.push("razón social supera 60 caracteres");
  if (/\d/.test(nombre)) w.push("la razón social contiene números; el instructivo del banco pide solo letras");
  const email = S(p.email) || S(emailDefecto);
  if (email && (email.length > 40 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) e.push("email inválido o de más de 40 caracteres");
  const banco = pad(p.banco, 3);
  if (!M_BANCO[banco]) e.push("código de banco " + (banco || "vacío") + " no está en la tabla");
  const forma = pad(p.forma, 2);
  if (!M_FORMA[forma]) e.push("forma de pago " + (forma || "vacía") + " no válida (01 o 02)");
  if (forma === "02" && banco !== "012") e.push("forma de pago 02 (cuenta de ahorro) solo sirve con BancoEstado");
  const cuenta = normCuenta(p.cuenta);
  if (!cuenta) e.push("falta número de cuenta");
  if (cuenta.length > 17) e.push("número de cuenta supera 17 dígitos");
  if (banco === "012" && rut && cuenta === rut.replace("K", "0")) w.push("la cuenta parece ser el RUT completo; una Cuenta RUT va sin dígito verificador");
  const sector = pad(p.sector, 2);
  if (!M_SECTOR[sector]) e.push("sector financiero " + (sector || "vacío") + " no válido");
  return { e, w, out: { rut, nombre, email, banco, forma, cuenta, sector } };
}
export function checkDoc(d) {
  const e = [], w = [];
  const rut = normRut(d.rut);
  const fecha = d.fecha;
  if (!fecha) e.push("fecha inválida");
  const monto = d.monto;
  if (!(monto > 0)) e.push("monto debe ser mayor a cero");
  else if (String(monto).length > 10) e.push("monto del documento supera 10 dígitos");
  const ndoc = S(d.ndoc);
  if (!/^\d{1,10}$/.test(ndoc)) e.push("N° de documento debe tener solo números (máx. 10)");
  const tipo = pad(d.tipo, 2);
  if (!M_TIPO[tipo]) e.push("tipo de documento " + (tipo || "vacío") + " no está en la tabla");
  return { e, w, out: { rut, fecha, monto, ndoc, tipo } };
}

// Documentos que ya están en una nómina activa (no anulada) y no rechazados.
// Clave rut|tipo|ndoc → "N" o "N (pagado)".
export function activeIndex(nominas) {
  const m = {};
  nominas.forEach(n => { if (n.estado === "anulada") return; n.pagos.forEach(p => { if (p.estado === "rechazado") return; p.docs.forEach(d => { m[p.rut + "|" + d.tipo + "|" + d.ndoc] = n.num + (p.estado === "pagado" ? " (pagado)" : "") }) }) });
  return m;
}

// ---------- construcción de la nómina de una fuente ----------
// ctx = { docs, maestro, nominas, group, email }
export function build(fuente, ctx) {
  const { docs, maestro, nominas, group = true, email = "" } = ctx;
  const issues = [], groups = new Map(); let seq = 0;
  const seen = new Set(), provChecked = {}, ids = [];
  const list = docs.filter(d => d.sel && d.fuente === fuente);
  const act = activeIndex(nominas);
  list.forEach(d => {
    ids.push(d.id);
    const dc = checkDoc(d); const where = `Doc ${S(d.ndoc) || "s/n"} (${fmtRut(dc.out.rut) || "sin RUT"})`;
    dc.e.forEach(m => issues.push({ lvl: "error", where, msg: m }));
    dc.w.forEach(m => issues.push({ lvl: "warn", where, msg: m }));
    const dupKey = dc.out.rut + "|" + dc.out.tipo + "|" + dc.out.ndoc;
    if (seen.has(dupKey)) issues.push({ lvl: "warn", where, msg: "documento repetido en esta nómina" });
    seen.add(dupKey);
    if (act[dupKey]) issues.push({ lvl: "error", where, msg: /pagado/.test(act[dupKey]) ? "este documento ya fue pagado en la nómina N° " + act[dupKey].replace(" (pagado)", "") + ". Quítalo de pendientes." : "este documento ya está en la nómina N° " + act[dupKey] + ", aún sin resultado. Quítalo de pendientes o anula esa nómina si no se cargó." });
    const p = maestro[dc.out.rut];
    if (!p) { issues.push({ lvl: "error", where, msg: "el RUT no está en el maestro de proveedores; agrégalo con sus datos bancarios" }); return }
    if (!provChecked[dc.out.rut]) {
      const pc = checkProv(p, email); provChecked[dc.out.rut] = pc;
      const pw = `Proveedor ${fmtRut(dc.out.rut)}`;
      pc.e.forEach(m => issues.push({ lvl: "error", where: pw, msg: m }));
      pc.w.forEach(m => issues.push({ lvl: "warn", where: pw, msg: m }));
    }
    const po = provChecked[dc.out.rut].out;
    const key = group ? po.rut + "|" + po.banco + "|" + po.cuenta : "#" + (seq++);
    if (!groups.has(key)) groups.set(key, { p: po, docs: [] });
    groups.get(key).docs.push({ ...dc.out, id: d.id, dc: normDc(d.dc) });
  });
  let total = 0, nDocs = 0; const lines = [];
  for (const g of groups.values()) {
    let sum = 0;
    g.docs.forEach(d => { sum += NC.has(d.tipo) ? -d.monto : d.monto });
    if (g.docs.some(d => NC.has(d.tipo))) issues.push({ lvl: "warn", where: `Proveedor ${fmtRut(g.p.rut)}`, msg: "incluye nota de crédito: se descontó del total a pagar. Confirma este tratamiento con tu ejecutivo BancoEstado." });
    if (!(sum > 0)) issues.push({ lvl: "error", where: `Proveedor ${fmtRut(g.p.rut)}`, msg: "el total a pagar queda en cero o negativo" });
    if (String(Math.abs(sum)).length > 13) issues.push({ lvl: "error", where: `Proveedor ${fmtRut(g.p.rut)}`, msg: "el monto total supera 13 dígitos" });
    g.sum = sum; total += sum; nDocs += g.docs.length;
    lines.push({ tipo: 1, f: ["1", g.p.rut, g.p.nombre, g.p.email, g.p.banco, g.p.forma, g.p.cuenta, g.p.sector, String(sum)] });
    g.docs.forEach(d => lines.push({ tipo: 2, f: ["2", d.fecha, String(d.monto), d.ndoc, d.tipo, "", "", "", ""] }));
  }
  const errs = issues.filter(i => i.lvl === "error").length, warns = issues.length - errs;
  return { fuente, issues, lines, total, nBen: groups.size, nDocs: list.length, errs, warns, ids, groups: [...groups.values()] };
}

// Archivo de carga: tabulaciones y CRLF, incluida la última línea.
export function toTxt(lines) { return lines.map(l => l.f.join("\t")).join("\r\n") + "\r\n" }

// Fuentes con documentos marcados, en el orden de la configuración.
export function activeFuentes(docs, fuentes) { const set = new Set(docs.filter(d => d.sel).map(d => d.fuente)); return fuentes.filter(f => set.has(f)).concat([...set].filter(f => !fuentes.includes(f))) }

// Prefijo del archivo: el patrón guardado con AAAAMMDD reemplazado por la fecha.
export function expandPrefijo(patron, fecha = new Date()) { return S(patron).replace(/AAAAMMDD/g, today(fecha)) }
// El nombre siempre termina en _FUENTE. Si el prefijo ya trae una fuente al
// final (ej. …_PROVEEDORES_SEP), se quita para no repetirla (…_SEP_SEP).
const conGuion = f => S(f).replace(/ /g, "_");
export function quitarFuenteFinal(prefijo, fuentes = []) {
  let p = S(prefijo).replace(/\.(txt|xlsx?)$/i, "").replace(/_+$/, "");
  const fs = [...new Set(fuentes.map(conGuion).filter(Boolean))].sort((a, b) => b.length - a.length);
  for (let cambio = true; cambio;) {
    cambio = false;
    for (const f of fs) if (p.toUpperCase().endsWith("_" + f.toUpperCase()) && p.length > f.length + 1) { p = p.slice(0, -(f.length + 1)).replace(/_+$/, ""); cambio = true; break }
  }
  return p;
}
export function fileName(prefijo, f, fecha = new Date(), fuentes = []) { return (quitarFuenteFinal(prefijo, [...fuentes, f]) || today(fecha) + "_PAGO_PROVEEDORES") + "_" + conGuion(f) }
// Nombre para descargar una nómina ya registrada, sin la fuente repetida.
export const nombreNomina = n => fileName(n.archivo, n.fuente);

// Estado visible de una nómina en la bitácora.
export function nomStatus(n, feriados = [], ahora = Date.now()) {
  if (n.estado === "anulada") return { k: "anulada", t: "Anulada", c: "neu" };
  if (n.estado === "generada") return { k: "generada", t: "Generada, falta cargar", c: "wrn" };
  const pend = n.pagos.filter(p => p.estado === "pendiente").length;
  const rech = n.pagos.filter(p => p.estado === "rechazado");
  if (pend) { const due = resultadoDesde(n, feriados); return ahora < due.getTime() ? { k: "espera", t: "Cargada, resultado desde " + fmtDue(due), c: "neu" } : { k: "revisar", t: "Registrar resultado del banco", c: "err" } }
  const sinR = rech.filter(p => !p.reint).length;
  if (rech.length) return { k: sinR ? "reintegrar" : "ok", t: `Procesada, ${rech.length} rechazo${rech.length > 1 ? "s" : ""}` + (sinR ? `, ${sinR} por reintegrar` : ""), c: sinR ? "wrn" : "okk" };
  return { k: "ok", t: "Procesada, todo pagado", c: "okk" };
}

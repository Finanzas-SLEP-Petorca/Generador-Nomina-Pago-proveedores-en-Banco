// Prueba de punta a punta en Chromium: el panel nuevo contra los emuladores
// de Auth y Firestore, comparado con el panel de referencia con los mismos
// datos ficticios.  cd tests && npm run e2e
// (la primera vez en otro computador: npx playwright install chromium)
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const REPO = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const AQUI = new URL("./.generado/", import.meta.url).pathname; // salidas y Firebase empaquetado
const BASE = "http://localhost:5000";
const ADMIN = "admin1@example.com", USUARIO = "usuario1@example.com", FUERA = "fuera@example.com";
const log = (...a) => console.log("•", ...a);

const srv = spawn("python3", ["-m", "http.server", "5000", "--bind", "127.0.0.1", "--directory", REPO], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 800));
const limpiarFirestore = () => fetch("http://127.0.0.1:8080/emulator/v1/projects/demo-pago/databases/(default)/documents", { method: "DELETE" });
await limpiarFirestore();

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function contexto(movil = false) {
  const ctx = await browser.newContext({ acceptDownloads: true, ...(movil ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } }) });
  await ctx.route(/gstatic\.com\/firebasejs\/10\.14\.1\/(.*)$/, (route) => { const f = route.request().url().split("/").pop(); route.fulfill({ path: AQUI + "fb/" + f, contentType: "text/javascript" }) });
  await ctx.route(/cdnjs\.cloudflare\.com.*xlsx.*/, r => r.fulfill({ path: REPO + "/vendor/xlsx-0.18.5.full.min.js", contentType: "text/javascript" }));
  await ctx.route(/cdnjs\.cloudflare\.com.*jszip.*/, r => r.fulfill({ path: REPO + "/vendor/jszip-3.10.1.min.js", contentType: "text/javascript" }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  return ctx;
}
async function panel(email, movil = false) {
  const ctx = await contexto(movil); const p = await ctx.newPage();
  p.on("pageerror", e => console.log("  [pageerror " + email + "]", e.message));
  p.on("console", m => { if (!/ERR_FAILED|Failed to load resource/.test(m.text())) console.log("  [console " + m.type() + " " + email + "]", m.text().slice(0, 300)) });
  p.on("dialog", d => d.accept());
  await p.goto(BASE + "/?emulador");
  await p.waitForFunction(() => window.__entrarEmulador);
  await p.evaluate(e => window.__entrarEmulador(e), email);
  return p;
}
// Acceso real por enlace al correo: el emulador de Auth guarda los enlaces enviados.
async function panelEnlace(email) {
  const ctx = await contexto(); const p = await ctx.newPage();
  p.on("pageerror", e => console.log("  [pageerror " + email + "]", e.message));
  p.on("dialog", d => d.accept());
  await p.goto(BASE + "/?emulador");
  await p.waitForSelector("#accesoForm:not([hidden])");
  await p.fill("#accesoEmail", email); await p.click("#btnEntrar");
  await p.waitForFunction(() => document.getElementById("accesoMsg").textContent.startsWith("Enviamos un enlace"));
  const { oobCodes } = await (await fetch("http://127.0.0.1:9099/emulator/v1/projects/demo-pago/oobCodes")).json();
  const enlace = oobCodes.filter(c => c.email === email && c.requestType === "EMAIL_SIGNIN").pop().oobLink;
  await p.goto(enlace); // el emulador redirige al panel con el código del enlace
  return p;
}
const listo = p => p.waitForFunction(() => !document.getElementById("app").hidden && document.getElementById("cargando").hidden);
const toastTxt = p => p.textContent("#toast");
// Espera n descargas seguidas (generar baja el .txt y el Excel BancoEstado).
async function descargas(p, n, accion) {
  const lista = []; const listo = new Promise(ok => { const f = async d => { lista.push({ nombre: d.suggestedFilename(), bytes: readFileSync(await d.path()) }); if (lista.length === n) { p.off("download", f); ok() } }; p.on("download", f) });
  await accion(); await listo; return lista;
}
async function descarga(p, accion) { const [d] = await Promise.all([p.waitForEvent("download"), accion()]); return { nombre: d.suggestedFilename(), bytes: readFileSync(await d.path()) } }
const esperar = (p, fn, arg) => p.waitForFunction(fn, arg, { timeout: 10000 });

// ---------- datos ficticios: planilla de pago anterior del banco ----------
const dv = b => { let s = 0, m = 2; for (let i = b.length - 1; i >= 0; i--) { s += (+b[i]) * m; m = m === 7 ? 2 : m + 1 } const r = 11 - s % 11; return r === 11 ? "0" : r === 10 ? "K" : String(r) };
const R = ["11111111", "22222222", "76543210", "12345678", "9876543"].map(b => b + dv(b));
const T = s => s.join("\t");
const lineas = [
  T(["1", R[0], "COMERCIAL UNO LIMITADA", "uno@ejemplo.cl", "012", "01", "11111111", "64", "150000"]), T(["2", "01092026", "100000", "501", "33", "", "", "", ""]), T(["2", "02092026", "50000", "502", "33", "", "", "", ""]),
  T(["1", R[1], "SERVICIOS DOS SPA", "", "001", "01", "123456789", "64", "90000"]), T(["2", "03092026", "100000", "601", "34", "", "", "", ""]), T(["2", "04092026", "10000", "602", "61", "", "", "", ""]),
  T(["1", R[2], "EDITORIAL TRES LTDA", "tres@ejemplo.cl", "037", "01", "70001234", "64", "250000"]), T(["2", "15082026", "250000", "77", "33", "", "", "", ""]),
];
const planilla = lineas.join("\r\n") + "\r\n";

try {
  // ---------- acceso ----------
  const fuera = await panelEnlace(FUERA);
  await esperar(fuera, () => !document.getElementById("btnSalirAcceso").hidden);
  assert.match(await fuera.textContent("#accesoMsg"), /no tiene acceso/);
  assert.equal(await fuera.isVisible("#app"), false);
  log("usuario fuera de pAllowed(): ve 'sin acceso' y no la app");

  const A = await panel(ADMIN); await listo(A);
  assert.match(await A.textContent("#usuarioRol"), /Administrador/);
  const U = await panelEnlace(USUARIO); await listo(U);
  assert.equal(new URL(U.url()).search, "?emulador"); // se limpia el código del enlace
  log("acceso por enlace al correo: el usuario entra; el de fuera de la lista ve 'sin acceso'");
  assert.doesNotMatch(await U.textContent("#usuarioRol"), /Administrador/);
  log("admin y usuario entran; la sonda detecta al administrador");
  const recursos = await A.evaluate(() => performance.getEntriesByType("resource").map(r => r.name).filter(u => /\/(js|css)\//.test(u)));
  assert.ok(recursos.length >= 15 && recursos.every(u => /\?v=[0-9a-f]{10}$/.test(u)), "hay módulos sin versión: " + recursos.filter(u => !/\?v=/.test(u)).join(", "));
  log("los " + recursos.length + " archivos js/css se cargan con su versión (?v=…), sin copias viejas en caché");

  // ---------- paso 1: pegar planilla anterior del banco ----------
  await A.click('.steps button[data-step="1"]');
  await A.fill("#pasteProv", planilla);
  await A.click("#btnPasteProv");
  await esperar(A, () => document.getElementById("cntProv").textContent === "3");
  await esperar(U, () => document.getElementById("cntProv").textContent === "3" && document.getElementById("cntDocs").textContent === "5/5");
  log("planilla del banco reconstruye 3 proveedores y 5 documentos; el otro usuario lo ve en tiempo real:", await toastTxt(A));

  // ---------- panel de referencia con los mismos datos ----------
  const refCtx = await contexto(); const REF = await refCtx.newPage(); REF.on("dialog", d => d.accept());
  await REF.goto(BASE + "/referencia/panel_actual_claude.html");
  await REF.fill("#pasteProv", planilla); await REF.click("#btnPasteProv");
  const refTxt = await REF.evaluate(() => toTxt(build("GENERAL").lines));

  // ---------- paso 3: generar y comparar byte a byte ----------
  await A.click('.steps button[data-step="3"]');
  await esperar(A, () => !document.getElementById("btnGen").disabled);
  assert.match(await A.textContent("#btnGen"), /N° 1 \(GENERAL\)/);
  const bor = await descarga(A, () => A.click("#btnXlsx"));
  assert.match(bor.nombre, /^\d{8}_PAGO_PROVEEDORES_GENERAL\.xlsx$/);
  const [gen, genXl] = await descargas(A, 2, () => A.click("#btnGen"));
  assert.equal(genXl.nombre, gen.nombre.replace(/\.txt$/, ".xlsx"));
  assert.equal(Buffer.compare(genXl.bytes.subarray(0, 2), Buffer.from("PK")), 0); // es un .xlsx (zip)
  // Ventana de nómina registrada: botones para bajar otra vez cada archivo.
  await esperar(A, () => document.getElementById("dlgGenerada").open);
  assert.match(await A.textContent("#genTitulo"), /Nómina N° 1/);
  const deNuevo = await descarga(A, () => A.click("#genXlsx"));
  assert.equal(deNuevo.nombre, genXl.nombre); assert.equal(Buffer.compare(deNuevo.bytes, genXl.bytes), 0);
  const txtDeNuevo = await descarga(A, () => A.click("#genTxt"));
  assert.equal(Buffer.compare(txtDeNuevo.bytes, gen.bytes), 0);
  await A.screenshot({ path: AQUI + "nomina_generada.png" });
  await A.click("#genCerrar"); await esperar(A, () => !document.getElementById("dlgGenerada").open);
  log("al generar se abre la ventana con Descargar .txt y Descargar Excel BancoEstado (mismos archivos)");
  assert.match(gen.nombre, /_PAGO_PROVEEDORES_GENERAL\.txt$/);
  assert.equal(Buffer.compare(gen.bytes, Buffer.from(refTxt, "utf8")), 0, "el .txt difiere de la referencia");
  writeFileSync(AQUI + "salida_nomina1.txt", gen.bytes);
  log(".txt de la nómina N° 1 idéntico byte a byte al de la referencia (" + gen.bytes.length + " bytes, CRLF)");
  await esperar(A, () => document.querySelector("#hDetail h2")?.textContent.includes("N° 1"));
  await esperar(U, () => document.getElementById("cntDocs").textContent === "0/0");

  // Excel BancoEstado de la nómina: se reimporta como planilla anterior del banco.
  const xl = await descarga(A, () => A.click("#nXlsx"));
  writeFileSync(AQUI + "nomina1.xlsx", xl.bytes);
  const refXl = await REF.evaluate(async () => Array.from(await bankWorkbook(build("GENERAL").lines)));
  log("Excel BancoEstado descargado:", xl.nombre, xl.bytes.length, "bytes (referencia", refXl.length + ")");
  assert.equal(genXl.bytes.length, xl.bytes.length);
  log("al generar se descargan ambos:", gen.nombre, "y", genXl.nombre, "(" + genXl.bytes.length + " bytes, igual al de la bitácora)");

  // ---------- paso 2: documentos con DC y dos usuarios generando a la vez ----------
  await U.click('.steps button[data-step="2"]');
  await U.fill("#pasteDocs", [T([R[0], "10/09/2026", "20000", "900", "33", "SEP", "DC 54"]), T([R[1], "10/09/2026", "30000", "901", "33", "PIE", "DC 55"]), T([R[2], "11/09/2026", "40000", "902", "33", "PIE"])].join("\n"));
  await U.click("#btnPasteDocs");
  await esperar(U, () => document.getElementById("cntDocs").textContent === "3/3");
  assert.match(await U.textContent("#tbDocs"), /DC 54/);
  // documento a mano con DC
  await U.fill("#dRut", R[0]); await U.fill("#dFecha", "2026-09-12"); await U.fill("#dMonto", "5000"); await U.fill("#dNdoc", "903"); await U.selectOption("#dFuente", "SEP"); await U.fill("#dDc", "DC 56");
  await U.click("#btnAddDoc");
  await esperar(U, () => document.getElementById("cntDocs").textContent === "4/4");
  log("documentos pegados y a mano con DC:", await toastTxt(U));
  // Editar un documento pendiente: se carga en el formulario, se corrige y queda en el historial.
  const idDoc = await U.$eval("#tbDocs tr", () => [...document.querySelectorAll("#tbDocs tr")].find(t => t.textContent.includes("903")).querySelector("[data-ed]").dataset.ed);
  await U.click(`#tbDocs [data-ed="${idDoc}"]`);
  assert.match(await U.textContent("#dFormTitulo"), /Editar documento 903/);
  assert.equal(await U.inputValue("#dFecha"), "2026-09-12");
  await U.fill("#dMonto", "5500"); await U.fill("#dDc", "DC 57");
  await U.click("#btnAddDoc");
  // (no se espera el aviso: el del alta anterior puede llegar después y taparlo)
  await esperar(U, () => document.getElementById("dFormTitulo").textContent === "Agregar un documento");
  await esperar(U, () => { const t = [...document.querySelectorAll("#tbDocs tr")].find(t => t.textContent.includes("903")); return t && t.textContent.includes("$5.500") && t.textContent.includes("DC 57") });
  assert.equal(await U.textContent("#dFormTitulo"), "Agregar un documento");
  const hDoc = await U.evaluate(async () => {
    const fs = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    const q = await fs.getDocs(fs.query(fs.collection(fs.getFirestore(), "pago_historial"), fs.where("accion", "==", "editar documento pendiente")));
    return q.docs.map(d => d.data()).map(h => [h.antes.monto, h.despues.monto, h.antes.dc, h.despues.dc, h.autor]);
  });
  assert.deepEqual(hDoc, [[5000, 5500, "DC 56", "DC 57", USUARIO]]);
  log("editar documento pendiente: se corrige y el historial guarda antes y después");

  await A.click('.steps button[data-step="3"]'); await U.click('.steps button[data-step="3"]');
  await A.click('#tbFuentes tr[data-f="SEP"]'); await U.click('#tbFuentes tr[data-f="PIE"]');
  await esperar(A, () => !document.getElementById("btnGen").disabled); await esperar(U, () => !document.getElementById("btnGen").disabled);
  const [[gA], [gU]] = await Promise.all([descargas(A, 2, () => A.click("#btnGen")), descargas(U, 2, () => U.click("#btnGen"))]).catch(async e => { console.log("toast A:", await toastTxt(A), "| toast U:", await toastTxt(U)); throw e });
  for (const P of [A, U]) { await esperar(P, () => document.getElementById("dlgGenerada").open); await P.click("#genCerrar") }
  await esperar(A, () => document.querySelectorAll("#tbBit tr[data-id]").length === 3);
  const nums = await A.$$eval("#tbBit tr[data-id]", trs => trs.map(t => t.dataset.id).sort());
  assert.deepEqual(nums, ["1", "2", "3"]);
  log("dos usuarios generando a la vez: nóminas", nums.join(", "), "sin repetir número;", gA.nombre, gU.nombre);

  // ---------- paso 4: carga, resultado, rechazo y reintegro ----------
  await A.click('.steps button[data-step="4"]');
  await A.click('#tbBit tr[data-id="1"]');
  // Fecha de pago: por defecto el día hábil siguiente a la carga; no puede ser anterior a la carga.
  // Fechas calculadas desde hoy: un viernes futuro para la carga y su lunes para el pago.
  const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const dmy = d => String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
  const vie = new Date(); vie.setDate(vie.getDate() + 1); while (vie.getDay() !== 5) vie.setDate(vie.getDate() + 1);
  const jue = new Date(vie); jue.setDate(vie.getDate() - 1);
  const lun = new Date(vie); lun.setDate(vie.getDate() + 3);
  await A.fill("#nFecha", iso(vie)); await A.dispatchEvent("#nFecha", "change");  // viernes
  assert.equal(await A.inputValue("#nFechaPago"), iso(lun));                       // lunes
  await A.fill("#nFechaPago", iso(jue)); await A.click("#nCargar");
  await esperar(A, () => document.getElementById("toast").textContent.includes("no puede ser anterior"));
  await A.fill("#nFechaPago", iso(lun));
  await A.click("#nCargar");  // sin N° de nómina BancoEstado no se marca como cargada
  await esperar(A, () => document.getElementById("toast").textContent.includes("N° de nómina que asignó BancoEstado"));
  assert.ok((await A.textContent("#hDetail .tag")).includes("Generada"));
  await A.fill("#nOper", "7654321");
  await A.click("#nCargar");
  await esperar(A, () => document.querySelector("#hDetail .tag")?.textContent.includes("Cargada"));
  await esperar(A, () => document.querySelector('#tbBit tr[data-id="1"] td:nth-child(2)').textContent === "7654321");
  assert.ok((await A.textContent("#hDetail h2")).includes("BancoEstado N° 7654321"));
  await A.fill("#hSearch", "7654321");
  await esperar(A, () => document.querySelectorAll("#tbBit tr[data-id]").length === 1 && !!document.querySelector('#tbBit tr[data-id="1"]'));
  await A.fill("#hSearch", "");
  log("N° de nómina BancoEstado: obligatorio al cargar, visible en la tabla y en el detalle, y se puede buscar");
  await esperar(A, f => document.querySelector('#tbBit tr[data-id="1"]').textContent.includes(f), dmy(lun));
  assert.ok((await A.textContent("#hDetail .due")).includes("Fecha de pago: " + dmy(lun)));
  log("fecha de pago: sugiere el día hábil siguiente, rechaza fechas anteriores a la carga y se ve en la bitácora");
  assert.ok(new RegExp("Generada el .* por Admin1\\. Cargada en BancoEstado el " + dmy(vie).replace(/\//g, "\\/") + " por Admin1\\.").test(await A.textContent("#hDetail .due")));
  assert.match(await A.textContent('#tbBit tr[data-id="1"]'), /Admin1/);
  assert.ok((await A.textContent("#hDetail .tag")).includes("resultado desde lun " + dmy(lun).slice(0, 5) + " 14:00")); // 14:00 del día de pago
  log("trazabilidad: quién generó y quién cargó; resultado desde las 14:00 del día de pago");
  await A.selectOption('#hDetail [data-pe="1"]', "rechazado");
  await esperar(A, () => document.querySelector('#hDetail [data-pm="1"]'));
  await A.fill('#hDetail [data-pm="1"]', "cuenta inexistente"); await A.press('#hDetail [data-pm="1"]', "Tab");
  await esperar(A, () => document.querySelector('#hDetail [data-pr="1"]'));
  await A.click('#hDetail [data-pr="1"]');
  await esperar(A, () => document.getElementById("cntDocs").textContent === "2/2");
  // Con la tarjeta "Esperando resultado" activa, la nómina pagada sale de la tabla y pasa a "Pagadas".
  await A.click('#bitStats .stat[data-k="espera"]');
  await esperar(A, () => !!document.querySelector('#tbBit tr[data-id="1"]') && !document.getElementById("bitFiltro").hidden);
  await A.click("#nPagarRest");
  await esperar(A, () => /Procesada/.test(document.querySelector("#hDetail .tag")?.textContent));
  await esperar(A, () => !document.querySelector('#tbBit tr[data-id="1"]') && document.getElementById("bitFiltro").textContent.includes("esperando resultado"));
  assert.match(await toastTxt(A), /queda en «Pagadas»/);
  await A.click('#bitStats .stat[data-k="ok"]');
  await esperar(A, () => !!document.querySelector('#tbBit tr[data-id="1"]') && document.querySelector('#bitStats .stat[data-k="ok"] b').textContent === "1");
  const pagadoTarjeta = await A.textContent('#bitStats .stat[data-k="ok"] small');
  await A.click("#bitFiltro [data-vertodas]");
  await esperar(A, () => document.getElementById("bitFiltro").hidden && document.querySelectorAll("#tbBit tr[data-id]").length === 3);
  log("tarjeta Pagadas:", pagadoTarjeta, "; con un filtro activo se avisa y 'Ver todas' vuelve a la lista completa");
  // Reporte de pagos: la nómina 1 se paga el lunes calculado, que puede caer el mes siguiente; "Todo" la incluye.
  await A.click('[data-rper="todo"]');
  await esperar(A, t => document.querySelector("#rKpis .hero b").textContent === t, pagadoTarjeta);
  const rep = await descarga(A, () => A.click("#btnReporte"));
  assert.equal(rep.nombre, "reporte_pagos_todo.xlsx");
  {
    const XLSX = createRequire(import.meta.url)(REPO + "/vendor/xlsx-0.18.5.full.min.js");
    const wb = XLSX.read(rep.bytes, { type: "buffer" });
    assert.deepEqual(wb.SheetNames, ["Resumen", "Pagado", "Rechazados"]);
    const pg = XLSX.utils.sheet_to_json(wb.Sheets.Pagado, { header: 1, raw: true, defval: "" });
    const total = pg.at(-1)[14];
    assert.equal("$" + total.toLocaleString("es-CL"), pagadoTarjeta);
    assert.ok(pg.slice(1, -1).every(f => f[1] === 1 && f[2] === "7654321"));
    const rc = XLSX.utils.sheet_to_json(wb.Sheets.Rechazados, { header: 1, raw: true, defval: "" });
    assert.equal(rc[1][10], "cuenta inexistente");
    const pdf = await descarga(A, () => A.click("#btnReportePdf"));
    assert.equal(pdf.nombre, "reporte_pagos_todo.pdf");
    assert.equal(pdf.bytes.subarray(0, 5).toString("latin1"), "%PDF-");
    assert.ok(pdf.bytes.length > 20000, "PDF de " + pdf.bytes.length + " bytes"); // con el logo
    log("reporte de pagos en PDF:", pdf.nombre, pdf.bytes.length, "bytes");
    log("reporte de pagos:", rep.nombre, "con", pg.length - 2, "documentos pagados por", pagadoTarjeta, "y", rc.length - 2, "rechazo");
  }
  await esperar(A, () => document.querySelectorAll("#nHist li").length >= 5);
  const histN1 = await A.$$eval("#nHist li b", b => b.map(x => x.textContent));
  assert.ok((await A.textContent("#nHist")).includes("fecha de pago " + dmy(lun)));
  log("historial de la nómina 1:", histN1.join(" → "));
  await A.click('.steps button[data-step="2"]');
  assert.match(await A.textContent("#tbDocs"), /Rechazado en nómina N° 1: cuenta inexistente/);
  log("pago rechazado vuelve a pendientes con su motivo");
  // Cerrar el detalle: tocando otra vez la misma nómina o con el botón Cerrar.
  await A.click('.steps button[data-step="4"]');
  await A.click('#tbBit tr[data-id="1"]'); await esperar(A, () => document.getElementById("hDetail").hidden);
  await A.click('#tbBit tr[data-id="1"]'); await esperar(A, () => !document.getElementById("hDetail").hidden);
  await A.click("#nCerrar"); await esperar(A, () => document.getElementById("hDetail").hidden);
  assert.equal(await A.$('#tbBit tr.cur'), null);
  log("detalle de la nómina: se cierra al tocarla de nuevo o con Cerrar");

  // búsqueda por DC en la bitácora
  await A.click('.steps button[data-step="4"]'); await A.fill("#hSearch", "dc 54");
  await esperar(A, () => document.getElementById("hTrace").textContent.includes("DC 54"));
  log("buscador por DC:", (await A.textContent("#hTrace")).slice(0, 120));
  await A.fill("#hSearch", "");

  // ---------- anular y comprobar que queda cerrada ----------
  await A.click('#tbBit tr[data-id="3"]');
  await A.click("#nAnular");
  await esperar(A, () => /Anulada/.test(document.querySelector("#hDetail .tag")?.textContent || "") || document.querySelectorAll('#tbBit tr[data-id="3"]').length === 0);
  await A.check("#hAnul"); await A.click('#tbBit tr[data-id="3"]');
  assert.equal(await A.isDisabled("#nFecha"), true);
  assert.equal(await A.$("#nAnular"), null); assert.equal(await A.$("#nCargar"), null);
  const directo = await A.evaluate(async () => {
    const fs = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    try { await fs.updateDoc(fs.doc(fs.getFirestore(), "pago_nominas/3"), { obs: "x", updatedBy: "admin1@example.com", updatedAt: fs.serverTimestamp() }); return "escribió" } catch (e) { return e.code }
  });
  assert.equal(directo, "permission-denied");
  log("nómina anulada: sin botones, campos deshabilitados y Firestore rechaza editarla");

  // ---------- cambio de datos bancarios queda en el historial ----------
  await A.click('.steps button[data-step="1"]');
  await A.click(`#tbProv tr[data-rut="${R[0]}"]`);
  await A.fill("#fCuenta", "99990000"); await A.click("#btnSaveProv");
  await esperar(A, () => document.getElementById("toast").textContent.startsWith("Proveedor guardado"));
  await A.click(`#tbProv tr[data-rut="${R[0]}"]`);
  await esperar(A, () => document.getElementById("provHist").textContent.includes("cambio datos bancarios")).catch(async e => { console.log("provHist:", await A.textContent("#provHist"), "| toast:", await toastTxt(A), "| hidden:", await A.$eval("#provHist", x => x.hidden)); throw e });
  log("historial del proveedor:", (await A.textContent("#provHist")).replace(/\s+/g, " ").slice(0, 200));
  // Un usuario no admin no puede cambiar el RUT ni eliminar.
  await U.click('.steps button[data-step="1"]'); await U.click(`#tbProv tr[data-rut="${R[0]}"]`);
  assert.equal(await U.isDisabled("#fRut"), true); assert.equal(await U.isVisible("#btnDelProv"), false);

  // ---------- remuneraciones y abonos (planilla de 7 columnas) ----------
  {
    const { createRequire } = await import("node:module");
    const XLSX = createRequire(import.meta.url)(REPO + "/vendor/xlsx-0.18.5.full.min.js");
    const P = ["33333333", "44444444", "55555555"].map(b => b + dv(b));
    const hoja = XLSX.utils.aoa_to_sheet([["", "", "Pago"], ["", "", "(7 Columnas)"], ["RUT", "NOMBRES Y APELLIDOS O RAZÓN SOCIAL", "EMAIL", "BANCO", "FORMA DE PAGO", "Nº DE CUENTA", "MONTO DEL PAGO"],
      [P[0], "Víctor Núñez Pérez", "FINANZAS@SLEPPETORCA.GOB.CL", "012", "29", "", 150000], [P[1], "maría josé soto", "", "012", "30", "", 46290], [P[2], "PEDRO ROJAS", "", "001", "01", "987654", 27540]]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, hoja, "DETALLE");
    const ruta = AQUI + "20260930 - REPOSICION FONDOS FIJOS EE.xlsx";
    writeFileSync(ruta, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
    await A.click('.steps button[data-step="6"]');
    await A.setInputFiles("#abArchivo", ruta);
    await esperar(A, () => document.querySelectorAll("#abTabla tr .chk").length === 3);
    const tabla = await A.textContent("#abTabla");
    assert.match(tabla, /VICTOR NUNEZ PEREZ/); assert.match(tabla, /MARIA JOSE SOTO/); assert.match(tabla, /FONDOS FIJOS/);
    log("remuneraciones: importa la planilla de 7 columnas, corrige nombres y deduce el concepto:", (await toastTxt(A)).slice(0, 140));
    await A.fill("#abPegar", [P[2], "PEDRO ROJAS", "", "001", "01", "987654", "5000", "PIE", "Viatico octubre"].join("\t")); await A.click("#abBtnPegar");
    await esperar(A, () => document.querySelectorAll("#abTabla tr .chk").length === 4);
    await A.click('#abFuentes tr[data-abf="GENERAL"]');
    await esperar(A, () => !document.getElementById("abBtnGenerar").disabled);
    assert.equal(await A.textContent("#abTotal"), "$234.019");
    const [abTxt, abXl] = await descargas(A, 2, () => A.click("#abBtnGenerar"));
    const hoyA = new Date(); const pref = hoyA.getFullYear() + String(hoyA.getMonth() + 1).padStart(2, "0") + String(hoyA.getDate()).padStart(2, "0");
    assert.equal(abTxt.nombre, pref + "_FONDOS_FIJOS_GENERAL.txt"); assert.equal(abXl.nombre, pref + "_FONDOS_FIJOS_GENERAL.xlsx");
    assert.equal(abTxt.bytes.toString("utf8"), [[P[0], "VICTOR NUNEZ PEREZ", "FINANZAS@SLEPPETORCA.GOB.CL", "012", "29", "", "150000"], [P[1], "MARIA JOSE SOTO", "finanzas@sleppetorca.gob.cl", "012", "30", P[1].slice(0, -1), "46290"], [P[2], "PEDRO ROJAS", "finanzas@sleppetorca.gob.cl", "001", "01", "987654", "27540"]].map(f => f.join("\t")).join("\r\n") + "\r\n");
    const leido = XLSX.read(abXl.bytes, { type: "buffer" });
    assert.equal(leido.SheetNames[0], "DETALLE"); assert.equal(leido.Sheets.DETALLE.B4.v, "VICTOR NUNEZ PEREZ"); assert.equal(leido.Sheets.DETALLE.F4?.v, undefined); // pago cash: cuenta en blanco
    await esperar(A, () => document.getElementById("dlgGenerada").open); await A.click("#genCerrar");
    const nAb = await A.$eval("#hDetail h2", h => h.textContent);
    assert.match(nAb, /remuneraciones \(fondos fijos\)/);
    log("remuneraciones: genera", abTxt.nombre, "y", abXl.nombre, "(7 campos por línea, pago cash sin cuenta y CuentaRUT)");
    // Bitácora: filtro por tipo, carga, rechazo y vuelta a pendientes.
    await A.selectOption("#hTipo", "abonos");
    const filas = await A.$$eval("#tbBit tr[data-id]", t => t.length); assert.equal(filas, 1);
    await A.fill("#nOper", "7654322");
    await A.click("#nCargar");
    await esperar(A, () => document.querySelector("#hDetail .tag")?.textContent.includes("Cargada"));
    await A.selectOption('#hDetail [data-pe="2"]', "rechazado");
    await esperar(A, () => document.querySelector('#hDetail [data-pr="2"]'));
    await A.click('#hDetail [data-pr="2"]');
    await esperar(A, () => document.getElementById("cntAbonos").textContent === "2/2");
    await A.selectOption("#hTipo", "*");
    await A.click('.steps button[data-step="6"]');
    assert.match(await A.textContent("#abTabla"), /Rechazado en nómina N° \d+/);
    // Alta manual: el RUT ya pagado autocompleta sus datos.
    await A.fill("#abRut", P[0]); await A.dispatchEvent("#abRut", "change");
    assert.equal(await A.inputValue("#abNombre"), "VICTOR NUNEZ PEREZ"); assert.equal(await A.inputValue("#abForma"), "29");
    log("remuneraciones: rechazo vuelve a la pestaña, filtro por tipo en la bitácora y autocompletar desde el último pago");
    // Editar un abono pendiente: el formulario se carga, se guarda y queda en el historial.
    await A.click("#abBtnCancelar").catch(() => {});
    const primero = await A.$eval("#abTabla [data-abed]", b => b.dataset.abed);
    await A.click(`#abTabla [data-abed="${primero}"]`);
    assert.match(await A.textContent("#abFormTitulo"), /Editar abono/);
    await A.fill("#abMonto", "33333"); await A.selectOption("#abBanco", "012"); await A.selectOption("#abForma", "29");
    await A.click("#abBtnAgregar");
    await esperar(A, () => document.getElementById("abFormTitulo").textContent === "Agregar un abono");
    await esperar(A, () => document.getElementById("abTabla").textContent.includes("$33.333") && document.getElementById("abTabla").textContent.includes("sin cuenta"));
    assert.equal(await A.textContent("#abFormTitulo"), "Agregar un abono");
    const hEd = await A.evaluate(async () => {
      const fs = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
      const q = await fs.getDocs(fs.query(fs.collection(fs.getFirestore(), "pago_historial"), fs.where("accion", "==", "cambio datos bancarios abono")));
      return q.docs.map(d => d.data()).map(h => [h.antes.forma, h.despues.forma, h.despues.monto]);
    });
    assert.deepEqual(hEd, [["01", "29", 33333]]);
    log("remuneraciones: editar un abono pendiente; el cambio de banco/forma queda en el historial con antes y después");
    assert.match(await A.textContent("#p6 [data-estado=s]"), /abonos? marcados?/);
    const navOk = await A.evaluate(() => { const n = document.querySelector(".steps"); return n.scrollWidth <= n.clientWidth + 1 });
    assert.ok(navOk, "las pestañas no caben en 1280 px");
    await A.screenshot({ path: AQUI + "remuneraciones.png", fullPage: true });
  }

  // ---------- feriados ----------
  await A.click("#btnConfig");
  await A.fill("#cFeriado", "18/09/2026, 2026-09-19"); await A.click("#btnAddFeriado");
  await esperar(A, () => document.getElementById("feriados").textContent.includes("18/09/2026"));
  log("feriados:", await A.textContent("#feriados"));

  // ---------- migración desde el panel de referencia ----------
  // En la referencia: generar una nómina y marcarla cargada, para tener bitácora.
  await REF.click('.steps button[data-step="3"]'); await REF.click("#btnGen");
  await REF.evaluate(() => { nominas[0].estado = "cargada"; nominas[0].fechaCarga = "2026-09-20"; nominas[0].pagos[0].estado = "pagado"; saveNom() });
  await REF.click('.steps button[data-step="2"]');
  await REF.fill("#pasteDocs", T([R[0], "20/09/2026", "7000", "990", "33", "SEP"])); await REF.click("#btnPasteDocs");
  await REF.click('.steps button[data-step="3"]'); await REF.click('#tbFuentes tr[data-f="SEP"]'); await REF.click("#btnGen");
  await REF.click('.steps button[data-step="2"]');
  await REF.fill("#pasteDocs", [T([R[0], "20/09/2026", "", "991", "33", "SEP"]), T([R[1], "21/09/2026", "8000", "992", "33", "PIE"])].join("\n")); await REF.click("#btnPasteDocs");
  const respaldo = await REF.evaluate(() => { const o = {}; for (const k of ["bepago.maestro.v1", "bepago.docs.v1", "bepago.nominas.v1", "bepago.config.v1"]) o[k] = localStorage.getItem(k); return o });
  writeFileSync(AQUI + "respaldo_ref.json", JSON.stringify(respaldo));
  const refNoms = JSON.parse(respaldo["bepago.nominas.v1"]);
  log("respaldo de la referencia:", refNoms.length, "nóminas,", JSON.parse(respaldo["bepago.docs.v1"]).length, "documentos pendientes");

  await limpiarFirestore();
  await A.reload(); await A.waitForFunction(() => window.__entrarEmulador); await listo(A);
  if (!(await A.isVisible("#p5"))) await A.click("#btnConfig"); // al recargar vuelve al último paso abierto
  assert.equal(await A.isVisible("#cardMigracion"), true);
  await A.setInputFiles("#fileRespaldo", AQUI + "respaldo_ref.json");
  await esperar(A, () => document.getElementById("btnConfirmarRespaldo"));
  log("resumen previo:", (await A.textContent("#resumenRespaldo")).replace(/\s+/g, " ").slice(0, 400));
  await A.click("#btnConfirmarRespaldo");
  await esperar(A, () => document.getElementById("avanceRespaldo")?.textContent === "Importación terminada.");
  await A.click('.steps button[data-step="4"]'); await A.check("#hAnul");
  await esperar(A, (n) => document.querySelectorAll("#tbBit tr[data-id]").length === n, refNoms.length);
  const estados = await A.$$eval("#tbBit tr[data-id] .tag", t => t.map(x => x.textContent));
  log("nóminas migradas:", estados.join(" | "), "· documentos pendientes:", await A.textContent("#cntDocs"));
  assert.equal(await A.textContent("#cntProv"), "3");
  // El .txt de la nómina migrada es el mismo que generó la referencia.
  await A.click('#tbBit tr[data-id="1"]');
  const mig = await descarga(A, () => A.click("#nTxt"));
  const refN1 = await REF.evaluate(() => toTxt(nominas[0].lines));
  assert.equal(Buffer.compare(mig.bytes, Buffer.from(refN1, "utf8")), 0);
  await A.click('.steps button[data-step="3"]');
  assert.match(await A.textContent("#btnGen"), new RegExp("N° " + (refNoms.length + 1)));
  log("nómina migrada idéntica y el contador sigue en", refNoms.length + 1);

  // ---------- capturas ----------
  await A.click('.steps button[data-step="4"]'); await A.click('#tbBit tr[data-id="1"]');
  await A.click('[data-tema="light"]');
  // Guía "Cómo se usa": abre en la sección del paso actual y se cierra.
  await A.click('.steps button[data-step="3"]');
  await A.click("#btnGuia");
  await esperar(A, () => document.getElementById("guia").open);
  assert.equal(await A.getAttribute('#guiaIndice a[data-sec="p3"]', "aria-current"), "true");
  assert.equal(await A.$eval('.steps button[data-step="3"]', b => b.getAttribute("aria-selected")), "true"); // el botón no cambia de paso
  await A.screenshot({ path: AQUI + "guia.png" });
  await A.click('#guiaIndice a[data-sec="faq"]');
  await esperar(A, () => document.querySelector('#guiaIndice a[data-sec="faq"]').getAttribute("aria-current") === "true");
  await A.click("#guiaCerrar");
  await esperar(A, () => !document.getElementById("guia").open);
  log("guía Cómo se usa: abre en el paso actual, navega por secciones y se cierra");
  await A.screenshot({ path: AQUI + "escritorio_paso4.png", fullPage: true });
  await A.click('.steps button[data-step="3"]'); await A.screenshot({ path: AQUI + "escritorio_paso3.png", fullPage: true });
  await A.click('[data-tema="dark"]');
  assert.equal(await A.evaluate(() => document.documentElement.dataset.theme), "dark");
  await A.screenshot({ path: AQUI + "escritorio_paso3_oscuro.png", fullPage: true });
  await A.click('.steps button[data-step="4"]'); await A.screenshot({ path: AQUI + "escritorio_paso4_oscuro.png", fullPage: true });
  await A.reload(); await listo(A);
  assert.equal(await A.evaluate(() => document.documentElement.dataset.theme), "dark"); // se recuerda al recargar
  await A.click('[data-tema="system"]');
  assert.equal(await A.evaluate(() => document.documentElement.dataset.theme), undefined);
  log("tema claro/oscuro/sistema: cambia, se recuerda al recargar y vuelve al del sistema");
  await A.click('.steps button[data-step="4"]');
  const M = await panel(USUARIO, true); await listo(M);
  await M.screenshot({ path: AQUI + "movil_paso1.png", fullPage: false });
  await M.click("#btnGuia"); await esperar(M, () => document.getElementById("guia").open);
  await M.screenshot({ path: AQUI + "movil_guia.png" }); await M.click("#guiaCerrar");
  await M.click('.steps button[data-step="2"]'); await M.screenshot({ path: AQUI + "movil_paso2.png", fullPage: false });
  await M.click('.steps button[data-step="3"]'); await M.screenshot({ path: AQUI + "movil_paso3.png", fullPage: false });
  const ancho = await M.evaluate(() => document.documentElement.scrollWidth);
  log("móvil: ancho de página", ancho, "px (viewport 390)");
  log("TODO OK");
} catch (e) {
  console.error("FALLÓ:", e);
  process.exitCode = 1;
} finally {
  await browser.close(); srv.kill();
}

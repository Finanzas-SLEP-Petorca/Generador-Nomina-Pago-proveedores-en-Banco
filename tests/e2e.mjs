// Prueba de punta a punta en Chromium: el panel nuevo contra los emuladores
// de Auth y Firestore, comparado con el panel de referencia con los mismos
// datos ficticios.  cd tests && npm run e2e
// (la primera vez en otro computador: npx playwright install chromium)
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

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
  assert.match(await A.textContent("#usuarioEmail"), /admin/);
  const U = await panelEnlace(USUARIO); await listo(U);
  assert.equal(new URL(U.url()).search, "?emulador"); // se limpia el código del enlace
  log("acceso por enlace al correo: el usuario entra; el de fuera de la lista ve 'sin acceso'");
  assert.doesNotMatch(await U.textContent("#usuarioEmail"), /admin/);
  log("admin y usuario entran; la sonda detecta al administrador");

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
  const gen = await descarga(A, () => A.click("#btnGen"));
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

  await A.click('.steps button[data-step="3"]'); await U.click('.steps button[data-step="3"]');
  await A.click('#tbFuentes tr[data-f="SEP"]'); await U.click('#tbFuentes tr[data-f="PIE"]');
  await esperar(A, () => !document.getElementById("btnGen").disabled); await esperar(U, () => !document.getElementById("btnGen").disabled);
  const [gA, gU] = await Promise.all([descarga(A, () => A.click("#btnGen")), descarga(U, () => U.click("#btnGen"))]).catch(async e => { console.log("toast A:", await toastTxt(A), "| toast U:", await toastTxt(U)); throw e });
  await esperar(A, () => document.querySelectorAll("#tbBit tr[data-id]").length === 3);
  const nums = await A.$$eval("#tbBit tr[data-id]", trs => trs.map(t => t.dataset.id).sort());
  assert.deepEqual(nums, ["1", "2", "3"]);
  log("dos usuarios generando a la vez: nóminas", nums.join(", "), "sin repetir número;", gA.nombre, gU.nombre);

  // ---------- paso 4: carga, resultado, rechazo y reintegro ----------
  await A.click('.steps button[data-step="4"]');
  await A.click('#tbBit tr[data-id="1"]');
  await A.click("#nCargar");
  await esperar(A, () => document.querySelector("#hDetail .tag")?.textContent.includes("Cargada"));
  await A.selectOption('#hDetail [data-pe="1"]', "rechazado");
  await esperar(A, () => document.querySelector('#hDetail [data-pm="1"]'));
  await A.fill('#hDetail [data-pm="1"]', "cuenta inexistente"); await A.press('#hDetail [data-pm="1"]', "Tab");
  await esperar(A, () => document.querySelector('#hDetail [data-pr="1"]'));
  await A.click('#hDetail [data-pr="1"]');
  await esperar(A, () => document.getElementById("cntDocs").textContent === "2/2");
  await A.click("#nPagarRest");
  await esperar(A, () => /Procesada/.test(document.querySelector("#hDetail .tag")?.textContent));
  await esperar(A, () => document.querySelectorAll("#nHist li").length >= 5);
  const histN1 = await A.$$eval("#nHist li b", b => b.map(x => x.textContent));
  log("historial de la nómina 1:", histN1.join(" → "));
  await A.click('.steps button[data-step="2"]');
  assert.match(await A.textContent("#tbDocs"), /Rechazado en nómina N° 1: cuenta inexistente/);
  log("pago rechazado vuelve a pendientes con su motivo");

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
  await A.screenshot({ path: AQUI + "escritorio_paso4.png", fullPage: true });
  const M = await panel(USUARIO, true); await listo(M);
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

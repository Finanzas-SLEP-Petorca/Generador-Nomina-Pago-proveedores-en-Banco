// Compara el panel nuevo con el de referencia usando el código de la propia
// referencia (referencia/panel_actual_claude.html), ejecutado en un sandbox.
// Verifica que el .txt sea idéntico byte a byte y que las validaciones, la
// ingestión y la planilla del banco den lo mismo.
//   node tests/formato.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = await import(path.join(raiz, "js/formato.js"));
const I = await import(path.join(raiz, "js/importar.js"));
const C = await import(path.join(raiz, "js/catalogos.js"));

// ---------- cargar la lógica de la referencia ----------
const html = readFileSync(path.join(raiz, "referencia/panel_actual_claude.html"), "utf8");
const script = html.slice(html.indexOf("<script>\n") + 9, html.lastIndexOf("</script>"));
const logica = script.slice(0, script.indexOf("// ---------- UI ----------"));
const extraer = nombre => { const i = script.indexOf("function " + nombre + "("); const j = script.indexOf("\n}\n", i); return script.slice(i, j + 3) };
const unaLinea = nombre => { const i = script.indexOf("function " + nombre + "("); return script.slice(i, script.indexOf("\n", i)) };
const ctx = vm.createContext({ console });
vm.runInContext(logica + "\n" + extraer("activeIndex") + "\n" + extraer("nomStatus") + "\n" + unaLinea("resultDue") + "\n" + unaLinea("fmtDue") + "\nconst DIAS=[\"dom\",\"lun\",\"mar\",\"mié\",\"jue\",\"vie\",\"sáb\"];", ctx);
const ref = code => vm.runInContext(code, ctx);
const setRef = (k, v) => { ctx.__v = JSON.parse(JSON.stringify(v)); ref(`${k}=__v`) };

let pruebas = 0;
const ok = (nombre, fn) => { fn(); pruebas++; console.log("  ✓ " + nombre) };

// ---------- catálogos ----------
ok("catálogos idénticos", () => {
  for (const k of ["BANCOS", "FORMAS", "SECTORES", "TIPOS"]) assert.deepEqual(C[k], JSON.parse(JSON.stringify(ref(k))), k);
});

// ---------- datos de prueba ficticios y reproducibles ----------
let semilla = 20260926;
const rnd = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
const elegir = a => a[Math.floor(rnd() * a.length)];
const rutFicticio = () => { const b = String(1000000 + Math.floor(rnd() * 98000000)); return b + F.dvOf(b) };
const NOMBRES = ["Comercial Ñandú Limitada", "SERVICIOS ÁGILES SPA", "José Pérez González", "Constructora 3 Hermanos", "Editorial El Árbol", "Transportes Río Petorca E.I.R.L."];

function dataset() {
  const maestro = {}, docs = [], ruts = [];
  for (let i = 0; i < 25; i++) {
    let rut = rutFicticio();
    if (i === 3) rut = rut.slice(0, -1) + (rut.slice(-1) === "1" ? "2" : "1"); // DV inválido
    const banco = i % 7 === 0 ? "012" : elegir(C.BANCOS)[0];
    const p = { rut, nombre: F.cleanName(elegir(NOMBRES) + (i % 5 === 0 ? "" : " " + "ABCDEFGHIJ"[i % 10])), email: i % 4 === 0 ? "" : "prov" + i + "@ejemplo.cl", banco, forma: i === 5 ? "02" : "01", cuenta: i % 7 === 0 ? rut.slice(0, -1) : String(Math.floor(rnd() * 1e12)), sector: i === 8 ? "99" : elegir(C.SECTORES)[0] };
    if (i === 10) p.cuenta = rut.replace("K", "0");
    maestro[rut] = p; ruts.push(rut);
  }
  const fuentes = ["GENERAL", "SEP", "PIE", "FAEP"];
  for (let i = 0; i < 120; i++) {
    const rut = i === 7 ? "111111111" : elegir(ruts);
    docs.push({ id: "d" + i, rut, fecha: i === 9 ? "" : F.two(1 + Math.floor(rnd() * 28)) + F.two(1 + Math.floor(rnd() * 12)) + "2026", monto: i === 11 ? 0 : 1000 + Math.floor(rnd() * 5e6), ndoc: String(100 + (i % 90)), tipo: i % 17 === 0 ? "61" : elegir(["33", "34", "30", "39"]), fuente: elegir(fuentes), sel: i % 9 !== 0, dc: i % 3 ? "DC " + i : undefined });
  }
  const nominas = [{ num: 1, estado: "cargada", fechaCarga: "2026-09-01", fuente: "SEP", pagos: [{ rut: docs[1].rut, estado: "pagado", docs: [{ ndoc: docs[1].ndoc, tipo: docs[1].tipo }] }, { rut: docs[2].rut, estado: "pendiente", docs: [{ ndoc: docs[2].ndoc, tipo: docs[2].tipo }] }] }];
  return { maestro, docs, nominas, fuentes };
}

// ---------- nómina y .txt ----------
ok(".txt idéntico byte a byte, mismas validaciones y totales", () => {
  const cob = { lineas: 0, errs: 0, warns: 0, agrupados: 0 };
  for (let vuelta = 0; vuelta < 8; vuelta++) {
    const { maestro, docs, nominas, fuentes } = dataset();
    const group = vuelta % 2 === 0, email = vuelta % 3 ? "finanzas@sleppetorca.gob.cl" : "";
    setRef("maestro", maestro); setRef("docs", docs); setRef("nominas", nominas);
    ref(`config.group=${group};config.email=${JSON.stringify(email)};config.fuentes=${JSON.stringify(fuentes)}`);
    assert.deepEqual(F.activeFuentes(docs, fuentes), JSON.parse(JSON.stringify(ref("activeFuentes()"))));
    for (const f of fuentes) {
      const a = ref(`build(${JSON.stringify(f)})`);
      const b = F.build(f, { docs, maestro, nominas, group, email });
      const txtA = ref(`toTxt(build(${JSON.stringify(f)}).lines)`), txtB = F.toTxt(b.lines);
      assert.equal(Buffer.from(txtB, "utf8").compare(Buffer.from(txtA, "utf8")), 0, `txt distinto en ${f}`);
      assert.ok(txtB.endsWith("\r\n"));
      assert.deepEqual(b.lines.map(l => [l.tipo, l.f]), JSON.parse(JSON.stringify(a.lines.map(l => [l.type, l.f]))));
      assert.deepEqual(JSON.parse(JSON.stringify(b.issues)), JSON.parse(JSON.stringify(a.issues)), `avisos distintos en ${f}`);
      for (const k of ["total", "nBen", "nDocs", "errs", "warns"]) assert.equal(b[k], a[k], k);
      assert.deepEqual(b.ids, JSON.parse(JSON.stringify(a.ids)));
      cob.lineas += b.lines.length; cob.errs += b.errs; cob.warns += b.warns; cob.agrupados += b.groups.filter(g => g.docs.length > 1).length;
    }
  }
  // Los datos de prueba deben ejercitar errores, avisos y agrupación.
  for (const k in cob) assert.ok(cob[k] > 0, "sin cobertura de " + k);
});

ok("validaciones de proveedor y documento", () => {
  const casos = [{ rut: "76.123.456-0", nombre: "Ñuñoa Árboles Ltda.", email: "", banco: "12", forma: "2", cuenta: "12-34.56K", sector: "64" },
    { rut: "", nombre: "", email: "x", banco: "999", forma: "03", cuenta: "", sector: "" },
    { rut: "123456785", nombre: "A".repeat(70), email: "a".repeat(41) + "@x.cl", banco: "001", forma: "02", cuenta: "1".repeat(18), sector: "64" }];
  for (const p of casos) for (const em of ["", "finanzas@sleppetorca.gob.cl"]) {
    ref(`config.email=${JSON.stringify(em)}`);
    ctx.__p = p; assert.deepEqual(F.checkProv(p, em), JSON.parse(JSON.stringify(ref("checkProv(__p)"))));
  }
  for (const d of [{ rut: "1-9", fecha: "", monto: NaN, ndoc: "12a", tipo: "7" }, { rut: "11111111-1", fecha: "01012026", monto: 12345678901, ndoc: "12345678901", tipo: "33" }]) {
    ctx.__d = d; assert.deepEqual(JSON.parse(JSON.stringify(F.checkDoc(d))), JSON.parse(JSON.stringify(ref("checkDoc(__d)"))));
  }
  for (const v of ["11/09/2026", "20260911", "11092026", "2026-09-11", "1/2/26", 46000, "31022026", "", "hola"]) { ctx.__x = v; assert.equal(F.parseFecha(v), ref("parseFecha(__x)"), String(v)) }
  for (const v of ["$1.234.567", "1234,50", 12.6, "-5", "abc", "", "1.000,00"]) { ctx.__x = v; assert.deepEqual(F.parseMonto(v), ref("parseMonto(__x)"), String(v)) }
  for (const v of [" 00012-3 ", 1.2345678901234e11, "cta ab12"]) { ctx.__x = v; assert.equal(F.normCuenta(v), ref("normCuenta(__x)")) }
});

// ---------- ingestión ----------
const sinDc = r => ({ provs: r.provs, newDocs: r.newDocs.map(({ dc, ...d }) => d) });
ok("ingestión igual a la referencia (pegar 5, 6, 7, 11, 12 y 13 columnas, encabezados)", () => {
  const txts = [
    "111111111\t11/09/2026\t630000\t405\t34",
    "111111111\t11/09/2026\t630000\t405\t34\tSEP\n123456785;20260912;1.000;406;33;PIE",
    "RUT\tNombre\tEmail\tBanco\tForma\tCuenta\tSector\n111111111\tUNO LTDA\t\t12\t1\t11111111\t64",
    "111111111\tUNO LTDA\t\t012\t01\t11111111\t64\t01/09/2026\t1000\t55\t33\n123456785\tDOS SPA\ta@b.cl\t001\t01\t998877\t64\t02/09/2026\t2000\t56\t34\tFAEP",
    "Fuente\tRUT proveedor\tFecha\tMonto\tN° doc\tTipo\n SEP\t11.111.111-1\t01/09/2026\t$5.000\t77\t33",
  ];
  for (const t of txts) {
    const a = ref(`ingest(parsePaste(${JSON.stringify(t)}),"")`), b = I.ingest(I.parsePaste(t), "");
    assert.deepEqual(sinDc(b), JSON.parse(JSON.stringify(a)), t);
  }
  // Columna DC: 7ª en el formato corto, 13ª en el completo, o por encabezado.
  assert.equal(I.ingest(I.parsePaste("111111111\t11/09/2026\t630000\t405\t34\tSEP\tDC 54"), "").newDocs[0].dc, "DC 54");
  assert.equal(I.ingest(I.parsePaste("111111111\tUNO\t\t012\t01\t1\t64\t01/09/2026\t1000\t55\t33\tSEP\tDC 9"), "").newDocs[0].dc, "DC 9");
  const h = I.ingest(I.parsePaste("RUT\tFECHA DOC\tMONTO\tN° DOC\tTIPO DOC\tFUENTE\tDC\n111111111\t11/09/2026\t630000\t405\t34\tSEP\tDC 54"), "");
  assert.equal(h.newDocs[0].dc, "DC 54"); assert.equal(h.newDocs[0].ndoc, "405"); assert.equal(h.newDocs[0].fuente, "SEP");
});

ok("planilla de pago anterior del banco reconstruye proveedores y documentos", () => {
  const { maestro, docs, nominas } = dataset();
  const r = F.build("SEP", { docs: docs.map(d => ({ ...d, sel: true, fecha: d.fecha || "01012026", monto: d.monto || 5 })), maestro: Object.fromEntries(Object.entries(maestro).filter(([k]) => F.rutOk(k))), nominas: [], group: true, email: "finanzas@sleppetorca.gob.cl" });
  const txt = F.toTxt(r.lines);
  const rows = I.parseDelimitado(txt);
  assert.ok(I.isBankSheet(rows));
  const ing = I.ingest(rows, "SEP");
  assert.deepEqual(sinDc(ing), JSON.parse(JSON.stringify(ref(`ingest(parsePaste(${JSON.stringify(txt)}),"SEP")`))));
  const prep = I.prepararIngesta(ing, { maestro: {}, fuentes: ["GENERAL", "SEP"], defFuente: "GENERAL" });
  assert.equal(prep.docs.length, r.lines.filter(l => l.tipo === 2).length);
  // Volver a armar la nómina con lo importado da el mismo archivo.
  const m2 = Object.fromEntries(prep.provs.map(c => [c.despues.rut, c.despues]));
  const r2 = F.build("SEP", { docs: prep.docs.map((d, i) => ({ ...d, id: "x" + i })), maestro: m2, nominas: [], group: true, email: "finanzas@sleppetorca.gob.cl" });
  assert.equal(F.toTxt(r2.lines), txt);
});

ok("prepararIngesta equivale a applyIngest de la referencia", () => {
  const t = "111111111\tUNO LTDA\t\t012\t\t11111111\t64\t01/09/2026\t1000\t55\t33\tsep\n111111111\tUNO LTDA\tuno@x.cl\t\t\t\t\t02/09/2026\tabc\t56\t33\tMANTENCION";
  const prev = { "111111111": { rut: "111111111", nombre: "VIEJO", email: "v@x.cl", banco: "001", forma: "01", cuenta: "5", sector: "64" } };
  setRef("maestro", prev); setRef("docs", []); ref(`config.fuentes=["GENERAL","SEP"];config.defFuente="GENERAL";renderAll=()=>{};toast=()=>{}`);
  ref(`applyIngest(ingest(parsePaste(${JSON.stringify(t)}),""))`);
  const p = I.prepararIngesta(I.ingest(I.parsePaste(t), ""), { maestro: prev, fuentes: ["GENERAL", "SEP"], defFuente: "GENERAL" });
  assert.deepEqual(p.provs[0].despues, JSON.parse(JSON.stringify(ref("maestro")))["111111111"]);
  assert.deepEqual(p.provs[0].antes, prev["111111111"]);
  const refDocs = JSON.parse(JSON.stringify(ref("docs")));
  // Diferencia buscada: el documento con monto inválido no se guarda (Firestore exige entero > 0).
  assert.equal(refDocs.length, 2); assert.equal(p.docs.length, 1); assert.equal(p.rechazados.length, 1);
  const { id, ...d0 } = refDocs[0]; assert.deepEqual(p.docs[0], d0);
});

ok("CSV del maestro exportado en el paso 1 se lee sin perder ceros", () => {
  const csv = "﻿RUT;NOMBRE;EMAIL;BANCO;FORMA DE PAGO;N CUENTA;SECTOR\r\n111111111;\"UNO; Y DOS\";;012;01;00012345678901234;64\r\n";
  const r = I.ingest(I.parseDelimitado(csv), "");
  assert.equal(r.provs.length, 1); assert.equal(r.provs[0].cuenta, "00012345678901234"); assert.equal(r.provs[0].nombre, "UNO; Y DOS");
});

// ---------- bitácora ----------
ok("estado de nóminas y día hábil siguiente (con feriados)", () => {
  const n = { estado: "cargada", fechaCarga: "2026-09-17", pagos: [{ estado: "pendiente" }] };
  const due = F.resultDue("2026-09-17", ["2026-09-18"]);
  assert.equal(F.todayISO(due), "2026-09-21"); assert.equal(due.getHours(), 14);
  assert.equal(F.todayISO(F.resultDue("2026-09-17")), F.todayISO(new Date(ref(`resultDue("2026-09-17")`))));
  for (const pagos of [[{ estado: "pendiente" }], [{ estado: "rechazado", reint: "" }, { estado: "pagado" }], [{ estado: "rechazado", reint: "2026-01-01" }], [{ estado: "pagado" }]])
    for (const estado of ["generada", "cargada", "anulada"]) {
      const m = { ...n, estado, pagos }; ctx.__n = m;
      assert.deepEqual(F.nomStatus(m), JSON.parse(JSON.stringify(ref("nomStatus(__n)"))));
    }
});

ok("resultado desde las 14:00 del día de pago", () => {
  const fer = ["2026-10-12"];
  const f = n => { const t = F.resultadoDesde(n, fer); return F.todayISO(t) + " " + t.getHours() };
  assert.equal(f({ fechaCarga: "2026-09-26", fechaPago: "2026-09-29" }), "2026-09-29 14"); // carga sáb, pago mar → mar 14:00
  assert.equal(f({ fechaCarga: "2026-09-25", fechaPago: "2026-09-26" }), "2026-09-28 14"); // pago sáb → lun
  assert.equal(f({ fechaCarga: "2026-10-09", fechaPago: "2026-10-12" }), "2026-10-13 14"); // pago feriado → hábil siguiente
  assert.equal(f({ fechaCarga: "2026-09-25" }), "2026-09-28 14");                          // sin fecha de pago: regla anterior
  assert.equal(F.esHabil("2026-09-26"), false); assert.equal(F.esHabil("2026-09-29"), true); assert.equal(F.esHabil("2026-10-12", fer), false);
  assert.equal(F.nombreDe("juana.perez@sleppetorca.gob.cl"), "Juana Perez");
});

ok("nombre de archivo", () => {
  const d = new Date(2026, 8, 26);
  assert.equal(F.fileName(F.expandPrefijo("AAAAMMDD_PAGO_PROVEEDORES", d), "SEP"), "20260926_PAGO_PROVEEDORES_SEP");
  assert.equal(F.fileName("X_.txt", "MANTENCION ESCUELAS"), "X_MANTENCION_ESCUELAS");
  // La fuente no se repite aunque el prefijo ya la traiga (ni otra fuente conocida).
  const fs = ["GENERAL", "SEP", "PIE", "FAEP", "MANTENCION ESCUELAS"];
  assert.equal(F.fileName("20260926_PAGO_PROVEEDORES_SEP", "SEP", d, fs), "20260926_PAGO_PROVEEDORES_SEP");
  assert.equal(F.fileName("20260926_PAGO_PROVEEDORES_sep_", "SEP", d, fs), "20260926_PAGO_PROVEEDORES_SEP");
  assert.equal(F.fileName("20260926_PAGO_PROVEEDORES_PIE", "SEP", d, fs), "20260926_PAGO_PROVEEDORES_SEP");
  assert.equal(F.fileName("X_MANTENCION_ESCUELAS", "MANTENCION ESCUELAS", d, fs), "X_MANTENCION_ESCUELAS");
  assert.equal(F.fileName("SEP", "SEP", d, fs), "SEP_SEP"); // un prefijo que es solo la fuente se respeta
  assert.equal(F.nombreNomina({ archivo: "20260926_PAGO_PROVEEDORES_SEP_SEP", fuente: "SEP" }), "20260926_PAGO_PROVEEDORES_SEP");
  assert.equal(F.nombreNomina({ archivo: "20260926_PAGO_PROVEEDORES_SEP", fuente: "SEP" }), "20260926_PAGO_PROVEEDORES_SEP");
});

// ---------- remuneraciones y abonos (7 columnas) ----------
ok("abonos: validación de la planilla de 7 columnas", () => {
  const base = { rut: "11.111.111-1", nombre: "Víctor Muñoz Pérez", email: "", banco: "12", forma: "29", cuenta: "", monto: 150000 };
  let c = F.checkAbono(base, "finanzas@sleppetorca.gob.cl");
  assert.deepEqual(c.e, []); assert.equal(c.out.nombre, "VICTOR MUNOZ PEREZ"); assert.equal(c.out.cuenta, ""); // pago cash: cuenta en blanco assert.equal(c.out.banco, "012");
  assert.equal(c.out.email, "finanzas@sleppetorca.gob.cl");
  c = F.checkAbono({ ...base, forma: "30", cuenta: "" }); assert.equal(c.out.cuenta, "11111111");
  c = F.checkAbono({ ...base, forma: "30", cuenta: "123" }); assert.match(c.w.join(), /CuentaRUT/);
  c = F.checkAbono({ ...base, forma: "29", banco: "001" }); assert.match(c.e.join(), /solo sirve con BancoEstado/);
  c = F.checkAbono({ ...base, forma: "01", banco: "001", cuenta: "" }); assert.match(c.e.join(), /falta número de cuenta/);
  c = F.checkAbono({ ...base, forma: "05" }); assert.match(c.e.join(), /forma de pago 05 no válida/);
  c = F.checkAbono({ ...base, monto: 0 }); assert.match(c.e.join(), /monto/);
  c = F.checkAbono({ ...base, rut: "11111111-2" }); assert.match(c.e.join(), /dígito verificador/);
});

ok("abonos: nómina, .txt de 7 columnas y avisos", () => {
  const ab = [
    { id: "a", rut: "111111111", nombre: "UNO", email: "", banco: "012", forma: "29", cuenta: "0", monto: 1000, fuente: "SEP", sel: true, concepto: "FONDOS FIJOS" },
    { id: "b", rut: "123456785", nombre: "DOS", email: "d@x.cl", banco: "001", forma: "01", cuenta: "555", monto: 2000, fuente: "SEP", sel: true, concepto: "VIATICOS" },
    { id: "c", rut: "111111111", nombre: "UNO", email: "", banco: "012", forma: "29", cuenta: "0", monto: 1000, fuente: "SEP", sel: true, concepto: "FONDOS FIJOS" },
    { id: "d", rut: "123456785", nombre: "DOS", email: "", banco: "001", forma: "01", cuenta: "555", monto: 9, fuente: "PIE", sel: true },
    { id: "e", rut: "123456785", nombre: "DOS", email: "", banco: "001", forma: "01", cuenta: "555", monto: 9, fuente: "SEP", sel: false },
  ];
  const nominas = [{ num: 4, tipo: "abonos", estado: "cargada", pagos: [{ rut: "123456785", banco: "001", forma: "01", cuenta: "999", monto: 2000, estado: "pendiente" }] }];
  const r = F.buildAbonos("SEP", { abonos: ab, nominas, group: false, email: "fin@x.cl" });
  assert.equal(r.nBen, 3); assert.equal(r.total, 4000); assert.equal(r.errs, 0);
  assert.equal(F.toTxt(r.lines), "111111111\tUNO\tfin@x.cl\t012\t29\t\t1000\r\n123456785\tDOS\td@x.cl\t001\t01\t555\t2000\r\n111111111\tUNO\tfin@x.cl\t012\t29\t\t1000\r\n");
  assert.equal(F.checkAbono({ rut: "111111111", nombre: "UNO", banco: "012", forma: "29", cuenta: "123", monto: 5 }).out.cuenta, "");
  const msgs = r.issues.map(i => i.msg).join(" | ");
  assert.match(msgs, /más de una vez/); assert.match(msgs, /nómina N° 4, aún sin resultado/); assert.match(msgs, /datos bancarios cambiaron/);
  const g = F.buildAbonos("SEP", { abonos: ab, nominas: [], group: true });
  assert.equal(g.nBen, 2); assert.equal(g.groups[0].docs.length, 2); assert.equal(g.lines[0].f[6], "2000");
  // Las nóminas de abonos no cuentan como documentos pagados de proveedores.
  assert.deepEqual(F.activeIndex(nominas), {});
  assert.equal(F.conceptoDeNombre("20260917 - REPOSICION FONDOS FIJOS EE.xlsx"), "FONDOS FIJOS");
  assert.equal(F.conceptoDeNombre("honorarios_sep.xlsx"), "HONORARIOS");
});

ok("abonos: importar la hoja DETALLE del banco y filas pegadas", () => {
  const detalle = [["", "", "Pago", "", "", "", "Versión 1.1"], ["", "", "(7 Columnas)"], ["RUT", "NOMBRES Y APELLIDOS O RAZÓN SOCIAL", "EMAIL", "BANCO", "FORMA DE PAGO", "Nº DE CUENTA", "MONTO DEL PAGO"],
    [111111111, "José Ñuñez", "FINANZAS@SLEPPETORCA.GOB.CL", "012", "29", "", 150000], ["12345678-5", "ANA", "", 1, 1, 12345678901, "$1.500"], ["", "", "", "", "", "", ""]];
  const f = I.ingestAbonos(detalle);
  assert.equal(f.length, 2);
  const p = I.prepararAbonos(f, { fuentes: ["GENERAL"], defFuente: "GENERAL", concepto: "FONDOS FIJOS" });
  assert.equal(p.abonos.length, 2); assert.equal(p.abonos[0].nombre, "JOSE NUNEZ"); assert.equal(p.abonos[1].banco, "001"); assert.equal(p.abonos[1].forma, "01");
  assert.equal(p.abonos[1].cuenta, "12345678901"); assert.equal(p.abonos[1].monto, 1500); assert.equal(p.corregidos, 1);
  const pegado = I.ingestAbonos(I.parsePaste("111111111\tUNO\t\t012\t30\t11111111\t5000\tSEP\tFondo fijo escuela"));
  const q = I.prepararAbonos(pegado, { fuentes: ["GENERAL"], defFuente: "GENERAL", concepto: "" });
  assert.equal(q.abonos[0].fuente, "SEP"); assert.equal(q.abonos[0].glosa, "Fondo fijo escuela"); assert.deepEqual(q.nuevasFuentes, ["SEP"]); assert.equal(q.abonos[0].concepto, "REMUNERACIONES");
  const malo = I.prepararAbonos(I.ingestAbonos(I.parsePaste("111111111\tUNO\t\t012\t30\t1\tabc")), { fuentes: [], defFuente: "GENERAL" });
  assert.equal(malo.abonos.length, 0); assert.equal(malo.rechazados.length, 1);
});

// Excel de 7 columnas: se arma desde la plantilla del banco y al reimportarlo da el mismo .txt.
{
  globalThis.XLSX = require(path.join(raiz, "vendor/xlsx-0.18.5.full.min.js"));
  globalThis.JSZip = require(path.join(raiz, "vendor/jszip-3.10.1.min.js"));
  globalThis.fetch = async p => ({ ok: true, arrayBuffer: async () => { const b = readFileSync(path.join(raiz, p)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length) } });
  const E = await import(path.join(raiz, "js/excel.js"));
  const ab = [["111111111", "UNO", "", "012", "29", "0", 1000], ["123456785", "DOS DOS", "d@x.cl", "001", "01", "00012345678901234", 25000], ["22222222" + F.dvOf("22222222"), "TRES", "", "012", "30", "22222222", 7]]
    .map(([rut, nombre, email, banco, forma, cuenta, monto], i) => ({ id: "x" + i, rut, nombre, email, banco, forma, cuenta, monto, fuente: "SEP", sel: true }));
  const r = F.buildAbonos("SEP", { abonos: ab, nominas: [] });
  const bytes = await E.abonosWorkbook(r.lines);
  const wb = XLSX.read(bytes, { type: "array" });
  ok("abonos: Excel de 7 columnas desde la plantilla del banco", () => {
    assert.deepEqual(wb.SheetNames, ["DETALLE", "Bancos", "Forma de Pago", "Instructivo", "Ejemplo", "pasos para txt"]);
    const filas = I.ingestAbonos(XLSX.utils.sheet_to_json(wb.Sheets.DETALLE, { header: 1, raw: true, defval: "" }));
    const p = I.prepararAbonos(filas, { fuentes: ["SEP"], defFuente: "SEP" });
    const r2 = F.buildAbonos("SEP", { abonos: p.abonos.map((a, i) => ({ ...a, id: "y" + i })), nominas: [] });
    assert.equal(F.toTxt(r2.lines), F.toTxt(r.lines));
    assert.equal(wb.Sheets.DETALLE.F5.v, "00012345678901234"); // la cuenta va como texto, sin perder ceros
    assert.equal(wb.Sheets.DETALLE.G4.t, "n");                  // el monto va como número
  });
}

ok("index.html con las versiones de los archivos al día", () => {
  const { execFileSync } = require("node:child_process");
  execFileSync(process.execPath, [path.join(raiz, "tests/versionar.mjs"), "--revisar"], { stdio: "pipe" });
});

console.log(`\n${pruebas} pruebas OK`);

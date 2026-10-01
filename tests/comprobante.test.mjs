// Lectura del comprobante PDF de una transferencia electrónica de BancoEstado.
//   node tests/comprobante.test.mjs
//
// El texto de ejemplo reproduce lo que entrega el OCR sobre un Detalle de
// Transferencia real (mismos rótulos, mismo orden y los mismos errores típicos
// del OCR, como "N*" por "N°" u "O" por "@"), pero con N°, RUT, nombres,
// cuentas y montos inventados. Los PDF de prueba se arman aquí mismo, con la
// estructura del PDF del banco: no entran comprobantes reales al repositorio.
import assert from "node:assert/strict";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { leerComprobante, esComprobante, imagenComprobante, codigoBanco, combinacionExacta } = await import(path.join(raiz, "js/comprobante.js"));
const { dvOf, fmtRut } = await import(path.join(raiz, "js/formato.js"));

let ok = 0;
const prueba = async (nombre, fn) => { await fn(); ok++; console.log("  ✓ " + nombre) };
const rut = b => fmtRut(b + dvOf(b));
const [R_BEN, R_PREP, R_AUT1, R_AUT2] = ["77777777", "11111111", "22222222", "33333333"].map(rut);

// ---------- texto como lo entrega el OCR ----------
const ocr = ({ num = "9100001", estado = "Autorizada", benef = `AGUAS DE PRUEBA S.A. | ${R_BEN} | BANCO DEL ESTADO DE CHILE | Cuenta Corriente 000000012345678901`, mensaje = "MEMO 99", etapas = true, monto = "$1.234.567", concepto = "AGUA EE" } = {}) => [
  `Detalle Transferencia Electrónica | N* ${num}`,
  "edo", "E)", "- >)", // ruido del timbre del banco
  "Fecha Transacción ID TEF Estado “E",
  `15/09/2026 - 10:05 5550001234 ${estado} Barc`,
  "Cuenta Origen",
  "11100000001 | Subvencion General",
  "Beneficiario",
  "AGUAS DE PRUEBA",
  benef,
  "facturacionOejemplo.cl;",
  "Monto Concepto",
  `${monto} ${concepto}`.trim(),
  "Mensaje a Beneficiario",
  ...(mensaje ? [mensaje] : []),
  ...(etapas ? ["Etapas", "1. Preparación 2. Autorización 3. Ejecución"] : []),
  "Intervinientes",
  "Rut Nombre Fecha Acción",
  "",
  `${R_PREP} Persona Prepara 15/09/2026 - 09:58 Preparación O`,
  "",
  `${R_AUT1} PERSONA AUTORIZA UNO CON NOMBRE LA... 15/09/2026 - 10:01 Autorizacion 1`,
  `${R_AUT2} Persona Autoriza Dos 15/09/2026 - 10:05 Autorizacion 2`,
  ""
].join("\n");

await prueba("lee todos los campos del detalle de una transferencia", () => {
  const t = leerComprobante(ocr());
  assert.deepEqual(t.avisos, []);
  assert.equal(t.operacion, "9100001");
  assert.equal(t.idTef, "5550001234");
  assert.equal(t.fecha, "2026-09-15"); assert.equal(t.hora, "10:05");
  assert.equal(t.estado, "Autorizada");
  assert.equal(t.cuentaOrigen, "11100000001"); assert.equal(t.cuentaNombre, "Subvencion General");
  assert.equal(t.alias, "AGUAS DE PRUEBA");
  assert.deepEqual(t.benef, { rut: "77777777" + dvOf("77777777"), nombre: "AGUAS DE PRUEBA S.A.", banco: "012", bancoNombre: "BANCO DEL ESTADO DE CHILE", tipoCuenta: "Cuenta Corriente", cuenta: "12345678901" });
  assert.equal(t.monto, 1234567); assert.equal(t.concepto, "AGUA EE"); assert.equal(t.mensaje, "MEMO 99");
  assert.deepEqual(t.intervinientes.map(i => i.accion), ["Preparación", "Autorización 1", "Autorización 2"]);
  assert.equal(t.preparo, "Persona Prepara");
  assert.equal(t.autorizo, "PERSONA AUTORIZA UNO CON NOMBRE LA…, Persona Autoriza Dos"); // el banco corta los nombres largos
  assert.ok(esComprobante(ocr()));
  assert.ok(!esComprobante("Detalle Nómina\nConvenio"));
});

await prueba("el comprobante (sin etapas) y sin mensaje al beneficiario", () => {
  const t = leerComprobante(ocr({ etapas: false, mensaje: "" }));
  assert.equal(t.mensaje, "");
  assert.equal(t.intervinientes.length, 3);
  assert.deepEqual(t.avisos, []);
});

await prueba("CuentaRUT: la cuenta es el RUT sin dígito verificador, y se controla", () => {
  const b = "12345678", r = rut(b);
  let t = leerComprobante(ocr({ benef: `PERSONA DE PRUEBA | ${r} | BANCO DEL ESTADO DE CHILE | Cuenta Rut 0000000000${b}` }));
  assert.equal(t.benef.cuenta, b); assert.equal(t.benef.tipoCuenta, "Cuenta Rut"); assert.deepEqual(t.avisos, []);
  t = leerComprobante(ocr({ benef: `PERSONA DE PRUEBA | ${r} | BANCO DEL ESTADO DE CHILE | Cuenta Rut 000000000087654321` }));
  assert.match(t.avisos.join(" "), /CuentaRUT leída no coincide/);
});

await prueba("avisa lo que no cuadra: estado, dígito verificador, banco, monto", () => {
  assert.match(leerComprobante(ocr({ estado: "Rechazada" })).avisos.join(" "), /“Rechazada”, no autorizada/);
  const malo = R_BEN.slice(0, -1) + (R_BEN.endsWith("1") ? "2" : "1"); // un dígito mal leído
  assert.match(leerComprobante(ocr({ benef: `AGUAS | ${malo} | BANCO DEL ESTADO DE CHILE | Cuenta Corriente 1234567` })).avisos.join(" "), /dígito verificador válido/);
  assert.match(leerComprobante(ocr({ benef: `AGUAS | ${R_BEN} | BANCO INVENTADO | Cuenta Corriente 1234567` })).avisos.join(" "), /Banco del beneficiario no reconocido/);
  assert.match(leerComprobante(ocr({ monto: "", concepto: "" })).avisos.join(" "), /No se leyó el monto/);
  const vacio = leerComprobante("texto cualquiera");
  assert.ok(vacio.avisos.length >= 5);
});

await prueba("código del banco desde el nombre que muestra BancoEstado", () => {
  assert.equal(codigoBanco("BANCO DEL ESTADO DE CHILE"), "012");
  assert.equal(codigoBanco("BANCO DE CHILE"), "001");
  assert.equal(codigoBanco("BANCO SANTANDER-CHILE"), "037");
  assert.equal(codigoBanco("BANCO DE CREDITO E INVERSIONES"), "016");
  assert.equal(codigoBanco("SCOTIABANK CHILE"), "014");
  assert.equal(codigoBanco("COOPEUCH"), "672");
  assert.equal(codigoBanco("BANCO INVENTADO"), "");
});

await prueba("qué paga: la única combinación de pendientes que suma el monto", () => {
  const it = [{ id: "a", monto: 100 }, { id: "b", monto: 250 }, { id: "c", monto: 50 }];
  assert.deepEqual(combinacionExacta(it, 400).map(x => x.id), ["a", "b", "c"]); // todos
  assert.deepEqual(combinacionExacta(it, 350).map(x => x.id), ["a", "b"]);
  assert.equal(combinacionExacta(it, 999), null);
  assert.equal(combinacionExacta([{ id: "a", monto: 100 }, { id: "b", monto: 100 }], 100), null); // dos posibles: que decida la persona
  // Una nota de crédito resta.
  const nc = [{ id: "f", monto: 300, tipo: "33" }, { id: "n", monto: 50, tipo: "61" }];
  assert.deepEqual(combinacionExacta(nc, 250, x => x.tipo === "61" ? -x.monto : x.monto).map(x => x.id), ["f", "n"]);
  assert.equal(combinacionExacta([], 100), null);
});

// ---------- PDF con la estructura del banco ----------
// Imagen RGB con Flate y máscara de transparencia en escala de grises (como
// el PDF de BancoEstado), una imagen chica de relleno y un JPEG de fondo.
const latin = s => Buffer.from(s, "latin1");
function pdf(objs) {
  const partes = [latin("%PDF-1.3\n")];
  for (const [n, dic, datos] of objs) partes.push(latin(`${n} 0 obj\n<<${dic}${datos ? ` /Length ${datos.length}` : ""}>>\n`), ...(datos ? [latin("stream\n"), datos, latin("\nendstream\n")] : []), latin("endobj\n"));
  partes.push(latin("trailer\n<< /Root 1 0 R >>\n%%EOF\n"));
  return new Uint8Array(Buffer.concat(partes));
}
const W = 4, H = 2;
const rgb = Buffer.from([10, 20, 30, 0, 0, 0, 200, 100, 0, 1, 2, 3, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150]);
const alfa = Buffer.from([255, 0, 128, 255, 255, 255, 255, 255]);
const imagen = (extra = "") => `/Type /XObject /Subtype /Image /BitsPerComponent 8 /Width ${W} /Height ${H} /Filter /FlateDecode /ColorSpace /DeviceRGB /SMask 6 0 R${extra}`;
const mascara = `/Type /XObject /Subtype /Image /Height ${H} /Width ${W} /BitsPerComponent 8 /Filter /FlateDecode /ColorSpace /DeviceGray /Decode [0 1]`;
const relleno = ["3", "/Type /XObject /Subtype /Image /BitsPerComponent 8 /Width 1 /Height 1 /Filter /FlateDecode /ColorSpace /DeviceRGB", deflateSync(Buffer.from([9, 9, 9]))];
const jpeg = ["4", "/Type /XObject /Subtype /Image /BitsPerComponent 8 /Width 50 /Height 50 /ColorSpace /DeviceRGB /Filter /DCTDecode", Buffer.from([0xff, 0xd8, 0xff, 0xd9])];
const pagina = ["1", "/Type /Catalog /Pages 2 0 R", null];
const px = (img, i) => [...img.data.slice(i * 4, i * 4 + 4)];

await prueba("extrae la imagen del PDF del banco, sobre fondo blanco", async () => {
  const img = await imagenComprobante(pdf([pagina, relleno, jpeg, ["5", imagen(), deflateSync(rgb)], ["6", mascara, deflateSync(alfa)]]));
  assert.equal(img.width, W); assert.equal(img.height, H);
  assert.deepEqual(px(img, 0), [10, 20, 30, 255]); // opaco: igual
  assert.deepEqual(px(img, 1), [255, 255, 255, 255]); // transparente: blanco
  assert.deepEqual(px(img, 2), [227, 177, 127, 255]); // a medias: mezcla con blanco
  assert.deepEqual(px(img, 7), [130, 140, 150, 255]);
});

await prueba("también con predictor PNG, /Length indirecto y sin máscara", async () => {
  // Filas con filtro 1 (Sub) y 2 (Up), como las guarda jsPDF desde un PNG.
  const fila = (y, f) => { const r = rgb.subarray(y * W * 3, (y + 1) * W * 3), o = [f]; for (let i = 0; i < r.length; i++) o.push((r[i] - (f === 1 ? (i >= 3 ? r[i - 3] : 0) : y ? rgb[(y - 1) * W * 3 + i] : 0) + 256) & 255); return o };
  const filtrado = deflateSync(Buffer.from([...fila(0, 1), ...fila(1, 2)]));
  const dic = `/Type /XObject /Subtype /Image /Width ${W} /Height ${H} /BitsPerComponent 8 /ColorSpace /DeviceRGB /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${W} >> /Length 9 0 R`;
  const bytes = Buffer.concat([latin("%PDF-1.4\n5 0 obj\n<<" + dic + ">>\nstream\r\n"), filtrado, latin("\r\nendstream\nendobj\n9 0 obj\n" + filtrado.length + "\nendobj\n%%EOF\n")]);
  const img = await imagenComprobante(new Uint8Array(bytes));
  assert.deepEqual([...img.data].filter((_, i) => i % 4 !== 3), [...rgb]);
});

await prueba("un PDF sin la imagen del comprobante devuelve null", async () => {
  assert.equal(await imagenComprobante(pdf([pagina, jpeg])), null);
  assert.equal(await imagenComprobante(latin("no es un pdf")), null);
});

console.log(`\n${ok} pruebas, todas bien.`);

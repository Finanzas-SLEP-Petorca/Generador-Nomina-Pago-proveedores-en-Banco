// Lectura del comprobante PDF de una transferencia en el navegador: extrae la
// imagen del PDF (js/comprobante.js) y la pasa por OCR con Tesseract.js, que
// está en vendor/tesseract y se carga solo al leer el primer comprobante.
// Nada sale del navegador: el OCR corre en un Web Worker local.

import { imagenComprobante, esComprobante, leerComprobante } from "./comprobante.js";

const V = "vendor/tesseract/";
const url = r => new URL(r, document.baseURI).href;
const script = src => new Promise((ok, mal) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => mal(new Error("no se pudo cargar " + src)); document.head.appendChild(s) });
// Soporte de SIMD en WebAssembly (misma prueba que usa Tesseract.js).
const simd = () => { try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])) } catch { return false } };

let trabajador = null, aviso = () => {};
const ETAPAS = { "loading tesseract core": "Cargando el lector", "loading language traineddata": "Cargando el idioma", "initializing api": "Preparando el lector", "recognizing text": "Leyendo el comprobante" };

function cargar() {
  if (!trabajador) trabajador = (async () => {
    if (!globalThis.Tesseract) await script(V + "tesseract-7.0.0.min.js");
    return globalThis.Tesseract.createWorker("spa", 1, {
      workerPath: url(V + "worker-7.0.0.min.js"), workerBlobURL: false,
      corePath: url(V + (simd() ? "tesseract-core-simd-lstm.wasm.js" : "tesseract-core-lstm.wasm.js")),
      langPath: url(V.slice(0, -1)), gzip: true,
      logger: m => { if (ETAPAS[m.status]) aviso(ETAPAS[m.status], m.progress) }
    });
  })().catch(e => { trabajador = null; throw e });
  return trabajador;
}

// Lee un archivo PDF. progreso(texto, 0..1) informa en qué va.
// Devuelve el resultado de leerComprobante, o lanza un Error con el motivo.
export async function leerPdfTransferencia(archivo, progreso = () => {}) {
  aviso = progreso;
  progreso("Abriendo el PDF", 0);
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  if (latin(bytes.subarray(0, 5)) !== "%PDF-") throw new Error("no es un PDF");
  const img = await imagenComprobante(bytes);
  if (!img) throw new Error("el PDF no trae la imagen del comprobante de BancoEstado");
  const lienzo = document.createElement("canvas");
  lienzo.width = img.width; lienzo.height = img.height;
  lienzo.getContext("2d").putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  const w = await cargar();
  const { data } = await w.recognize(lienzo);
  if (!esComprobante(data.text)) throw new Error("no parece un comprobante o detalle de transferencia de BancoEstado");
  return leerComprobante(data.text);
}
const latin = b => String.fromCharCode(...b);

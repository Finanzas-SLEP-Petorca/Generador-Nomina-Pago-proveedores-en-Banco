// Reporte de pagos en PDF (A4 horizontal), con las mismas tablas del Excel.
// Usa jsPDF y jsPDF-AutoTable de vendor/; se cargan solo al pedir el primer PDF.

import { S, reporteTablas, periodoReporte, money, nombreDe } from "./formato.js";

const NAVY = [21, 46, 89], AZUL = [23, 103, 210], TINTA = [30, 41, 59], GRIS = [96, 108, 124], LINEA = [214, 224, 235], SUAVE = [243, 247, 250];
const pesos = v => v < 0 ? "-" + money(-v) : money(v);

// Celda de AutoTable: montos y números a la derecha.
const celda = v => v && typeof v === "object" ? { content: pesos(v.$), styles: { halign: "right" } }
  : typeof v === "number" ? { content: String(v), styles: { halign: "right" } }
  : { content: v == null ? "" : String(v) };

// Fila de totales: la etiqueta ocupa también las celdas vacías que la siguen.
const pie = f => {
  let n = 1; while (n < f.length && (f[n] === "" || f[n] == null)) n++;
  if (n === f.length) n = 1;
  return [{ content: String(f[0]), colSpan: n }, ...f.slice(n).map(celda)];
};

// rep: resultado de reportePagos. meta: { desde, hasta, filtros, generado, por }.
// libs: { jsPDF, autoTable, logo } (logo: data URL PNG, opcional). Devuelve un ArrayBuffer.
export function pdfReporte(rep, meta, { jsPDF, autoTable, logo }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 12;
  doc.setProperties({ title: "Reporte de pagos BancoEstado", subject: "Período " + periodoReporte(meta.desde, meta.hasta), author: meta.por || "", creator: "Generador de nóminas BancoEstado · SLEP Petorca" });

  // Encabezado
  let x = M;
  if (logo) { try { doc.addImage(logo, "PNG", M, 9, 30, 14.4); x = M + 36 } catch { /* sin logo */ } }
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...NAVY);
  doc.text("Reporte de pagos BancoEstado", x, 15.5);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...GRIS);
  doc.text(`Período (fecha de pago): ${periodoReporte(meta.desde, meta.hasta)}${meta.filtros ? " · " + meta.filtros : ""}`, x, 21);
  doc.text(`Generado el ${meta.generado}${meta.por ? " por " + meta.por : ""}`, x, 25.5);
  doc.setFontSize(8); doc.text("Servicio Local de Educación Pública de Petorca", W - M, 15.5, { align: "right" });
  doc.text("Departamento de Finanzas", W - M, 19.5, { align: "right" });
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.6); doc.line(M, 29.5, W - M, 29.5);

  // Totales
  const t = rep.tot, kw = (W - 2 * M - 8) / 3;
  const kpi = (i, titulo, valor, sub, destacado) => {
    const kx = M + i * (kw + 4), ky = 33;
    if (destacado) { doc.setFillColor(...AZUL); doc.roundedRect(kx, ky, kw, 19, 2, 2, "F") }
    else { doc.setFillColor(...SUAVE); doc.setDrawColor(...LINEA); doc.setLineWidth(0.3); doc.roundedRect(kx, ky, kw, 19, 2, 2, "FD") }
    doc.setTextColor(...(destacado ? [255, 255, 255] : TINTA));
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text(titulo, kx + 4, ky + 5.5);
    doc.setFontSize(15); doc.text(valor, kx + 4, ky + 12.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.text(sub, kx + 4, ky + 16.8);
  };
  const pl = (n, s) => n + " " + s + (n === 1 ? "" : "s");
  kpi(0, "Pagado", pesos(t.pagado), `${pl(t.nPagado, "pago")} en ${t.nominas} nómina${t.nominas === 1 ? "" : "s"}`, true);
  kpi(1, "Rechazado", pesos(t.rechazado), pl(t.nRechazado, "pago"));
  kpi(2, "Pendiente de resultado", pesos(t.pendiente), pl(t.nPendiente, "pago"));

  // Tablas
  const T = reporteTablas(rep);
  T.nominas.body = T.nominas.body.map(f => { const g = f.slice(); g[7] = nombreDe(g[7]); return g });
  // En el PDF el banco va con su nombre corto (en el Excel, completo).
  const corto = b => b === "BANCO DEL ESTADO DE CHILE" ? "BANCOESTADO" : S(b).split(" / ")[0];
  T.pagado.body.forEach(f => { f[7] = corto(f[7]) }); T.rechazados.body.forEach(f => { f[7] = corto(f[7]) });
  // Tipo y N° BancoEstado ya están en "Nóminas del período": en el detalle se omiten para que quepa en A4.
  const sin = (tabla, cols) => { const q = f => f.filter((_, i) => !cols.includes(i)); return { head: q(tabla.head), body: tabla.body.map(q), foot: tabla.foot && q(tabla.foot) } };
  const pagadoPdf = sin(T.pagado, [2, 3]), rechazadosPdf = sin(T.rechazados, [2, 3]);
  // Fechas, RUT y montos no se cortan en dos líneas.
  const sinCorte = cols => Object.fromEntries(cols.map(c => [c, { cellWidth: "wrap" }]));
  let y = 60;
  const seccion = (titulo, tabla, vacio, columnStyles = {}) => {
    if (y > H - 45) { doc.addPage(); y = 16 } // el título no queda solo al pie
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...NAVY);
    doc.text(titulo, M, y);
    if (!tabla.body.length) { doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...GRIS); doc.text(vacio, M, y + 5.5); y += 14; return }
    autoTable(doc, {
      startY: y + 2.5, margin: { left: M, right: M, top: 14, bottom: 14 },
      head: [tabla.head], body: tabla.body.map(f => f.map(celda)), foot: tabla.foot ? [pie(tabla.foot)] : undefined,
      showFoot: "lastPage", theme: "grid", columnStyles,
      styles: { font: "helvetica", fontSize: 7.2, cellPadding: 1.4, textColor: TINTA, lineColor: LINEA, lineWidth: 0.2, overflow: "linebreak" },
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 6.8 },
      footStyles: { fillColor: [230, 238, 248], textColor: NAVY, fontStyle: "bold" },
      alternateRowStyles: { fillColor: SUAVE },
    });
    y = doc.lastAutoTable.finalY + 9;
  };
  seccion("Resumen por tipo y fuente", T.resumen, "No hay nóminas cargadas en el período.");
  seccion("Nóminas del período", T.nominas, "No hay nóminas cargadas en el período.");
  seccion("Detalle de lo pagado", pagadoPdf, "No hay pagos marcados como pagados en el período.", { ...sinCorte([0, 1, 3, 5, 6, 9, 11, 12]), 4: { minCellWidth: 40 } });
  seccion("Rechazados", rechazadosPdf, "Sin rechazos en el período.", { ...sinCorte([0, 1, 3, 5, 6, 7]), 4: { minCellWidth: 40 } });

  // Pie de página
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...GRIS);
    doc.text(`SLEP Petorca · Reporte de pagos BancoEstado · ${periodoReporte(meta.desde, meta.hasta)}`, M, H - 7);
    doc.text(`Página ${i} de ${n}`, W - M, H - 7, { align: "right" });
  }
  return doc.output("arraybuffer");
}

// ---------- carga en el navegador ----------
let libs = null;
const script = src => new Promise((ok, mal) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => mal(new Error("no se pudo cargar " + src)); document.head.appendChild(s) });
const dataUrl = async ruta => { const b = await (await fetch(ruta)).blob(); return new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ok(null); r.readAsDataURL(b) }) };

export function cargarPdf() {
  if (!libs) libs = (async () => {
    if (!globalThis.jspdf) await script("vendor/jspdf-4.2.1.umd.min.js");
    const { autoTable } = await import("../vendor/jspdf-autotable-5.0.8.mjs");
    const logo = await dataUrl("assets/logo_slep_petorca.png").catch(() => null);
    return { jsPDF: globalThis.jspdf.jsPDF, autoTable, logo };
  })().catch(e => { libs = null; throw e });
  return libs;
}

// Paso 4: bitácora de nóminas, resultado del banco e historial.

import { M_TIPO, EST_PAGO } from "../catalogos.js";
import { S, normRut, fmtRut, money, fmtFecha, fmtISO, isoLocal, todayISO, resultadoDesde, fmtDue, diaHabilSiguiente, esHabil, nombreDe, nomStatus, nombreNomina, toTxt, today } from "../formato.js";
import { bankWorkbook } from "../excel.js";
import { st, aFecha, suscribirHistorial, cargarNomina, guardarCarga, deshacerCarga, resultadoPago, pagarPendientes, volverPendientes, anularNomina, exportarRespaldo } from "../datos.js";
import { $, esc, toast, accion, descargar, prefs, guardarPrefs, mensajeError } from "./comun.js";
import { fechaHora } from "./paso1.js";

let openNom = null, bitView = "", detallePendiente = false;
let histNom = { id: null, lista: [], baja: null };

const status = n => nomStatus(n, st.config.feriados);
const creada = n => { const d = aFecha(n.creadaAt); return d ? fmtISO(isoLocal(d)) : "" };
// Nombre corto bajo la fecha en la tabla (el correo completo queda en el título).
const quien = email => email ? `<span class="hint" style="display:block" title="${esc(email)}">${esc(nombreDe(email))}</span>` : "";
const normDcQ = v => S(v).toLowerCase().replace(/\s+/g, "");

export function abrirNomina(id) { openNom = id; renderBit() }

export function init() {
  $("hSearch").oninput = () => renderBit();
  $("hFuente").onchange = () => { prefs.bitFuente = $("hFuente").value; guardarPrefs(); renderBit() };
  $("hAnul").onchange = () => renderBit();
  // No se redibuja el detalle mientras se escribe en él (llegan cambios de otros usuarios).
  $("hDetail").addEventListener("focusout", () => setTimeout(() => { if (detallePendiente && !escribiendo()) { detallePendiente = false; renderNomDetail() } }, 0));
  $("btnBitCsv").onclick = () => {
    const nominas = st.nominas;
    if (!nominas.length) { toast("La bitácora está vacía"); return }
    const q = v => { v = S(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v };
    const rows = [["N NOMINA", "FUENTE", "FECHA GENERACION", "GENERADA POR", "ESTADO NOMINA", "FECHA CARGA", "CARGADA POR", "FECHA PAGO", "N OPERACION", "RUT", "BENEFICIARIO", "MONTO PAGO", "RESULTADO", "MOTIVO RECHAZO", "REINTEGRADO", "N DOC", "TIPO DOC", "FECHA DOC", "MONTO DOC", "DC"]];
    nominas.slice().sort((a, b) => a.num - b.num).forEach(n => { const s = status(n); n.pagos.forEach(p => p.docs.forEach(d => rows.push([n.num, n.fuente, creada(n), n.creadaPor, s.t, fmtISO(n.fechaCarga), n.cargadaPor, fmtISO(n.fechaPago), n.operacion, p.rut, p.nombre, p.monto, n.estado === "anulada" ? "Anulada" : EST_PAGO[p.estado], p.motivo, fmtISO(p.reint), d.ndoc, d.tipo, fmtFecha(d.fecha), d.monto, d.dc]))) });
    descargar("bitacora_nominas_" + today() + ".csv", "﻿" + rows.map(r => r.map(q).join(";")).join("\r\n"));
  };
  $("btnBackup").onclick = () => descargar("respaldo_panel_pago_" + today() + ".json", JSON.stringify(exportarRespaldo(), null, 1));
}

export function renderBitCount() {
  const act = st.nominas.map(status).filter(s => ["generada", "revisar", "reintegrar"].includes(s.k)).length;
  // Como en Control de DC: solo el número; ámbar si hay nóminas por atender.
  const c = $("cntBit");
  c.textContent = act || st.nominas.length || "";
  c.dataset.alerta = act ? "1" : "";
  c.title = act ? `${act} nómina${act > 1 ? "s" : ""} por atender` : `${st.nominas.length} nóminas en la bitácora`;
}

export function renderBit() {
  const nominas = st.nominas;
  const st2 = nominas.map(n => ({ n, s: status(n) }));
  const cnt = k => st2.filter(x => x.s.k === k).length;
  const cards = [["generada", "Generadas sin cargar"], ["espera", "Esperando resultado"], ["revisar", "Por registrar resultado"], ["reintegrar", "Con rechazos por reintegrar"]];
  $("bitStats").innerHTML = cards.map(([k, t]) => `<button class="stat" data-k="${k}" aria-pressed="${bitView === k}"><b>${cnt(k)}</b><span>${t}</span></button>`).join("");
  $("bitStats").querySelectorAll(".stat").forEach(b => b.onclick = () => { bitView = bitView === b.dataset.k ? "" : b.dataset.k; renderBit() });
  const fus = [...new Set(nominas.map(n => n.fuente))];
  $("hFuente").innerHTML = `<option value="*">Todas</option>` + fus.map(f => `<option value="${esc(f)}"${f === prefs.bitFuente ? " selected" : ""}>${esc(f)}</option>`).join("");
  const q = S($("hSearch").value).toLowerCase(), qr = normRut(q), qd = q.replace(/\D/g, ""), qdc = normDcQ(q);
  // DC: "dc 54", "DC54" o "54" encuentran el documento con DC "DC 54".
  const dcMatch = dc => !!dc && !!qdc && (normDcQ(dc) === qdc || normDcQ(dc) === "dc" + qdc);
  const docMatch = (p, d) => q && ((qd && d.ndoc === qd) || (qr.length >= 7 && p.rut.includes(qr)) || dcMatch(d.dc));
  const nomMatch = n => !q || n.pagos.some(p => S(p.nombre).toLowerCase().includes(q) || p.docs.some(d => docMatch(p, d))) || String(n.num) === q.replace(/^n.?\s*/, "");
  let list = st2.filter(x => (prefs.bitFuente === "*" || x.n.fuente === prefs.bitFuente) && ($("hAnul").checked || x.s.k !== "anulada") && (!bitView || x.s.k === bitView) && nomMatch(x.n));
  list.sort((a, b) => b.n.num - a.n.num);
  $("tbBit").innerHTML = list.length ? list.map(({ n, s }) => `<tr class="clickable${n.id === openNom ? " cur" : ""}" data-id="${esc(n.id)}" tabindex="0"><td class="mono"><b>${n.num}</b></td><td>${esc(n.fuente)}</td><td>${creada(n)}${quien(n.creadaPor)}</td><td>${n.fechaCarga ? fmtISO(n.fechaCarga) : "—"}${n.fechaCarga ? quien(n.cargadaPor) : ""}</td><td>${n.fechaPago ? fmtISO(n.fechaPago) : "—"}</td><td class="num">${n.pagos.length}</td><td class="num">${money(n.total)}</td><td><span class="tag ${s.c}">${esc(s.t)}</span></td></tr>`).join("")
    : `<tr><td colspan="8" class="empty">${nominas.length ? "Ninguna nómina coincide con el filtro." : "Aún no hay nóminas. Genera la primera en el paso 3."}</td></tr>`;
  $("tbBit").querySelectorAll("tr[data-id]").forEach(tr => { const o = () => { openNom = tr.dataset.id; renderBit(); $("hDetail").scrollIntoView({ behavior: "smooth", block: "start" }) }; tr.onclick = o; tr.onkeydown = e => { if (e.key === "Enter") o() } });
  // trazabilidad de un documento
  const tr = [];
  if (q && (qd || qr.length >= 7 || qdc.startsWith("dc"))) {
    const seenDoc = {};
    nominas.slice().sort((a, b) => a.num - b.num).forEach(n => n.pagos.forEach(p => p.docs.forEach(d => { if (!docMatch(p, d)) return; const key = p.rut + "|" + d.tipo + "|" + d.ndoc; (seenDoc[key] = seenDoc[key] || { p, d, h: [] }).h.push({ n, p }) })));
    Object.values(seenDoc).slice(0, 20).forEach(({ p, d, h }) => {
      tr.push(`<li><b>Doc ${esc(d.ndoc)}</b> (${esc(M_TIPO[d.tipo] || d.tipo)})${d.dc ? " " + esc(d.dc) : ""} de ${esc(p.nombre)}, ${money(d.monto)}: ` + h.map(({ n, p }) => `<a data-go="${esc(n.id)}">N° ${n.num} ${esc(n.fuente)}</a> ${n.estado === "anulada" ? "anulada" : n.estado === "generada" ? "generada sin cargar" : EST_PAGO[p.estado].toLowerCase() + (p.estado === "rechazado" && p.motivo ? " (" + esc(p.motivo) + ")" : "") + (n.fechaCarga ? ", cargada " + fmtISO(n.fechaCarga) : "") + (n.fechaPago ? ", pago " + fmtISO(n.fechaPago) : "")}`).join("; ") + `</li>`);
    });
    const pend = st.docs.filter(d => (qd && S(d.ndoc) === qd) || (qr.length >= 7 && d.rut.includes(qr)) || dcMatch(d.dc));
    if (pend.length) tr.push(`<li>${pend.length} documento${pend.length > 1 ? "s" : ""} coincidente${pend.length > 1 ? "s" : ""} sigue${pend.length > 1 ? "n" : ""} en pendientes (paso 2).</li>`);
  }
  $("hTrace").innerHTML = tr.join("");
  $("hTrace").querySelectorAll("[data-go]").forEach(a => a.onclick = () => { openNom = a.dataset.go; renderBit() });
  renderNomDetail();
}

const escribiendo = () => { const a = document.activeElement; return $("hDetail").contains(a) && (a.tagName === "INPUT" || a.tagName === "TEXTAREA") };

// Historial de la nómina abierta (pago_historial con ref "nomina:N").
function seguirHistorial(n) {
  if (histNom.id === (n && n.id)) return;
  if (histNom.baja) histNom.baja();
  histNom = { id: n ? n.id : null, lista: [], baja: null };
  if (!n) return;
  histNom.baja = suscribirHistorial("nomina:" + n.num, lista => { histNom.lista = lista; const box = $("nHist"); if (box) box.innerHTML = htmlHistorial(lista) });
}
const htmlHistorial = lista => lista.length ? lista.map(h => `<li><b>${esc(h.accion)}</b> <span class="hint">${fechaHora(h.createdAt)} · ${esc(h.autor)}</span><br>${esc(h.detalle)}</li>`).join("") : `<li class="hint">Sin entradas.</li>`;

function renderNomDetail() {
  const box = $("hDetail"); const n = st.nominas.find(x => x.id === openNom);
  seguirHistorial(n);
  if (!n) { box.hidden = true; return }
  if (escribiendo() && box.dataset.id === n.id) { detallePendiente = true; return }
  box.dataset.id = n.id;
  box.hidden = false; const s = status(n);
  const cargada = n.estado === "cargada", anul = n.estado === "anulada";
  const due = n.fechaCarga ? resultadoDesde(n, st.config.feriados) : null;
  const pend = n.pagos.filter(p => p.estado === "pendiente").length, pag = n.pagos.filter(p => p.estado === "pagado"), rech = n.pagos.filter(p => p.estado === "rechazado");
  box.innerHTML = `
  <div class="row" style="margin-top:0;justify-content:space-between"><h2 style="margin:0">Nómina N° ${n.num}, ${esc(n.fuente)}</h2><span class="tag ${s.c}">${esc(s.t)}</span></div>
  <p class="due">Generada el ${creada(n)}${n.creadaPor ? ` por <b title="${esc(n.creadaPor)}">${esc(nombreDe(n.creadaPor))}</b>` : ""}.${n.fechaCarga ? ` Cargada en BancoEstado el ${fmtISO(n.fechaCarga)}${n.cargadaPor ? ` por <b title="${esc(n.cargadaPor)}">${esc(nombreDe(n.cargadaPor))}</b>` : ""}.` : ""} Archivo ${esc(nombreNomina(n))}.txt. ${n.pagos.length} pago${n.pagos.length === 1 ? "" : "s"} por ${money(n.total)}.${n.fechaPago ? ` Fecha de pago: ${fmtISO(n.fechaPago)}.` : ""}${cargada ? ` Pagado ${money(pag.reduce((a, p) => a + p.monto, 0))}, rechazado ${money(rech.reduce((a, p) => a + p.monto, 0))}, pendiente de resultado ${money(n.pagos.filter(p => p.estado === "pendiente").reduce((a, p) => a + p.monto, 0))}.` : ""}</p>
  <div class="grid">
    <label>Fecha de carga en BancoEstado<input type="date" id="nFecha" value="${n.fechaCarga || todayISO()}" ${anul ? "disabled" : ""}></label>
    <label title="Día en que el banco paga la nómina. Queda registrada aunque después haya pagos rechazados.">Fecha de pago de la nómina<input type="date" id="nFechaPago" value="${n.fechaPago || diaHabilSiguiente(n.fechaCarga || todayISO(), st.config.feriados)}" ${anul ? "disabled" : ""}></label>
    <label>N° de operación o folio (opcional)<input id="nOper" value="${esc(n.operacion)}" ${anul ? "disabled" : ""}></label>
    <label class="wide">Observación<input id="nObs" value="${esc(n.obs)}" ${anul ? "disabled" : ""}></label>
  </div>
  ${due ? `<p class="hint" style="margin-top:8px">Resultado del banco disponible desde el ${fmtDue(due)} (${n.fechaPago ? "14:00 del día de pago de la nómina; si cae en día no hábil, del hábil siguiente" : "día hábil siguiente a la carga"}; considera los feriados de Configuración).</p>` : ""}
  <div class="row">
    ${n.estado === "generada" ? `<button class="btn primary" id="nCargar">Marcar como cargada en BancoEstado</button>` : ""}
    ${cargada ? `<button class="btn" id="nGuardar">Guardar cambios</button>` : ""}
    ${cargada && pend ? `<button class="btn primary" id="nPagarRest">Marcar ${pend} pendiente${pend > 1 ? "s" : ""} como pagado${pend > 1 ? "s" : ""}</button>` : ""}
    <button class="btn" id="nTxt">Descargar .txt</button>
    <button class="btn" id="nXlsx">Descargar Excel BancoEstado</button>
    ${n.estado === "generada" ? `<button class="btn danger" id="nAnular">Anular nómina</button>` : ""}
    ${cargada && n.pagos.every(p => p.estado === "pendiente") ? `<button class="btn small" id="nDescargar" title="Vuelve al estado generada">Deshacer carga</button>` : ""}
  </div>
  ${cargada && pend && Date.now() < due.getTime() ? `<p class="hint">Si el banco rechaza algún pago, márcalo como Rechazado con su motivo. Al resto le puedes aplicar “Marcar pendientes como pagados”.</p>` : ""}
  ${anul ? `<p class="hint">Nómina anulada: queda cerrada y no se puede volver a editar.</p>` : ""}
  <div class="tablebox"><table>
    <thead><tr><th>Beneficiario</th><th>Cuenta</th><th>Documentos</th><th style="text-align:right">Monto</th><th>Resultado</th><th>Motivo de rechazo</th><th></th></tr></thead>
    <tbody>${n.pagos.map((p, i) => `<tr>
      <td><span class="mono">${esc(fmtRut(p.rut))}</span><br>${esc(p.nombre)}</td>
      <td class="mono">${esc(p.banco)} ${esc(p.cuenta)}</td>
      <td>${p.docs.map(d => `<span class="mono">${esc(d.ndoc)}</span> <span class="hint">${esc((M_TIPO[d.tipo] || d.tipo))} ${money(d.monto)}${d.dc ? " · " + esc(d.dc) : ""}</span>`).join("<br>")}</td>
      <td class="num">${money(p.monto)}</td>
      <td><select class="inl" data-pe="${i}" ${cargada ? "" : "disabled"} aria-label="Resultado">${Object.entries(EST_PAGO).map(([k, t]) => `<option value="${k}"${p.estado === k ? " selected" : ""}>${t}</option>`).join("")}</select></td>
      <td>${p.estado === "rechazado" ? `<input class="inl" data-pm="${i}" value="${esc(p.motivo)}" placeholder="Ej. cuenta inexistente" ${cargada ? "" : "disabled"}>` : ""}</td>
      <td>${p.estado === "rechazado" ? (p.reint ? `<span class="hint">Reintegrado ${fmtISO(p.reint)}</span>` : anul ? "" : `<button class="btn small" data-pr="${i}">Volver a pendientes</button>`) : ""}</td>
    </tr>`).join("")}</tbody>
  </table></div>
  <h3>Historial de la nómina</h3>
  <ul class="trace" id="nHist">${htmlHistorial(histNom.lista)}</ul>`;
  const q = id => box.querySelector("#" + id);
  const datosCarga = () => ({ fechaCarga: q("nFecha").value, fechaPago: q("nFechaPago").value, operacion: S(q("nOper").value), obs: S(q("nObs").value) });
  // Mientras no se haya guardado ni tocado, la fecha de pago sigue al día hábil siguiente a la carga.
  let pagoTocado = !!n.fechaPago;
  q("nFechaPago").addEventListener("input", () => { pagoTocado = true });
  q("nFecha").addEventListener("change", () => { if (!pagoTocado && q("nFecha").value) q("nFechaPago").value = diaHabilSiguiente(q("nFecha").value, st.config.feriados) });
  const fechasOk = d => {
    if (!d.fechaCarga) { toast("Indica la fecha de carga"); return false }
    if (!d.fechaPago) { toast("Indica la fecha de pago de la nómina"); return false }
    if (d.fechaPago < d.fechaCarga) { toast("La fecha de pago no puede ser anterior a la fecha de carga"); return false }
    if (!esHabil(d.fechaPago, st.config.feriados) && !confirm(`La fecha de pago ${fmtISO(d.fechaPago)} cae en sábado, domingo o feriado. ¿Guardarla igual?`)) return false;
    return true;
  };
  if (q("nCargar")) q("nCargar").onclick = () => { const d = datosCarga(); if (!fechasOk(d)) return; accion(q("nCargar"), async () => { await cargarNomina(n.id, d); toast(`Nómina N° ${n.num} marcada como cargada el ${fmtISO(d.fechaCarga)}, con pago el ${fmtISO(d.fechaPago)}. Resultado desde el ${fmtDue(resultadoDesde(d, st.config.feriados))}`) }) };
  if (q("nGuardar")) q("nGuardar").onclick = () => { const d = datosCarga(); if (!fechasOk(d)) return; accion(q("nGuardar"), async () => { await guardarCarga(n.id, d); toast("Cambios guardados") }) };
  if (q("nPagarRest")) q("nPagarRest").onclick = () => { if (Date.now() < due.getTime() && !confirm("Aún no son las 14:00 del día hábil siguiente a la carga. ¿Marcar igual los pendientes como pagados?")) return; accion(q("nPagarRest"), async () => { await pagarPendientes(n.id); toast("Pagos pendientes marcados como pagados") }) };
  q("nTxt").onclick = () => descargar(nombreNomina(n) + ".txt", toTxt(n.lineas));
  q("nXlsx").onclick = () => accion(q("nXlsx"), async () => { try { descargar(nombreNomina(n) + ".xlsx", await bankWorkbook(n.lineas)) } catch (e) { toast("No se pudo armar el Excel: " + mensajeError(e)) } });
  if (q("nAnular")) q("nAnular").onclick = () => { if (!confirm(`¿Anular la nómina N° ${n.num}? Sus ${n.pagos.reduce((a, p) => a + p.docs.length, 0)} documentos vuelven a pendientes. Hazlo solo si no se cargó en el banco.`)) return; accion(q("nAnular"), async () => { await anularNomina(n.id); toast("Nómina anulada; documentos de vuelta en pendientes") }) };
  if (q("nDescargar")) q("nDescargar").onclick = () => accion(q("nDescargar"), () => deshacerCarga(n.id));
  box.querySelectorAll("[data-pe]").forEach(sel => sel.onchange = () => {
    const p = n.pagos[+sel.dataset.pe];
    if (p.reint && sel.value !== "rechazado") { toast("Este pago ya se reintegró a pendientes; no se puede cambiar"); sel.value = "rechazado"; return }
    accion(sel, () => resultadoPago(n.id, +sel.dataset.pe, sel.value, p.motivo));
  });
  box.querySelectorAll("[data-pm]").forEach(inp => inp.onchange = () => accion(null, () => resultadoPago(n.id, +inp.dataset.pm, "rechazado", S(inp.value))));
  box.querySelectorAll("[data-pr]").forEach(b => b.onclick = () => { const p = n.pagos[+b.dataset.pr]; accion(b, async () => { await volverPendientes(n.id, +b.dataset.pr); toast(`${p.docs.length} documento${p.docs.length > 1 ? "s" : ""} de ${p.nombre} de vuelta en pendientes. Corrige los datos bancarios si hace falta.`) }) });
}

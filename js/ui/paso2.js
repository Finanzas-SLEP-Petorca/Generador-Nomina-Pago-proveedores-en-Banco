// Paso 2: fuentes de financiamiento y documentos a pagar.

import { TIPOS, M_TIPO, NC } from "../catalogos.js";
import { S, normRut, rutOk, fmtRut, normFuente, parseFecha, parseMonto, normDc, checkDoc, money, fmtFecha } from "../formato.js";
import { ingest, parsePaste } from "../importar.js";
import { docsTemplate } from "../excel.js";
import { st, guardarConfig, agregarDoc, editarDoc, actualizarDocs, quitarDocs } from "../datos.js";
import { $, esc, fillSelect, fOpts, toast, accion, descargar, prefs, guardarPrefs, mensajeError } from "./comun.js";
import { ingestar, importarArchivo, nuevoConRut } from "./paso1.js";

let editando = null;
const visibleDocs = () => prefs.filt === "*" ? st.docs : st.docs.filter(d => d.fuente === prefs.filt);

// Cambia el campo sel de varios documentos (solo los que cambian).
const marcar = (lista, sel) => accion(null, () => actualizarDocs(lista.filter(d => d.sel !== sel).map(d => d.id), { sel }));

export function init() {
  fillSelect($("dTipo"), TIPOS); $("dTipo").value = "33";
  $("btnAddFuente").onclick = () => {
    const f = normFuente($("newFuente").value); if (!f) { toast("Escribe el nombre de la fuente"); return }
    if (st.config.fuentes.includes(f)) { toast(f + " ya existe"); return }
    accion($("btnAddFuente"), async () => { await guardarConfig({ fuentes: [...st.config.fuentes, f] }); $("newFuente").value = ""; toast("Fuente " + f + " agregada") });
  };
  $("newFuente").onkeydown = e => { if (e.key === "Enter") $("btnAddFuente").click() };
  $("defFuente").onchange = () => { prefs.defFuente = $("defFuente").value; guardarPrefs() };
  $("filtFuente").onchange = () => { prefs.filt = $("filtFuente").value; guardarPrefs(); renderDocs() };
  $("btnPasteDocs").onclick = () => accion($("btnPasteDocs"), async () => { if (await ingestar(ingest(parsePaste($("pasteDocs").value)), "pegado paso 2")) $("pasteDocs").value = "" });
  $("fileDocs").addEventListener("change", importarArchivo);
  $("dRut").addEventListener("input", () => { const p = st.maestro[normRut($("dRut").value)]; $("dRutName").textContent = p ? p.nombre : ($("dRut").value ? "RUT no está en el maestro" : "") });
  $("btnAddDoc").onclick = () => {
    const d = { rut: normRut($("dRut").value), fecha: parseFecha($("dFecha").value), monto: parseMonto($("dMonto").value), ndoc: S($("dNdoc").value), tipo: $("dTipo").value, fuente: $("dFuente").value, sel: true };
    const dc = normDc($("dDc").value); if (dc) d.dc = dc;
    const c = checkDoc(d);
    if (!rutOk(d.rut)) { toast("RUT inválido"); return }
    if (c.e.length) { toast((editando ? "No se guardó: " : "No se agregó: ") + c.e[0]); return }
    if (editando) {
      const id = editando;
      accion($("btnAddDoc"), async () => {
        const r = await editarDoc(id, { ...d, dc: d.dc || "" });
        formDoc(null);
        toast(r === "sin cambios" ? "Sin cambios" : "Documento actualizado");
      });
      return;
    }
    accion($("btnAddDoc"), async () => {
      await agregarDoc(d);
      $("dMonto").value = ""; $("dNdoc").value = ""; $("dDc").value = ""; $("dNdoc").focus();
      toast("Documento agregado a " + d.fuente);
    });
  };
  $("btnCancelDoc").onclick = () => formDoc(null);
  $("btnSelAll").onclick = () => marcar(visibleDocs(), true);
  $("btnSelNone").onclick = () => marcar(visibleDocs(), false);
  $("chkAll").onchange = e => marcar(visibleDocs(), e.target.checked);
  $("btnBulkFuente").onclick = () => {
    const f = $("bulkFuente").value; const t = visibleDocs().filter(d => d.sel);
    if (!t.length) { toast("No hay documentos marcados"); return }
    accion($("btnBulkFuente"), async () => { await actualizarDocs(t.map(d => d.id), { fuente: f }); toast(t.length + " documentos movidos a " + f) });
  };
  $("btnDelSel").onclick = () => {
    const t = visibleDocs().filter(d => d.sel); if (!t.length) { toast("No hay documentos marcados"); return }
    if (!confirm("¿Quitar " + t.length + " documentos marcados de la lista?")) return;
    accion($("btnDelSel"), () => quitarDocs(t.map(d => d.id), "Quitar marcados"));
  };
  $("btnClearDocs").onclick = () => {
    if (st.docs.length && confirm("¿Vaciar los " + st.docs.length + " documentos de todas las fuentes? El maestro de proveedores no se toca."))
      accion($("btnClearDocs"), () => quitarDocs(st.docs.map(d => d.id), "Vaciar todo"));
  };
  $("btnDocsTpl").onclick = () => accion($("btnDocsTpl"), async () => {
    try { descargar("plantilla_documentos_a_pagar.xlsx", await docsTemplate(st.config.fuentes)) } catch (e) { toast("No se pudo armar la plantilla: " + mensajeError(e)) }
  });
}

export function renderFuentes() {
  const used = {}; st.docs.forEach(d => used[d.fuente] = (used[d.fuente] || 0) + 1);
  const fuentes = st.config.fuentes;
  $("chips").innerHTML = fuentes.map(f => `<span class="chip">${esc(f)}<span class="hint" style="font-weight:400">${used[f] || 0}</span><button data-rmf="${esc(f)}" aria-label="Eliminar fuente ${esc(f)}" title="Eliminar fuente">×</button></span>`).join("");
  $("chips").querySelectorAll("[data-rmf]").forEach(b => b.onclick = () => {
    const f = b.dataset.rmf;
    if (used[f]) { toast("No se puede eliminar " + f + ": tiene " + used[f] + " documentos. Muévelos primero."); return }
    if (fuentes.length === 1) { toast("Debe quedar al menos una fuente"); return }
    if (prefs.filt === f) { prefs.filt = "*"; guardarPrefs() }
    accion(b, () => guardarConfig({ fuentes: fuentes.filter(x => x !== f) }));
  });
  if (!fuentes.includes(prefs.defFuente)) { prefs.defFuente = fuentes[0]; guardarPrefs() }
  if (prefs.filt !== "*" && !fuentes.includes(prefs.filt) && !used[prefs.filt]) prefs.filt = "*";
  $("defFuente").innerHTML = fOpts(prefs.defFuente);
  $("dFuente").innerHTML = fOpts($("dFuente").value || prefs.defFuente);
  $("bulkFuente").innerHTML = fOpts($("bulkFuente").value || fuentes[0]);
  $("filtFuente").innerHTML = `<option value="*">Todas las fuentes</option>` + fuentes.map(f => `<option value="${esc(f)}"${f === prefs.filt ? " selected" : ""}>${esc(f)} (${used[f] || 0})</option>`).join("");
}

export function renderDocs() {
  const vis = visibleDocs();
  $("tbDocs").innerHTML = vis.length ? vis.map(d => {
    const p = st.maestro[d.rut];
    return `<tr class="${d.sel ? "" : "off"}"><td class="c"><input type="checkbox" class="chk" data-sel="${esc(d.id)}"${d.sel ? " checked" : ""} aria-label="Pagar documento ${esc(d.ndoc)}"></td><td><select class="inl" data-fu="${esc(d.id)}" aria-label="Fuente">${fOpts(d.fuente)}</select></td><td class="mono">${esc(fmtRut(d.rut))}</td><td class="${p ? "" : "bad"}">${d.hist ? `<span class="dochist">${esc(d.hist)}</span>` : ""}${p ? esc(p.nombre) : `No está en proveedores <button class="btn small" data-addrut="${esc(d.rut)}">Agregar</button>`}</td><td class="${d.fecha ? "" : "bad"}">${d.fecha ? fmtFecha(d.fecha) : "inválida"}</td><td class="num ${d.monto > 0 ? "" : "bad"}">${d.monto > 0 ? (NC.has(d.tipo) ? "−" : "") + money(d.monto) : "inválido"}</td><td class="mono">${esc(d.ndoc)}</td><td title="${esc(M_TIPO[d.tipo] || "")}" class="${M_TIPO[d.tipo] ? "" : "bad"}">${esc(d.tipo)} ${esc(M_TIPO[d.tipo] || "?")}</td><td class="mono">${esc(d.dc)}</td><td><span class="row" style="margin:0;flex-wrap:nowrap"><button class="btn small" data-ed="${esc(d.id)}" aria-label="Editar documento">Editar</button><button class="btn small danger" data-del="${esc(d.id)}" aria-label="Quitar documento">Quitar</button></span></td></tr>`
  }).join("")
    : `<tr><td colspan="10" class="empty">${st.docs.length ? "No hay documentos en esta fuente." : "No hay documentos. Pega los documentos a pagar arriba."}</td></tr>`;
  $("tbDocs").querySelectorAll("[data-sel]").forEach(c => c.onchange = () => accion(null, () => actualizarDocs([c.dataset.sel], { sel: c.checked })));
  $("tbDocs").querySelectorAll("[data-fu]").forEach(s => s.onchange = () => accion(null, () => actualizarDocs([s.dataset.fu], { fuente: s.value })));
  $("tbDocs").querySelectorAll("[data-del]").forEach(b => b.onclick = () => { if (b.dataset.del === editando) formDoc(null); accion(b, () => quitarDocs([b.dataset.del], "Quitar documento")) });
  $("tbDocs").querySelectorAll("[data-ed]").forEach(b => b.onclick = () => formDoc(st.docs.find(d => d.id === b.dataset.ed)));
  if (editando && !st.docs.some(d => d.id === editando)) { formDoc(null); toast("El documento que editabas ya no está pendiente") }
  $("tbDocs").querySelectorAll("[data-addrut]").forEach(b => b.onclick = () => nuevoConRut(b.dataset.addrut));
  const selV = vis.filter(d => d.sel);
  $("chkAll").checked = vis.length > 0 && selV.length === vis.length;
  $("chkAll").indeterminate = selV.length > 0 && selV.length < vis.length;
  const amt = selV.reduce((s, d) => s + (d.monto > 0 ? (NC.has(d.tipo) ? -d.monto : d.monto) : 0), 0);
  $("selInfo").textContent = vis.length ? `${selV.length} de ${vis.length} marcados para pagar, por ${money(amt)}.` : "";
}

// Carga un documento pendiente en el formulario para editarlo (null vuelve a agregar).
function formDoc(d) {
  editando = d ? d.id : null;
  const iso = f => f && f.length === 8 ? f.slice(4) + "-" + f.slice(2, 4) + "-" + f.slice(0, 2) : ""; // DDMMAAAA → AAAA-MM-DD
  $("dRut").value = d ? d.rut : ""; $("dFecha").value = d ? iso(d.fecha) : "";
  $("dMonto").value = d ? d.monto : ""; $("dNdoc").value = d ? d.ndoc : ""; $("dDc").value = d ? d.dc || "" : "";
  if (d) { if (M_TIPO[d.tipo]) $("dTipo").value = d.tipo; $("dFuente").value = d.fuente }
  $("dFormTitulo").textContent = d ? `Editar documento ${d.ndoc || "s/n"} de ${fmtRut(d.rut)}` : "Agregar un documento";
  $("btnAddDoc").textContent = d ? "Guardar cambios" : "Agregar documento";
  $("btnCancelDoc").hidden = !d;
  const p = d && st.maestro[d.rut];
  $("dRutName").textContent = d ? (p ? p.nombre : "RUT no está en el maestro") + ". El cambio queda en el historial." : "";
  if (d) { $("dFormTitulo").scrollIntoView({ behavior: "smooth", block: "start" }); $("dMonto").focus({ preventScroll: true }) }
}

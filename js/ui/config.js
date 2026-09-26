// Configuración: prefijo del archivo, email por defecto, feriados y
// migración desde el panel anterior (importar respaldo JSON, solo pAdmin).

import { S, parseFecha, fmtISO, expandPrefijo, quitarFuenteFinal, today } from "../formato.js";
import { st, guardarConfig, exportarRespaldo, leerRespaldo, analizarRespaldo, importarRespaldo } from "../datos.js";
import { $, esc, toast, accion, descargar, mensajeError } from "./comun.js";
import { DIAS } from "../catalogos.js";

let analisis = null;
const aISO = f => f.slice(4) + "-" + f.slice(2, 4) + "-" + f.slice(0, 2); // DDMMAAAA → AAAA-MM-DD

export function init() {
  $("cPrefijo").onchange = () => {
    // La fuente la agrega el panel al final: si se escribió una, se quita.
    const v = quitarFuenteFinal($("cPrefijo").value, st.config.fuentes);
    if (!v) { toast("El prefijo no puede quedar vacío"); return }
    $("cPrefijo").value = v;
    accion(null, async () => { await guardarConfig({ prefijoArchivo: v }); toast("Prefijo guardado. Ejemplo: " + expandPrefijo(v) + "_" + (st.config.fuentes[0] || "SEP") + ".txt") });
  };
  $("cEmail").onchange = () => accion(null, async () => { await guardarConfig({ emailDefecto: S($("cEmail").value) }); toast("Email por defecto guardado") });
  $("btnAddFeriado").onclick = () => {
    // Acepta una o varias fechas (una por línea o separadas por coma), dd/mm/aaaa o aaaa-mm-dd.
    const partes = S($("cFeriado").value).split(/[\n,;]+/).map(S).filter(Boolean);
    if (!partes.length) { toast("Escribe una fecha"); return }
    const malas = [], nuevas = [];
    partes.forEach(p => { const f = parseFecha(p); if (!f) malas.push(p); else nuevas.push(aISO(f)) });
    if (malas.length) { toast("Fecha no válida: " + malas[0]); return }
    const lista = [...new Set([...st.config.feriados, ...nuevas])].sort();
    accion($("btnAddFeriado"), async () => { await guardarConfig({ feriados: lista }); $("cFeriado").value = ""; toast(nuevas.length + " feriado" + (nuevas.length > 1 ? "s" : "") + " guardado" + (nuevas.length > 1 ? "s" : "")) });
  };
  $("btnBackup2").onclick = () => descargar("respaldo_panel_pago_" + today() + ".json", JSON.stringify(exportarRespaldo(), null, 1));
  $("fileRespaldo").addEventListener("change", async e => {
    const file = e.target.files[0]; e.target.value = ""; if (!file) return;
    try { analisis = analizarRespaldo(leerRespaldo(JSON.parse(await file.text()))); mostrarResumen(file.name) }
    catch (err) { analisis = null; $("resumenRespaldo").innerHTML = ""; toast("No se pudo leer el respaldo: " + mensajeError(err)) }
  });
}

function mostrarResumen(nombre) {
  const a = analisis;
  const nom = a.nominas;
  $("resumenRespaldo").innerHTML = `
    <h3>Resumen de ${esc(nombre)}</h3>
    <ul class="issues">
      <li class="info"><b>Proveedores:</b> ${a.provs.length} en el respaldo; ${a.provNuevos} nuevos y ${a.provCambian} con datos distintos a los de Firestore (se actualizan y quedan en el historial).</li>
      <li class="info"><b>Documentos pendientes:</b> ${a.docsOk.length} se importan${a.docsMalos.length ? `, ${a.docsMalos.length} no (monto inválido)` : ""}.</li>
      <li class="info"><b>Nóminas:</b> ${nom.length ? `${nom.length} (N° ${nom[0].num} a ${nom[nom.length - 1].num}) — ${a.importarNominas ? "se importan" : "NO se importan"}` : "ninguna"}.</li>
      <li class="info"><b>Configuración:</b> fuentes ${esc(a.fuentes.join(", "))}; email por defecto ${esc(a.email)}.</li>
      ${a.avisos.map(t => `<li class="warn">${esc(t)}</li>`).join("")}
    </ul>
    <div class="row"><button class="btn primary" id="btnConfirmarRespaldo">Confirmar e importar</button><button class="btn" id="btnCancelarRespaldo">Cancelar</button></div>
    <p class="hint" id="avanceRespaldo"></p>`;
  $("btnCancelarRespaldo").onclick = () => { analisis = null; $("resumenRespaldo").innerHTML = "" };
  $("btnConfirmarRespaldo").onclick = () => {
    if (!confirm("¿Importar el respaldo en Firestore? Lo verá todo el equipo.")) return;
    accion($("btnConfirmarRespaldo"), async () => {
      $("btnCancelarRespaldo").disabled = true;
      await importarRespaldo(a, t => { $("avanceRespaldo").textContent = t });
      $("avanceRespaldo").textContent = "Importación terminada.";
      toast("Respaldo importado"); analisis = null;
    });
  };
}

export function renderConfig() {
  if (document.activeElement !== $("cPrefijo")) $("cPrefijo").value = st.config.prefijoArchivo;
  if (document.activeElement !== $("cEmail")) $("cEmail").value = st.config.emailDefecto;
  $("cPrefijoInfo").textContent = "El panel agrega la fuente al final. Ejemplo de hoy: " + expandPrefijo(st.config.prefijoArchivo) + "_" + (st.config.fuentes.includes("SEP") ? "SEP" : st.config.fuentes[0]) + ".txt";
  const fer = st.config.feriados.slice().sort();
  const dia = iso => { const [y, m, d] = iso.split("-").map(Number); return DIAS[new Date(y, m - 1, d).getDay()] };
  $("feriados").innerHTML = fer.length ? fer.map(f => `<span class="chip">${dia(f)} ${fmtISO(f)}<button data-rmfer="${f}" aria-label="Quitar feriado ${fmtISO(f)}" title="Quitar feriado">×</button></span>`).join("") : `<span class="hint">Sin feriados cargados: el resultado del banco solo salta sábados y domingos.</span>`;
  $("feriados").querySelectorAll("[data-rmfer]").forEach(b => b.onclick = () => accion(b, () => guardarConfig({ feriados: st.config.feriados.filter(x => x !== b.dataset.rmfer) })));
  $("cardMigracion").hidden = !st.admin;
  $("sesionInfo").textContent = `Sesión: ${st.email}${st.admin ? " (administrador)" : ""}.`;
}

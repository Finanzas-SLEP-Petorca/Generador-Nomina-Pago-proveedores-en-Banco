// Registrar una transferencia electrónica directa (pago sin nómina) en la bitácora.
// Se sube el Comprobante o Detalle de Transferencia de BancoEstado en PDF: el
// panel lee sus datos (js/ocr.js), elige qué paga cuando calza el monto y la
// persona revisa y registra. Se pueden subir varios; quedan en cola. El
// formulario sigue disponible para corregir lo leído o ingresar a mano.

import { BANCOS, NC, M_TIPO, M_BANCO } from "../catalogos.js";
import { S, normRut, rutOk, fmtRut, parseMonto, money, fmtFecha, fmtISO, todayISO, tipoDe, ultimoAbono, cleanName } from "../formato.js";
import { combinacionExacta } from "../comprobante.js";
import { st, registrarTransferencia } from "../datos.js";
import { $, esc, toast, accion, fOpts, fillSelect, mensajeError } from "./comun.js";
import { abrirNomina } from "./paso4.js";

let origen = "suelto", autocompletado = {}, marcar = new Set();
// Cola de PDF: { nombre, archivo, estado: espera | leyendo | lista | registrada | repetida | omitida | error, datos, nota, num }
let cola = [], actual = null, leyendo = false, manual = false;
const OTRA = "__otra";
const CAMPOS = ["tNum", "tIdTef", "tFecha", "tHora", "tCuenta", "tCuentaOtra", "tFuente", "tRut", "tNombre", "tBanco", "tCuentaB", "tMonto", "tConcepto", "tMensaje", "tPreparo", "tAutorizo", "tObs"];

export function init() {
  fillSelect($("tBanco"), [["", "—"], ...BANCOS]);
  $("tBanco").options[0].textContent = "Sin especificar";
  $("btnTef").onclick = abrir;
  $("tefCerrar").onclick = $("tCancelar").onclick = () => $("dlgTef").close();
  $("tCuenta").onchange = () => {
    const c = st.config.cuentas.find(x => x.cuenta === $("tCuenta").value);
    $("tCuentaOtraL").hidden = $("tCuenta").value !== OTRA;
    if (c && st.config.fuentes.includes(c.fuente)) $("tFuente").value = c.fuente;
  };
  $("tRut").addEventListener("change", () => { $("tRut").value = fmtRut(normRut($("tRut").value)); beneficiario(); items() });
  $("tMonto").addEventListener("change", () => { const m = parseMonto($("tMonto").value); if (m > 0) $("tMonto").value = m.toLocaleString("es-CL"); suma() });
  $("tOrigen").querySelectorAll("[data-origen]").forEach(b => b.onclick = () => { origen = b.dataset.origen; items() });
  $("tRegistrar").onclick = registrar;
  $("tefForm").onsubmit = e => e.preventDefault(); // Enter en un campo no cierra el diálogo
  CAMPOS.forEach(id => $(id).addEventListener("change", resumen));

  // Comprobantes PDF: elegir o soltar sobre el diálogo.
  $("tPdf").onchange = () => { leerArchivos([...$("tPdf").files]); $("tPdf").value = "" };
  const dlg = $("dlgTef");
  dlg.addEventListener("dragover", e => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); dlg.classList.add("arrastre") } });
  dlg.addEventListener("dragleave", e => { if (e.target === dlg || !dlg.contains(e.relatedTarget)) dlg.classList.remove("arrastre") });
  dlg.addEventListener("drop", e => { e.preventDefault(); dlg.classList.remove("arrastre"); leerArchivos([...e.dataTransfer.files]) });
  $("tManual").onclick = () => { actual = null; manual = true; prepararForm(); mostrarForm(true); pintarCola(); $("tNum").focus() };
  $("tCorregir").onclick = () => verCampos($("tCampos").hidden);
  $("tOmitir").onclick = () => { if (actual) { actual.estado = "omitida"; siguiente() } };
  $("tCola").onclick = e => { const b = e.target.closest("[data-i]"); if (b) mostrar(cola[+b.dataset.i]) };
}

function abrir() {
  // Lo que se estaba leyendo o quedó sin registrar sigue en la cola.
  cola = cola.filter(it => ["espera", "leyendo", "lista"].includes(it.estado));
  actual = null; manual = false;
  prepararForm(); ocultarRevision();
  if (!leyendo) estadoPdf("");
  $("dlgTef").showModal();
  const lista = cola.find(x => x.estado === "lista");
  if (lista) mostrar(lista);
}

// Sin comprobante en revisión: solo la zona para subir PDF y la cola.
function ocultarRevision() {
  $("tResumen").hidden = $("tAvisos").hidden = $("tCampos").hidden = $("tPaga").hidden = $("tAcciones").hidden = true;
  pintarCola();
}

// Formulario en blanco con las opciones de cuenta y fuente al día.
function prepararForm() {
  $("tefForm").reset(); origen = "suelto"; autocompletado = {}; marcar = new Set();
  $("tFecha").value = todayISO();
  const cuentas = st.config.cuentas;
  $("tCuenta").innerHTML = (cuentas.length ? `<option value="">Elige la cuenta</option>` : "") + cuentas.map(c => `<option value="${esc(c.cuenta)}">${esc(c.cuenta)}${c.nombre ? " · " + esc(c.nombre) : ""}</option>`).join("") + `<option value="${OTRA}">Otra cuenta…</option>`;
  $("tCuentaOtraL").hidden = !!cuentas.length;
  if (!cuentas.length) $("tCuenta").value = OTRA;
  $("tFuente").innerHTML = fOpts(st.config.fuentes[0]);
  $("tBenefInfo").textContent = cuentas.length ? "" : "Tip: en Configuración puedes asociar cada cuenta de origen a su fuente, así la fuente se completa sola.";
  items();
}

// manual: formulario completo (sin PDF). Con PDF: resumen y "Qué paga".
function mostrarForm(manual) {
  $("tResumen").hidden = manual; $("tPaga").hidden = $("tAcciones").hidden = false;
  if (manual) { $("tAvisos").hidden = true; verCampos(true) }
  $("tOmitir").hidden = manual || !actual;
}
function verCampos(ver) {
  $("tCampos").hidden = !ver;
  $("tCorregir").setAttribute("aria-expanded", ver);
  $("tCorregir").textContent = ver ? "Ocultar datos" : "Corregir datos";
}
const estadoPdf = txt => { $("tPdfEstado").dataset.leyendo = txt ? "1" : ""; if (txt) $("tPdfEstado").textContent = txt; else if ($("tPdfEstado").dataset.ayuda) $("tPdfEstado").innerHTML = $("tPdfEstado").dataset.ayuda };

// ---------- lectura de los PDF ----------
function leerArchivos(files) {
  const pdfs = files.filter(f => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
  if (!pdfs.length) { toast("Elige el PDF del comprobante o del detalle de la transferencia"); return }
  if (!$("tPdfEstado").dataset.ayuda) $("tPdfEstado").dataset.ayuda = $("tPdfEstado").innerHTML;
  cola.push(...pdfs.map(f => ({ nombre: f.name, archivo: f, estado: "espera" })));
  pintarCola();
  if (!leyendo) procesar();
}

async function procesar() {
  leyendo = true;
  let ocr;
  try { ocr = await import("../ocr.js") } catch (e) { leyendo = false; toast("No se pudo cargar el lector de comprobantes: " + mensajeError(e)); return }
  for (let it; (it = cola.find(x => x.estado === "espera"));) {
    it.estado = "leyendo"; pintarCola();
    const pendientes = cola.filter(x => ["espera", "leyendo"].includes(x.estado)).length;
    try {
      it.datos = await ocr.leerPdfTransferencia(it.archivo, (txt, p) => estadoPdf(`${txt}${p > 0 && p < 1 ? ` ${Math.round(p * 100)}%` : ""}… ${it.nombre}${pendientes > 1 ? ` (quedan ${pendientes})` : ""}`));
      const op = it.datos.operacion;
      const reg = op && st.nominas.find(n => tipoDe(n) === "transferencia" && n.estado !== "anulada" && S(n.operacion) === op);
      const otro = op && cola.find(x => x !== it && x.datos && x.datos.operacion === op && x.estado !== "error");
      if (reg) { it.estado = "repetida"; it.nota = `ya registrada (registro N° ${reg.num})` }
      else if (otro) { it.estado = "repetida"; it.nota = `es la misma transferencia de ${otro.nombre}` }
      else it.estado = "lista";
    } catch (e) { it.estado = "error"; it.nota = mensajeError(e) }
    delete it.archivo;
    if (it.estado === "lista" && $("dlgTef").open && !manual && !(actual && actual.estado === "lista")) mostrar(it);
    pintarCola();
  }
  leyendo = false; estadoPdf("");
  if ($("dlgTef").open && !actual && !cola.some(x => x.estado === "lista") && cola.length) {
    const malos = cola.filter(x => x.estado === "error" || x.estado === "repetida");
    if (malos.length) toast(malos.length === 1 ? `${malos[0].nombre}: ${malos[0].nota}` : `${malos.length} comprobantes no se pueden registrar; revisa la lista`);
  }
}

const ESTADOS = { espera: "en espera", leyendo: "leyendo…", lista: "lista para revisar", registrada: "registrada", omitida: "omitida" };
function pintarCola() {
  const ver = cola.length > 1 || cola.some(x => ["error", "repetida", "registrada"].includes(x.estado));
  $("tCola").hidden = !ver;
  if (!ver) return;
  $("tCola").innerHTML = cola.map((it, i) => {
    const d = it.datos, que = d ? `N° ${esc(d.operacion || "?")} · ${esc(d.benef.nombre || d.alias || "?")} · ${d.monto > 0 ? money(d.monto) : "?"}` : esc(it.nombre);
    const est = it.estado === "registrada" ? `registrada (registro N° ${it.num})` : it.nota ? it.nota : ESTADOS[it.estado];
    const ir = it.estado === "lista" && it !== actual ? ` <button type="button" data-i="${i}">revisar</button>` : "";
    return `<li class="${it.estado}${it === actual ? " actual" : ""}"><span>${que}</span><span class="est">${esc(est)}${ir}</span></li>`;
  }).join("");
}

// Llena el formulario con lo leído de un comprobante y elige qué paga.
function mostrar(it) {
  actual = it; manual = false; const d = it.datos;
  prepararForm();
  $("tNum").value = d.operacion; $("tIdTef").value = d.idTef; $("tFecha").value = d.fecha || todayISO(); $("tHora").value = d.hora;
  const digitos = v => S(v).replace(/\D/g, "");
  const cfg = st.config.cuentas.find(c => digitos(c.cuenta) === d.cuentaOrigen);
  if (cfg) { $("tCuenta").value = cfg.cuenta; $("tCuentaOtraL").hidden = true }
  else { $("tCuenta").value = OTRA; $("tCuentaOtraL").hidden = false; $("tCuentaOtra").value = d.cuentaOrigen }
  const fuente = cfg && st.config.fuentes.includes(cfg.fuente) ? cfg.fuente : fuenteDeNombre(d.cuentaNombre);
  if (fuente) $("tFuente").value = fuente;
  $("tRut").value = d.benef.rut ? fmtRut(d.benef.rut) : ""; $("tNombre").value = d.benef.nombre; $("tBanco").value = d.benef.banco; $("tCuentaB").value = d.benef.cuenta;
  $("tMonto").value = d.monto > 0 ? d.monto.toLocaleString("es-CL") : "";
  $("tConcepto").value = d.concepto; $("tMensaje").value = d.mensaje; $("tPreparo").value = d.preparo; $("tAutorizo").value = d.autorizo;
  $("tBenefInfo").textContent = "";

  // Avisos: lo que el OCR no leyó bien y los controles contra el maestro.
  const avisos = d.avisos.map(a => ["warn", a]);
  if (!cfg) avisos.push([fuente ? "info" : "warn", `La cuenta de origen ${d.cuentaOrigen}${d.cuentaNombre ? " (" + d.cuentaNombre + ")" : ""} no está asociada a una fuente en Configuración. ${fuente ? `Se usó ${fuente} por el nombre de la cuenta; revísala.` : "Elige la fuente en “Corregir datos”."} Asóciala en Configuración para que la próxima vez salga sola.`]);
  const prov = st.maestro[d.benef.rut];
  if (prov && ((d.benef.cuenta && S(prov.cuenta).replace(/^0+/, "") !== d.benef.cuenta) || (d.benef.banco && prov.banco !== d.benef.banco)))
    avisos.push(["warn", `Los datos bancarios del comprobante (${M_BANCO[d.benef.banco] || d.benef.bancoNombre} ${d.benef.cuenta}) no son los del maestro de proveedores (${M_BANCO[prov.banco] || prov.banco} ${prov.cuenta}).`]);

  // Qué paga: la combinación de pendientes del RUT que suma el monto.
  const p = pendientes(), ab = combinacionExacta(p.abonos, d.monto), dc = ab ? null : combinacionExacta(p.docs, d.monto, x => NC.has(x.tipo) ? -x.monto : x.monto);
  if (ab) { origen = "abonos"; marcar = new Set(ab.map(x => x.id)) }
  else if (dc) { origen = "documentos"; marcar = new Set(dc.map(x => x.id)) }
  else if (p.abonos.length || p.docs.length) {
    origen = p.abonos.length ? "abonos" : "documentos";
    avisos.push(["warn", `El beneficiario tiene ${p.abonos.length ? p.abonos.length + " abono(s) pendiente(s) en Remuneraciones" : p.docs.length + " documento(s) pendiente(s)"} y ninguna combinación suma ${money(d.monto)}. Marca lo que paga o elige “Sin documento en el panel”.`]);
  } else origen = "suelto";
  items();

  $("tAvisos").innerHTML = avisos.map(([k, a]) => `<li class="${k}">${esc(a)}</li>`).join("");
  $("tAvisos").hidden = !avisos.length;
  mostrarForm(false);
  verCampos(d.avisos.length > 0 || (!cfg && !fuente)); // si el OCR dudó de algo, los campos quedan a la vista
  const quedan = cola.filter(x => x !== it && ["espera", "leyendo", "lista"].includes(x.estado)).length;
  $("tRegistrar").textContent = quedan ? `Registrar y seguir (quedan ${quedan})` : "Registrar transferencia pagada";
  resumen(); pintarCola();
}

// Fuente cuyo nombre aparece en el nombre de la cuenta ("Subvencion General" → GENERAL).
function fuenteDeNombre(nom) {
  const palabras = ` ${cleanName(nom)} `;
  return st.config.fuentes.find(f => cleanName(f) && palabras.includes(` ${cleanName(f)} `)) || "";
}

// Resumen de lo que se va a registrar, desde los campos (refleja las correcciones).
function resumen() {
  if ($("tResumen").hidden && !actual) return;
  const d = actual ? actual.datos : null;
  const cuenta = $("tCuenta").value === OTRA ? S($("tCuentaOtra").value) : $("tCuenta").value;
  const cfg = st.config.cuentas.find(c => c.cuenta === $("tCuenta").value);
  const nomCuenta = cfg ? cfg.nombre : d ? d.cuentaNombre : "";
  const rut = normRut($("tRut").value), monto = parseMonto($("tMonto").value);
  const fila = (k, v) => v ? `<dt>${k}</dt><dd>${v}</dd>` : "";
  $("tResDatos").innerHTML = `<dl>
    ${fila("Transferencia", `<b>N° ${esc($("tNum").value) || "—"}</b> · ${$("tFecha").value ? fmtISO($("tFecha").value) : "sin fecha"}${$("tHora").value ? " " + esc($("tHora").value) : ""}${$("tIdTef").value ? ` · ID TEF ${esc($("tIdTef").value)}` : ""}${d && d.estado ? ` · ${esc(d.estado)}` : ""}`)}
    ${fila("Desde", `<span class="mono">${esc(cuenta) || "—"}</span>${nomCuenta ? " " + esc(nomCuenta) : ""} → fuente <b>${esc($("tFuente").value)}</b>`)}
    ${fila("Beneficiario", `<b>${esc($("tNombre").value) || "—"}</b> · ${rut ? esc(fmtRut(rut)) : "sin RUT"}${$("tBanco").value ? " · " + esc(M_BANCO[$("tBanco").value] || "") : ""}${$("tCuentaB").value ? ` · ${d && d.benef.tipoCuenta ? esc(d.benef.tipoCuenta) + " " : "cuenta "}<span class="mono">${esc($("tCuentaB").value)}</span>` : ""}`)}
    ${fila("Monto", `<span class="monto">${monto > 0 ? money(monto) : "—"}</span>`)}
    ${fila("Concepto", esc($("tConcepto").value) + ($("tMensaje").value ? ` · <span class="hint">mensaje:</span> ${esc($("tMensaje").value)}` : ""))}
    ${fila("Intervinientes", [$("tPreparo").value && "preparó " + esc($("tPreparo").value), $("tAutorizo").value && "autorizó " + esc($("tAutorizo").value)].filter(Boolean).join("; "))}
    ${fila("Archivo", d ? `<span class="hint">${esc(actual.nombre)}</span>` : "")}
  </dl>`;
}

// Completa nombre, banco y cuenta desde el maestro de proveedores o el último abono pagado.
function beneficiario() {
  const rut = normRut($("tRut").value);
  const prov = st.maestro[rut], ab = st.abonos.find(a => a.rut === rut), ult = ultimoAbono(st.nominas, rut);
  const fuente = prov ? { nombre: prov.nombre, banco: prov.banco, cuenta: prov.cuenta, de: "maestro de proveedores" }
    : ab ? { nombre: ab.nombre, banco: ab.banco, cuenta: ab.cuenta, de: "abono pendiente" }
    : ult ? { nombre: ult.p.nombre, banco: ult.p.banco, cuenta: ult.p.cuenta, de: `último pago (nómina N° ${ult.num})` } : null;
  // Solo se reemplaza lo que estaba vacío o lo que el panel completó antes.
  const poner = (id, v) => { if (!$(id).value || $(id).value === autocompletado[id]) { $(id).value = v || ""; autocompletado[id] = $(id).value } };
  if (fuente) { poner("tNombre", fuente.nombre); poner("tBanco", fuente.banco); poner("tCuentaB", fuente.cuenta) }
  $("tBenefInfo").textContent = !rut ? "" : !rutOk(rut) ? "RUT con dígito verificador inválido." : fuente ? `Datos tomados del ${fuente.de}; corrígelos si el comprobante dice otra cosa.` : "RUT sin datos en el panel: escribe el nombre como aparece en el comprobante.";
}

const pendientes = () => {
  const rut = normRut($("tRut").value);
  return { docs: rut ? st.docs.filter(d => d.rut === rut) : [], abonos: rut ? st.abonos.filter(a => a.rut === rut) : [] };
};

// Lista los documentos o abonos pendientes del RUT para marcar los que paga la transferencia.
function items() {
  const p = pendientes();
  $("tOrigen").querySelectorAll("[data-origen]").forEach(b => {
    b.setAttribute("aria-pressed", b.dataset.origen === origen);
    const n = b.dataset.origen === "documentos" ? p.docs.length : b.dataset.origen === "abonos" ? p.abonos.length : null;
    b.textContent = { documentos: "Documentos pendientes", abonos: "Abono de Remuneraciones", suelto: "Sin documento en el panel" }[b.dataset.origen] + (n != null ? ` (${n})` : "");
  });
  const marcados = new Set([...[...$("tItems").querySelectorAll("input:checked")].map(i => i.value), ...marcar]);
  marcar = new Set();
  const monto = parseMonto($("tMonto").value);
  let html = "";
  if (origen === "documentos") {
    html = p.docs.length ? p.docs.map(d => `<label><input type="checkbox" value="${esc(d.id)}"${marcados.has(d.id) || (p.docs.length === 1 && d.monto === monto) ? " checked" : ""}> <span><b class="mono">${esc(d.ndoc)}</b> ${esc(M_TIPO[d.tipo] || "documento tipo " + d.tipo)} del ${fmtFecha(d.fecha)} · ${esc(d.fuente)}${d.dc ? " · " + esc(d.dc) : ""} · <b>${NC.has(d.tipo) ? "−" : ""}${money(d.monto)}</b>${d.hist ? ` <span class="hint">${esc(d.hist)}</span>` : ""}</span></label>`).join("")
      : `<p class="hint">${normRut($("tRut").value) ? "Este RUT no tiene documentos pendientes en el paso 2." : "Escribe el RUT del beneficiario para ver sus documentos pendientes."}</p>`;
  } else if (origen === "abonos") {
    html = p.abonos.length ? p.abonos.map(a => `<label><input type="checkbox" value="${esc(a.id)}"${marcados.has(a.id) || (p.abonos.length === 1 && a.monto === monto) ? " checked" : ""}> <span>${esc(a.concepto || "Abono")}${a.glosa ? " · " + esc(a.glosa) : ""} · ${esc(a.fuente)} · <b>${money(a.monto)}</b>${a.hist ? ` <span class="hint">${esc(a.hist)}</span>` : ""}</span></label>`).join("")
      : `<p class="hint">${normRut($("tRut").value) ? "Este RUT no tiene abonos pendientes en Remuneraciones." : "Escribe el RUT del beneficiario para ver sus abonos pendientes."}</p>`;
  } else html = `<p class="hint">Pago que no está cargado en el panel (por ejemplo, un servicio básico). Queda en la bitácora con su monto, concepto y mensaje.</p>`;
  $("tItems").className = "tef-items"; $("tItems").innerHTML = html;
  $("tItems").querySelectorAll("input").forEach(i => i.onchange = suma);
  suma();
}

function seleccion() {
  const ids = [...$("tItems").querySelectorAll("input:checked")].map(i => i.value);
  const lista = origen === "documentos" ? st.docs.filter(d => ids.includes(d.id)) : origen === "abonos" ? st.abonos.filter(a => ids.includes(a.id)) : [];
  const total = lista.reduce((s, x) => s + (origen === "documentos" && NC.has(x.tipo) ? -x.monto : x.monto), 0);
  return { ids: lista.map(x => x.id), lista, total };
}

function suma() {
  if (origen === "suelto") { $("tSuma").textContent = ""; return }
  const { lista, total } = seleccion(), monto = parseMonto($("tMonto").value);
  $("tSuma").textContent = !lista.length ? "" : `Marcado${lista.length > 1 ? "s" : ""}: ${lista.length} por ${money(total)}` + (monto > 0 ? (total === monto ? " · calza con el monto de la transferencia." : ` · la transferencia es de ${money(monto)} (diferencia ${money(Math.abs(monto - total))}).`) : ".");
}

// Después de registrar u omitir: el siguiente comprobante de la cola, o cerrar.
function siguiente(n) {
  const sig = cola.find(x => x.estado === "lista");
  if (sig) { mostrar(sig); return }
  // Quedan PDF por leer, o con error o repetidos: el diálogo sigue abierto con la cola a la vista.
  if (cola.some(x => ["espera", "leyendo", "error", "repetida"].includes(x.estado))) { actual = null; ocultarRevision(); return }
  $("dlgTef").close(); cola = []; actual = null;
  if (n) abrirNomina(String(n.num));
}

function registrar() {
  const cuentaSel = $("tCuenta").value, cfg = st.config.cuentas.find(c => c.cuenta === cuentaSel);
  const leido = actual ? actual.datos : null;
  const t = {
    operacion: S($("tNum").value).replace(/\s+/g, ""), idTef: S($("tIdTef").value), fecha: $("tFecha").value, hora: $("tHora").value,
    cuentaOrigen: cuentaSel === OTRA ? S($("tCuentaOtra").value).replace(/[^0-9]/g, "") : cuentaSel,
    cuentaNombre: cfg ? S(cfg.nombre) : leido && leido.cuentaOrigen === S($("tCuentaOtra").value).replace(/[^0-9]/g, "") ? S(leido.cuentaNombre) : "",
    fuente: $("tFuente").value, concepto: S($("tConcepto").value), mensaje: S($("tMensaje").value),
    preparo: S($("tPreparo").value), autorizo: S($("tAutorizo").value), obs: S($("tObs").value),
    monto: parseMonto($("tMonto").value), origen, pdf: actual ? actual.nombre : "",
    benef: { rut: normRut($("tRut").value), nombre: S($("tNombre").value), banco: $("tBanco").value, cuenta: S($("tCuentaB").value), email: "", forma: "" }
  };
  const falta = [
    [!t.operacion, "el N° de transferencia", "tNum"], [!t.fecha, "la fecha", "tFecha"], [!t.cuentaOrigen, "la cuenta de origen", cuentaSel === OTRA ? "tCuentaOtra" : "tCuenta"],
    [!t.fuente, "la fuente", "tFuente"], [!rutOk(t.benef.rut), "un RUT válido del beneficiario", "tRut"], [!t.benef.nombre, "el nombre del beneficiario", "tNombre"],
    [!(t.monto > 0), "el monto", "tMonto"], [!t.concepto, "el concepto", "tConcepto"]
  ].find(x => x[0]);
  if (falta) { toast("Falta " + falta[1]); verCampos(true); $(falta[2]).focus(); return }
  if (t.fecha > todayISO()) { toast("La fecha de la transacción no puede ser futura"); verCampos(true); $("tFecha").focus(); return }
  if (leido && leido.estado && !/^autorizada$/i.test(leido.estado) && !confirm(`El comprobante dice “${leido.estado}”, no “Autorizada”. ¿Registrarla igual como pagada?`)) return;
  const repetida = st.nominas.find(n => tipoDe(n) === "transferencia" && n.estado !== "anulada" && S(n.operacion) === t.operacion);
  if (repetida) { toast(`La transferencia N° ${t.operacion} ya está registrada (registro N° ${repetida.num})`); return }
  const sel = seleccion();
  if (origen !== "suelto") {
    if (!sel.ids.length) { toast(`Marca ${origen === "documentos" ? "los documentos" : "el abono"} que paga la transferencia, o elige “Sin documento en el panel”`); return }
    if (sel.total !== t.monto && !confirm(`Lo marcado suma ${money(sel.total)} y la transferencia es de ${money(t.monto)}. ¿Registrarla igual?`)) return;
    const otras = [...new Set(sel.lista.map(x => x.fuente).filter(f => f !== t.fuente))];
    if (otras.length && !confirm(`Lo marcado es de ${otras.join(", ")} y la transferencia sale de ${t.fuente}. En la bitácora y el reporte quedará en ${t.fuente}. ¿Registrarla igual?`)) return;
    if (origen === "abonos") { const a = sel.lista[0]; t.benef.email = S(a.email); t.benef.forma = S(a.forma) }
  }
  t.ids = sel.ids;
  const it = actual;
  accion($("tRegistrar"), async () => {
    try {
      const n = await registrarTransferencia(t);
      toast(`Transferencia N° ${n.operacion} registrada como pagada (registro N° ${n.num}, ${n.fuente}, ${money(n.total)})`);
      if (it) { it.estado = "registrada"; it.num = n.num; siguiente(n) }
      else { $("dlgTef").close(); abrirNomina(String(n.num)) }
    } catch (e) { toast("No se registró: " + mensajeError(e)) }
  });
}

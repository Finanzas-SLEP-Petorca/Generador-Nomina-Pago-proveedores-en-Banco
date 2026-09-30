// Registrar una transferencia electrónica directa (pago sin nómina) en la bitácora.
// El comprobante de BancoEstado viene como imagen dentro del PDF, así que los
// datos se copian a mano; el panel completa lo que ya conoce (proveedor, abono,
// fuente de la cuenta de origen) y verifica duplicados y montos.

import { BANCOS, NC, M_TIPO } from "../catalogos.js";
import { S, normRut, rutOk, fmtRut, parseMonto, money, fmtFecha, todayISO, tipoDe, ultimoAbono } from "../formato.js";
import { st, registrarTransferencia } from "../datos.js";
import { $, esc, toast, accion, fOpts, fillSelect, mensajeError } from "./comun.js";
import { abrirNomina } from "./paso4.js";

let origen = "suelto", autocompletado = {};
const OTRA = "__otra";

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
}

function abrir() {
  $("tefForm").reset(); origen = "suelto"; autocompletado = {};
  $("tFecha").value = todayISO();
  const cuentas = st.config.cuentas;
  $("tCuenta").innerHTML = (cuentas.length ? `<option value="">Elige la cuenta</option>` : "") + cuentas.map(c => `<option value="${esc(c.cuenta)}">${esc(c.cuenta)}${c.nombre ? " · " + esc(c.nombre) : ""}</option>`).join("") + `<option value="${OTRA}">Otra cuenta…</option>`;
  $("tCuentaOtraL").hidden = !!cuentas.length;
  if (!cuentas.length) $("tCuenta").value = OTRA;
  $("tFuente").innerHTML = fOpts(st.config.fuentes[0]);
  $("tBenefInfo").textContent = cuentas.length ? "" : "Tip: en Configuración puedes asociar cada cuenta de origen a su fuente, así la fuente se completa sola.";
  items();
  $("dlgTef").showModal();
  $("tNum").focus();
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
  const marcados = new Set([...$("tItems").querySelectorAll("input:checked")].map(i => i.value));
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

function registrar() {
  const cuentaSel = $("tCuenta").value, cfg = st.config.cuentas.find(c => c.cuenta === cuentaSel);
  const t = {
    operacion: S($("tNum").value).replace(/\s+/g, ""), idTef: S($("tIdTef").value), fecha: $("tFecha").value, hora: $("tHora").value,
    cuentaOrigen: cuentaSel === OTRA ? S($("tCuentaOtra").value).replace(/[^0-9]/g, "") : cuentaSel, cuentaNombre: cfg ? S(cfg.nombre) : "",
    fuente: $("tFuente").value, concepto: S($("tConcepto").value), mensaje: S($("tMensaje").value),
    preparo: S($("tPreparo").value), autorizo: S($("tAutorizo").value), obs: S($("tObs").value),
    monto: parseMonto($("tMonto").value), origen,
    benef: { rut: normRut($("tRut").value), nombre: S($("tNombre").value), banco: $("tBanco").value, cuenta: S($("tCuentaB").value), email: "", forma: "" }
  };
  const falta = [
    [!t.operacion, "el N° de transferencia", "tNum"], [!t.fecha, "la fecha", "tFecha"], [!t.cuentaOrigen, "la cuenta de origen", cuentaSel === OTRA ? "tCuentaOtra" : "tCuenta"],
    [!t.fuente, "la fuente", "tFuente"], [!rutOk(t.benef.rut), "un RUT válido del beneficiario", "tRut"], [!t.benef.nombre, "el nombre del beneficiario", "tNombre"],
    [!(t.monto > 0), "el monto", "tMonto"], [!t.concepto, "el concepto", "tConcepto"]
  ].find(x => x[0]);
  if (falta) { toast("Falta " + falta[1]); $(falta[2]).focus(); return }
  if (t.fecha > todayISO()) { toast("La fecha de la transacción no puede ser futura"); $("tFecha").focus(); return }
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
  accion($("tRegistrar"), async () => {
    try {
      const n = await registrarTransferencia(t);
      $("dlgTef").close();
      toast(`Transferencia N° ${n.operacion} registrada como pagada (registro N° ${n.num}, ${n.fuente}, ${money(n.total)})`);
      abrirNomina(String(n.num));
    } catch (e) { toast("No se registró: " + mensajeError(e)) }
  });
}


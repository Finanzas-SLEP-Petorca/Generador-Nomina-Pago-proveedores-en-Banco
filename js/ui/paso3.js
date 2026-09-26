// Paso 3: revisar y generar una nómina por fuente.

import { S, build, toTxt, activeFuentes, fileName, expandPrefijo, money } from "../formato.js";
import { bankWorkbook } from "../excel.js";
import { st, guardarConfig, generarNomina } from "../datos.js";
import { $, esc, toast, accion, descargar, prefs, guardarPrefs, go, mensajeError } from "./comun.js";
import { abrirNomina } from "./paso4.js";

const LOGO = "assets/logo_bancoestado.png";
let current = null, prefijoEditado = false;

export const ctxBuild = () => ({ docs: st.docs, maestro: st.maestro, nominas: st.nominas, group: prefs.group !== false, email: st.config.emailDefecto });
export const construir = f => build(f, ctxBuild());
const nombreArchivo = f => fileName($("cfgName").value, f);

// Refresca los campos que vienen de pago_config/general sin pisar lo que se escribe.
export function syncCampos() {
  if (!prefijoEditado && document.activeElement !== $("cfgName")) $("cfgName").value = expandPrefijo(st.config.prefijoArchivo);
  if (document.activeElement !== $("cfgEmail")) $("cfgEmail").value = st.config.emailDefecto;
}

export function init() {
  $("cfgName").oninput = () => { prefijoEditado = true; if (current && current.nDocs) $("fileNameInfo").textContent = "Archivo: " + nombreArchivo(current.fuente) + ".txt" };
  $("cfgGroup").checked = prefs.group !== false;
  // Mientras se escribe, la vista previa usa el valor local; al salir del campo se guarda.
  $("cfgEmail").oninput = () => { st.config.emailDefecto = S($("cfgEmail").value); renderReview() };
  $("cfgEmail").onchange = () => accion(null, () => guardarConfig({ emailDefecto: S($("cfgEmail").value) }));
  $("cfgGroup").onchange = () => { prefs.group = $("cfgGroup").checked; guardarPrefs(); renderReview() };
  $("vPl").onclick = () => setView(true); $("vTx").onclick = () => setView(false);

  $("btnXlsx").onclick = () => accion($("btnXlsx"), async () => {
    const r = renderReview(); if (r.errs || !r.lines.length) return;
    try { descargar(nombreArchivo(r.fuente) + ".xlsx", await bankWorkbook(r.lines)) }
    catch (e) { toast("No se pudo armar el Excel: " + mensajeError(e)) }
  });
  $("btnCopy").onclick = async () => {
    const r = renderReview(); if (r.errs || !r.lines.length) return; const t = toTxt(r.lines);
    try { await navigator.clipboard.writeText(t); toast("Texto copiado. Pégalo en el Bloc de notas y guárdalo como " + nombreArchivo(r.fuente) + ".txt") }
    catch (e) { const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand("copy") } catch (_) { } ta.remove(); toast(ok ? "Texto copiado" : "El navegador bloqueó el portapapeles") }
  };
  $("btnGen").onclick = () => {
    const r = renderReview(); if (r.errs || !r.lines.length) return;
    const num = st.nextNum;
    if (!confirm(`Se registrará la nómina N° ${num} (${r.fuente}): ${r.nBen} pagos por ${money(r.total)}.\n\nSus ${r.nDocs} documentos salen de pendientes y quedan asociados a esta nómina. Luego se descarga el .txt.`)) return;
    accion($("btnGen"), async () => {
      const archivo = nombreArchivo(r.fuente);
      const n = await generarNomina(r, archivo);
      abrirNomina(String(n.num)); go(4);
      descargar(n.archivo + ".txt", toTxt(n.lineas));
      if (n.num !== num) toast(`Otro usuario generó antes la N° ${num}: esta nómina quedó con el N° ${n.num}. Se descargó ${n.archivo}.txt`);
    });
  };
}

function setView(pl) { $("vPl").setAttribute("aria-pressed", pl); $("vTx").setAttribute("aria-pressed", !pl); $("bePrev").hidden = !pl; $("txPrev").hidden = pl }

export function renderReview() {
  const fs = activeFuentes(st.docs, st.config.fuentes);
  const all = fs.map(construir);
  if (!fs.includes(prefs.cur)) prefs.cur = fs[0] || st.config.fuentes[0];
  $("tbFuentes").innerHTML = all.length ? all.map(r => `<tr data-f="${esc(r.fuente)}" class="${r.fuente === prefs.cur ? "cur" : ""}" tabindex="0"><td><b>${esc(r.fuente)}</b></td><td class="num">${r.nBen}</td><td class="num">${r.nDocs}</td><td class="num">${money(r.total)}</td><td>${r.errs ? `<span class="tag err">${r.errs} errores</span>` : r.warns ? `<span class="tag wrn">lista, ${r.warns} avisos</span>` : `<span class="tag okk">lista</span>`}</td></tr>`).join("")
    : `<tr><td colspan="5" class="empty">No hay documentos marcados para pagar.</td></tr>`;
  $("tbFuentes").querySelectorAll("tr[data-f]").forEach(tr => { const pick = () => { prefs.cur = tr.dataset.f; guardarPrefs(); renderReview() }; tr.onclick = pick; tr.onkeydown = e => { if (e.key === "Enter") pick() } });
  $("fBenT").textContent = all.reduce((s, r) => s + r.nBen, 0); $("fDocT").textContent = all.reduce((s, r) => s + r.nDocs, 0); $("fTotT").textContent = money(all.reduce((s, r) => s + r.total, 0));
  const nUn = st.docs.filter(d => !d.sel).length;
  $("unselInfo").textContent = nUn ? `${nUn} documentos desmarcados quedan fuera de estas nóminas.` : "";
  const r = all.find(x => x.fuente === prefs.cur) || construir(prefs.cur); current = r;
  $("curTitle").textContent = "Nómina " + r.fuente;
  $("sBen").textContent = r.nBen; $("sDocs").textContent = r.nDocs; $("sTotal").textContent = money(r.total);
  const ul = $("issues");
  if (!r.nDocs) ul.innerHTML = `<li class="warn">No hay documentos marcados en esta fuente.</li>`;
  else if (!r.issues.length) ul.innerHTML = `<li class="ok" style="list-style:none">Todo cuadra con las reglas del instructivo. El archivo está listo para subir.</li>`;
  else ul.innerHTML = r.issues.sort((a, b) => a.lvl === b.lvl ? 0 : a.lvl === "error" ? -1 : 1).map(i => `<li class="${i.lvl}"><b>${esc(i.where)}:</b> ${esc(i.msg)}</li>`).join("");
  $("preview").innerHTML = r.lines.length ? r.lines.map(l => `<span class="ln r${l.tipo}">${l.f.slice(0, l.tipo === 1 ? 9 : 5).map(esc).join('<span class="t">⇥</span>')}${l.tipo === 2 ? '<span class="t">⇥⇥⇥⇥</span>' : ""}</span>`).join("") : `<span class="ln r2">(vacío)</span>`;
  renderBankPreview(r.lines);
  const blocked = r.errs > 0 || !r.lines.length;
  ["btnGen", "btnXlsx", "btnCopy"].forEach(id => $(id).disabled = blocked);
  $("btnGen").textContent = blocked ? "Generar nómina y registrar en bitácora" : `Generar nómina N° ${st.nextNum} (${r.fuente}) y registrar`;
  $("fileNameInfo").textContent = r.nDocs ? "Archivo: " + nombreArchivo(r.fuente) + ".txt" : "";
  return r;
}

// Vista previa con los colores de la planilla oficial (naranjos #FF6600 y #FF9900).
function renderBankPreview(lines) {
  const e = v => esc(v);
  const H1 = [["1", "o1"], ["RUT", "o1"], ["RAZÓN SOCIAL O NOMBRES Y APELLIDOS", "o1"], ["EMAIL", "o2"], ["BANCO", "o1"], ["FORMA DE PAGO", "o1"], ["Nº DE CUENTA", "o1"], ["SECTOR FIN", "o1"], ["MONTO", "o1"]];
  const H2 = [["2", "o2"], ["FECHA DOC", "o2"], ["MONTO DOC", "o2"], ["NÚMERO DOC", "o2"], ["TIPO DOC", "o2"]];
  let h = `<table><tbody><tr class="logo"><td colspan="3"><img src="${LOGO}" alt="BancoEstado"></td><td class="ttl">Pago (DET-SUBDET)</td><td colspan="4"></td><td class="ver">Versión 1.1</td></tr>`;
  h += `<tr><td colspan="3"></td><td class="sub9">(9 Columnas)</td><td colspan="5"></td></tr>`;
  h += `<tr class="h">${H1.map(([t, c]) => `<td class="${c}">${t}</td>`).join("")}</tr>`;
  h += `<tr class="h">${H2.map(([t, c]) => `<td class="${c}">${t}</td>`).join("")}<td colspan="4"></td></tr>`;
  lines.forEach(l => {
    const f = l.f;
    h += l.tipo === 1 ? `<tr><td>1</td><td>${e(f[1])}</td><td>${e(f[2])}</td><td>${e(f[3])}</td><td>${e(f[4])}</td><td>${e(f[5])}</td><td>${e(f[6])}</td><td>${e(f[7])}</td><td class="r">${e(f[8])}</td></tr>`
      : `<tr><td>2</td><td>${e(f[1])}</td><td class="r">${e(f[2])}</td><td>${e(f[3])}</td><td>${e(f[4])}</td><td colspan="4"></td></tr>`
  });
  $("bePrev").innerHTML = h + `</tbody></table>`;
}

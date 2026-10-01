// Utilidades de interfaz compartidas por los pasos: DOM, avisos, descargas,
// preferencias locales y navegación.

import { S } from "../formato.js";
import { st, Conflicto } from "../datos.js";

export const $ = id => document.getElementById(id);
export const esc = s => S(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export function fillSelect(el, arr, withCode = true) { el.innerHTML = arr.map(([c, n]) => `<option value="${c}">${withCode ? c + " " : ""}${n}</option>`).join("") }
export const fOpts = sel => st.config.fuentes.map(f => `<option value="${esc(f)}"${f === sel ? " selected" : ""}>${esc(f)}</option>`).join("");

let tt;
export function toast(m) {
  const t = $("toast");
  // Con un diálogo abierto, el aviso va dentro de él: si no, queda detrás del diálogo y no se ve.
  const destino = [...document.querySelectorAll("dialog[open]")].pop() || document.body;
  if (t.parentElement !== destino) destino.appendChild(t);
  t.textContent = m; t.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 4200);
}

// Mensaje legible para un error de Firestore o de validación.
export function mensajeError(e) {
  if (e instanceof Conflicto) return e.message;
  if (e && e.code === "permission-denied") return "Firestore rechazó la escritura (permiso denegado). Revisa que tu correo esté en la lista de acceso y que los datos cumplan las reglas.";
  if (e && e.code === "unavailable") return "Sin conexión con Firestore. Revisa tu red e inténtalo de nuevo.";
  if (e && e.code === "aborted") return "Otro usuario modificó los mismos datos al mismo tiempo. Inténtalo de nuevo.";
  return (e && e.message) || String(e);
}
// Ejecuta una acción asíncrona deshabilitando el botón y mostrando el error.
export async function accion(btn, fn) {
  if (btn) btn.disabled = true;
  try { return await fn() }
  catch (e) { console.error(e); toast(mensajeError(e)); return undefined }
  finally { if (btn) btn.disabled = false }
}

// ---------- descargas con Blob ----------
const MIME = { txt: "text/plain;charset=utf-8", csv: "text/csv;charset=utf-8", json: "application/json", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pdf: "application/pdf" };
export function descargar(filename, data) {
  const ext = filename.split(".").pop().toLowerCase();
  const blob = new Blob([data], { type: MIME[ext] || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  toast("Archivo descargado: " + filename);
}

// ---------- preferencias de interfaz (solo localStorage; nunca datos) ----------
const K_PREFS = "pago.prefs.v1";
export const prefs = Object.assign({ step: "1", defFuente: "GENERAL", filt: "*", cur: "GENERAL", bitFuente: "*", group: true },
  (() => { try { return JSON.parse(localStorage.getItem(K_PREFS)) || {} } catch (e) { return {} } })());
export function guardarPrefs() { try { localStorage.setItem(K_PREFS, JSON.stringify(prefs)) } catch (e) { } }

// ---------- render y navegación (los define app.js) ----------
export const vista = { renderAll() { }, go() { } };
export const renderAll = () => vista.renderAll();
export const go = n => vista.go(n);

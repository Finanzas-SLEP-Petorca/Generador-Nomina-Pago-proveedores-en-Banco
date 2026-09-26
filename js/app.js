// Punto de entrada: sesión, acceso, suscripciones y render general.

import { configurado, EMU, entrar, salir, alCambiarUsuario } from "./firebase.js";
import { st, alCambiar, todoListo, verificarAcceso, suscribir, desuscribir } from "./datos.js";
import { $, toast, vista, prefs, guardarPrefs, mensajeError } from "./ui/comun.js";
import * as paso1 from "./ui/paso1.js";
import * as paso2 from "./ui/paso2.js";
import * as paso3 from "./ui/paso3.js";
import * as paso4 from "./ui/paso4.js";
import * as config from "./ui/config.js";
import { activeFuentes } from "./formato.js";

// ---------- pantallas ----------
function pantalla(modo, texto = "") {
  $("acceso").hidden = modo === "app";
  $("app").hidden = modo !== "app";
  $("usuario").hidden = modo !== "app";
  $("accesoMsg").textContent = texto;
  $("btnEntrar").hidden = modo !== "login";
  $("btnSalirAcceso").hidden = modo !== "sinacceso";
}

// ---------- navegación ----------
function go(n) {
  n = String(n);
  document.querySelectorAll(".steps button").forEach(b => b.setAttribute("aria-selected", b.dataset.step === n));
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("on", p.id === "p" + n));
  $("btnConfig").setAttribute("aria-pressed", n === "5");
  prefs.step = n; guardarPrefs();
  if (n === "3") paso3.renderReview();
  if (n === "4") paso4.renderBit();
  if (n === "5") config.renderConfig();
  window.scrollTo({ top: 0 });
}

function renderAll() {
  if (!todoListo()) return;
  $("cargando").hidden = true;
  $("cntProv").textContent = Object.keys(st.maestro).length; $("cntDocs").textContent = st.docs.filter(d => d.sel).length + "/" + st.docs.length;
  paso2.renderFuentes(); paso1.renderProv(); paso2.renderDocs(); paso3.syncCampos();
  const errs = activeFuentes(st.docs, st.config.fuentes).map(paso3.construir).reduce((s, r) => s + r.errs, 0);
  $("cntErr").textContent = errs ? errs + " errores" : "";
  if ($("p3").classList.contains("on")) paso3.renderReview();
  paso4.renderBitCount(); if ($("p4").classList.contains("on")) paso4.renderBit();
  if ($("p5").classList.contains("on")) config.renderConfig();
}
vista.renderAll = renderAll;
vista.go = go;

// ---------- arranque ----------
document.querySelectorAll(".steps button").forEach(b => b.addEventListener("click", () => go(b.dataset.step)));
// Configuración abre y cierra, volviendo al paso en que se estaba.
$("btnConfig").onclick = () => { if ($("p5").classList.contains("on")) go(prefs.lastStep || "1"); else { prefs.lastStep = prefs.step; go(5) } };
[paso1, paso2, paso3, paso4, config].forEach(m => m.init());

let errorMostrado = null;
alCambiar(() => {
  if (st.error && st.error !== errorMostrado) {
    errorMostrado = st.error;
    if (st.error.code === "permission-denied") { desuscribir(); pantalla("sinacceso", "Firestore dejó de permitir el acceso a esta cuenta. Si crees que es un error, pide que revisen la lista de acceso."); return }
    toast("Error de conexión con Firestore: " + mensajeError(st.error));
  }
  renderAll();
});

$("btnEntrar").onclick = async () => {
  $("btnEntrar").disabled = true;
  try { await entrar() }
  catch (e) { if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") $("accesoMsg").textContent = "No se pudo iniciar sesión: " + (e.code === "auth/unauthorized-domain" ? "este dominio no está autorizado en Firebase Authentication (ver README)." : mensajeError(e)) }
  finally { $("btnEntrar").disabled = false }
};
const cerrar = async () => { desuscribir(); await salir() };
$("btnSalir").onclick = cerrar; $("btnSalirAcceso").onclick = cerrar;

if (!configurado) {
  pantalla("config", "Falta la configuración de Firebase: pega el objeto firebaseConfig en js/firebase-config.js (ver README).");
} else {
  if (EMU) document.body.classList.add("emu");
  pantalla("cargando", "Conectando…");
  alCambiarUsuario(async user => {
    if (!user) { st.email = ""; st.admin = false; pantalla("login", "Entra con tu cuenta institucional de Google."); return }
    pantalla("cargando", "Verificando acceso de " + user.email + "…");
    try {
      if (!(await verificarAcceso(user.email))) { pantalla("sinacceso", `La cuenta ${user.email} no tiene acceso a este panel. Pide que la agreguen a la lista de acceso (pAllowed).`); return }
    } catch (e) { pantalla("sinacceso", "No se pudo verificar el acceso: " + mensajeError(e)); return }
    $("usuarioEmail").textContent = user.email + (st.admin ? " · admin" : "");
    pantalla("app"); $("cargando").hidden = false;
    suscribir();
    go(["1", "2", "3", "4", "5"].includes(prefs.step) ? prefs.step : "1");
  });
}

// Inicialización de Firebase, acceso por enlace al correo (igual que las
// otras apps del proyecto) y firma de escrituras.
// SDK modular v10 con versión fijada. Sin caché persistente: los datos
// bancarios no quedan guardados en el navegador (solo en memoria).

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, GoogleAuthProvider, signInWithCredential, signOut, onAuthStateChanged, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import * as fs from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export { fs };

// Modo emulador, solo en el computador propio: http://localhost:5000/?emulador
// Usa los emuladores locales de Auth (9099) y Firestore (8080); ver README.
export const EMU = ["localhost", "127.0.0.1"].includes(location.hostname) && new URLSearchParams(location.search).has("emulador");

export const configurado = EMU || !Object.values(firebaseConfig).some(v => String(v).includes("PEGAR"));

const cfg = EMU ? { apiKey: "demo-key", authDomain: "localhost", projectId: "demo-pago" } : firebaseConfig;
export const app = configurado ? initializeApp(cfg) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? fs.getFirestore(app) : null;

if (EMU && app) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  fs.connectFirestoreEmulator(db, "127.0.0.1", 8080);
  // Entrada directa para pruebas locales, sin enviar el enlace.
  window.__entrarEmulador = email => signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true })));
}

// El correo se recuerda solo entre el envío y la apertura del enlace.
const CLAVE_CORREO = "pago.correoEnlace";
const volver = () => location.origin + location.pathname + (EMU ? "?emulador" : "");

export async function enviarEnlace(email) {
  await sendSignInLinkToEmail(auth, email, { url: volver(), handleCodeInApp: true });
  try { localStorage.setItem(CLAVE_CORREO, email) } catch (e) { }
}

// Si la página se abrió desde el enlace del correo, completa el ingreso.
export async function completarEnlace() {
  if (!isSignInWithEmailLink(auth, location.href)) return false;
  let email = null;
  try { email = localStorage.getItem(CLAVE_CORREO) } catch (e) { }
  if (!email) email = prompt("Confirma tu correo para completar el acceso:");
  if (!email) return false;
  await signInWithEmailLink(auth, email.trim().toLowerCase(), location.href);
  history.replaceState(null, "", volver());
  try { localStorage.removeItem(CLAVE_CORREO) } catch (e) { }
  return true;
}
export const salir = () => signOut(auth);
export const alCambiarUsuario = cb => onAuthStateChanged(auth, cb);

// Toda escritura va firmada: las reglas exigen updatedBy = correo del
// usuario y updatedAt = hora del servidor.
export const firma = email => ({ updatedBy: email, updatedAt: fs.serverTimestamp() });

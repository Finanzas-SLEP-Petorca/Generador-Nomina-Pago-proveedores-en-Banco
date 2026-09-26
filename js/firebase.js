// Inicialización de Firebase, autenticación con Google y firma de escrituras.
// SDK modular v10 con versión fijada. Sin caché persistente: los datos
// bancarios no quedan guardados en el navegador (solo en memoria).

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithCredential, signOut, onAuthStateChanged, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
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
  // Entrada directa para pruebas locales, sin la ventana de Google.
  window.__entrarEmulador = email => signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true })));
}

const proveedor = new GoogleAuthProvider();
proveedor.setCustomParameters({ prompt: "select_account" });

export const entrar = () => signInWithPopup(auth, proveedor);
export const salir = () => signOut(auth);
export const alCambiarUsuario = cb => onAuthStateChanged(auth, cb);

// Toda escritura va firmada: las reglas exigen updatedBy = correo del
// usuario y updatedAt = hora del servidor.
export const firma = email => ({ updatedBy: email, updatedAt: fs.serverTimestamp() });

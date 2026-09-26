// Configuración web de Firebase: la MISMA de las otras apps del proyecto
// (Calendario de permisos, Monitoreo SEP, Déficit P02, Visor SAF/SPYCG).
// Se copia desde la consola de Firebase: Configuración del proyecto →
// General → Tus apps → Configuración del SDK (objeto firebaseConfig).
//
// Es pública por diseño: la seguridad la dan las reglas de Firestore
// (firestore/bloque_pago.rules) y la lista de acceso pAllowed().

export const firebaseConfig = {
  apiKey: "AIzaSyBfYE16R3s3EVfn8A3dEUROJjC1vWdQ118",
  authDomain: "slep-petorca-finanzas-permisos.firebaseapp.com",
  projectId: "slep-petorca-finanzas-permisos",
  storageBucket: "slep-petorca-finanzas-permisos.firebasestorage.app",
  messagingSenderId: "1032729181983",
  appId: "1:1032729181983:web:3a33171e171ea6adc4ba2a"
};

// Configuración web de Firebase: la MISMA de las otras apps del proyecto
// (Calendario de permisos, Monitoreo SEP, Déficit P02, Visor SAF/SPYCG).
// Se copia desde la consola de Firebase: Configuración del proyecto →
// General → Tus apps → Configuración del SDK (objeto firebaseConfig).
//
// Es pública por diseño: la seguridad la dan las reglas de Firestore
// (firestore/bloque_pago.rules) y la lista de acceso pAllowed().

// PEGAR AQUÍ la configuración: reemplaza cada "PEGAR_AQUI".
export const firebaseConfig = {
  apiKey: "PEGAR_AQUI",
  authDomain: "PEGAR_AQUI",
  projectId: "PEGAR_AQUI",
  storageBucket: "PEGAR_AQUI",
  messagingSenderId: "PEGAR_AQUI",
  appId: "PEGAR_AQUI"
};

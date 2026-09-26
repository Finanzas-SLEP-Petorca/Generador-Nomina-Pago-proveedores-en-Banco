// Arma un archivo de reglas completo para el emulador: el bloque del panel
// (firestore/bloque_pago.rules) dentro del esqueleto del archivo de la
// consola, antes del bloque final que deniega todo lo no declarado.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const bloque = readFileSync(new URL("../firestore/bloque_pago.rules", import.meta.url), "utf8");
const reglas = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
${bloque}
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
`;
mkdirSync(new URL("./.generado/", import.meta.url), { recursive: true });
writeFileSync(new URL("./.generado/firestore.rules", import.meta.url), reglas);
console.log("Reglas de prueba: tests/.generado/firestore.rules");

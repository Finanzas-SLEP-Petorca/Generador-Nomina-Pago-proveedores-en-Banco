// Empaqueta Firebase 10.14.1 (la versión que carga el panel desde gstatic)
// para servirlo localmente en la prueba de punta a punta, sin red.
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
const dir = new URL("./.generado/fb-src/", import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
for (const m of ["app", "auth", "firestore"]) writeFileSync(dir + `firebase-${m}.js`, `export * from "firebase10/${m}";\n`);
await build({ entryPoints: ["app", "auth", "firestore"].map(m => dir + `firebase-${m}.js`), bundle: true, format: "esm", splitting: true, platform: "browser", outdir: new URL("./.generado/fb/", import.meta.url).pathname, logLevel: "warning" });
console.log("Firebase 10.14.1 empaquetado en tests/.generado/fb/");

// Versiona los archivos del sitio para que el navegador no use una copia
// vieja después de publicar (GitHub Pages los deja 10 minutos en caché).
// Escribe en index.html un import map con ?v=<hash del contenido> para cada
// módulo de js/ y lo mismo en la hoja de estilos. Correr antes de cada commit:
//   node tests/versionar.mjs          (actualiza)
//   node tests/versionar.mjs --revisar (falla si index.html quedó desactualizado)
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hash = f => createHash("sha256").update(readFileSync(path.join(raiz, f))).digest("hex").slice(0, 10);
const listar = d => readdirSync(path.join(raiz, d)).flatMap(n => { const r = d + "/" + n; return statSync(path.join(raiz, r)).isDirectory() ? listar(r) : r.endsWith(".js") ? [r] : [] });

const modulos = listar("js").sort();
const mapa = Object.fromEntries(modulos.map(f => ["./" + f, "./" + f + "?v=" + hash(f)]));
const bloque = `<script type="importmap">\n${JSON.stringify({ imports: mapa }, null, 1)}\n</script>`;

const pIndex = path.join(raiz, "index.html");
const antes = readFileSync(pIndex, "utf8");
let html = antes.replace(/<script type="importmap">[\s\S]*?<\/script>\n?/, "");
html = html.replace(/<link rel="stylesheet" href="css\/panel\.css(\?v=[^"]*)?">/, `<link rel="stylesheet" href="css/panel.css?v=${hash("css/panel.css")}">`);
// El import map va antes del primer script de módulo.
// El punto de entrada se importa desde un script en línea para que también
// pase por el import map (un src="" no lo usa).
html = html.replace(/<script type="module"( src="js\/app\.js">|>import "\.\/js\/app\.js";)<\/script>/, bloque + '\n<script type="module">import "./js/app.js";</script>');

if (process.argv.includes("--revisar")) {
  if (html !== antes) { console.error("index.html tiene versiones viejas: corre node tests/versionar.mjs"); process.exit(1) }
  console.log("Versiones al día.");
} else {
  writeFileSync(pIndex, html);
  console.log(`Versionados ${modulos.length} módulos y css/panel.css en index.html`);
}

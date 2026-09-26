// Selector de tema Claro / Oscuro / Sistema, igual que el Visor SAF/SPYCG.
// La elección es una preferencia de interfaz y queda en localStorage.

const CLAVE = "pago.tema";
const oscuroSistema = matchMedia("(prefers-color-scheme: dark)");

function aplicar(t) {
  const tema = t === "light" || t === "dark" ? t : "system";
  if (tema === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = tema;
  document.querySelectorAll("[data-tema]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tema === tema)));
  const efectivo = tema === "system" ? (oscuroSistema.matches ? "oscuro" : "claro") : (tema === "dark" ? "oscuro" : "claro");
  const b = document.querySelector('[data-tema="system"]');
  if (b) b.title = `Igual que el sistema operativo (ahora: ${efectivo})`;
}
const guardado = () => { try { return localStorage.getItem(CLAVE) } catch (e) { return null } };

export function init() {
  aplicar(guardado());
  document.querySelectorAll("[data-tema]").forEach(b => b.addEventListener("click", () => {
    aplicar(b.dataset.tema);
    try { localStorage.setItem(CLAVE, b.dataset.tema) } catch (e) { }
  }));
  oscuroSistema.addEventListener("change", () => aplicar(guardado()));
}

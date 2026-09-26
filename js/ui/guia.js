// Guía "Cómo se usa": flujo completo y detalle de cada paso, para quien
// use el panel por primera vez. Se abre en la sección del paso en que se está.

import { $, prefs } from "./comun.js";

const SECCIONES = [
  {
    id: "flujo", titulo: "El flujo en 6 pasos", html: `
    <p>El panel arma los archivos de carga masiva de pago a proveedores de BancoEstado (formato DET-SUBDET, 9 columnas), con <b>una nómina por fuente de financiamiento</b>. Todo queda guardado en Firebase y el equipo lo ve al instante.</p>
    <ol class="guia-pasos">
      <li><b>Proveedores.</b> Verifica que el proveedor esté en el maestro con sus datos bancarios. Si no está, agrégalo.</li>
      <li><b>Documentos a pagar.</b> Carga las facturas o boletas y deja <b>marcadas</b> las que se pagan ahora.</li>
      <li><b>Revisar y generar.</b> Corrige los errores y genera la nómina de cada fuente. Se descargan el <b>.txt</b> y el <b>Excel BancoEstado</b>.</li>
      <li><b>Subir al banco.</b> Sube el .txt en el portal de BancoEstado. Luego, en la Bitácora, pulsa <b>Marcar como cargada</b> con la fecha de carga y la fecha de pago.</li>
      <li><b>Resultado.</b> Desde las 14:00 del día de pago, registra el resultado: <b>Pagado</b> o <b>Rechazado</b> con su motivo.</li>
      <li><b>Rechazos.</b> Corrige los datos bancarios del proveedor y pulsa <b>Volver a pendientes</b>: sus documentos se pagan en otra nómina.</li>
    </ol>`
  },
  {
    id: "p1", titulo: "1. Proveedores", html: `
    <ul>
      <li><b>Agregar uno:</b> completa el formulario y pulsa <b>Guardar proveedor</b>. <b>Usar Cuenta RUT</b> llena la cuenta con el RUT sin dígito verificador (BancoEstado).</li>
      <li><b>Carga masiva:</b> pega filas copiadas desde Excel en el orden RUT ⇥ Nombre ⇥ Email ⇥ Código banco ⇥ Forma de pago ⇥ N° cuenta ⇥ Sector, o usa <b>Importar archivo</b> (.xls, .xlsx, .csv). También acepta una <b>planilla de pago anterior del banco</b>: toma los proveedores y sus documentos.</li>
      <li><b>Editar:</b> toca la fila del proveedor. Los cambios de banco, cuenta o forma de pago quedan en el <b>historial del proveedor</b> con el antes y el después.</li>
      <li>La razón social se limpia sola: mayúsculas, sin tildes ni ñ, máximo 60 caracteres. El panel revisa el dígito verificador del RUT, que la forma 02 sea solo con BancoEstado y que la cuenta tenga solo dígitos.</li>
      <li>Cambiar el RUT o eliminar un proveedor lo pueden hacer solo los administradores.</li>
    </ul>`
  },
  {
    id: "p2", titulo: "2. Documentos a pagar", html: `
    <ul>
      <li><b>Fuentes de financiamiento:</b> cada fuente (GENERAL, SEP, PIE, FAEP…) genera su propia nómina. Puedes agregar fuentes nuevas.</li>
      <li><b>Pegar documentos:</b> RUT ⇥ Fecha ⇥ Monto ⇥ N° doc ⇥ Tipo doc ⇥ Fuente ⇥ DC. La fuente y el DC son opcionales; las filas sin fuente van a la que elijas en “Filas sin fuente van a”.</li>
      <li><b>Plantilla Excel:</b> <b>Descargar plantilla para completar</b> trae listas desplegables de tipo de documento y de fuentes. Complétala y súbela con <b>Importar archivo</b>. Si el nombre del archivo incluye la fuente (por ejemplo <code>documentos_SEP.xlsx</code>), los documentos van a esa fuente.</li>
      <li><b>Marcar para pagar:</b> solo los documentos marcados entran en la nómina. Los desmarcados quedan guardados para otro día.</li>
      <li>En la barra de la tabla puedes <b>filtrar por fuente</b>, <b>mover</b> los marcados a otra fuente o <b>quitarlos</b>.</li>
      <li>Las notas de crédito (tipos 60 y 61) se <b>restan</b> del total del proveedor.</li>
      <li>Un documento sin monto válido no se agrega; el aviso dice cuáles quedaron fuera.</li>
    </ul>`
  },
  {
    id: "p3", titulo: "3. Revisar y generar", html: `
    <ul>
      <li>La tabla muestra una fila por fuente con sus documentos marcados y el estado: <span class="tag okk">lista</span> o <span class="tag err">N errores</span>. Toca una fuente para revisarla.</li>
      <li>Los <b>errores</b> bloquean solo esa fuente; los <b>avisos</b>, como una nota de crédito descontada, no bloquean.</li>
      <li>Revisa el archivo con <b>Planilla BancoEstado</b> o <b>Texto .txt</b>. <b>Excel borrador</b> sirve para revisión o visto bueno y no registra nada.</li>
      <li><b>Generar nómina N° X y registrar</b> reserva el número correlativo, saca los documentos de pendientes y descarga el <b>.txt</b> y el <b>Excel BancoEstado</b>. Si otra persona movió alguno de esos documentos mientras revisabas, no se genera y te avisa.</li>
      <li>El archivo se llama <code>prefijo_FUENTE</code>, por ejemplo <code>20260926_PAGO_PROVEEDORES_SEP.txt</code>. La fuente se agrega sola.</li>
      <li>Si dos personas generan a la vez, cada una recibe un número distinto.</li>
    </ul>`
  },
  {
    id: "p4", titulo: "4. Bitácora de nóminas", html: `
    <ul>
      <li>Los <b>contadores</b> de arriba filtran la tabla: generadas sin cargar, esperando resultado, por registrar resultado y con rechazos por reintegrar.</li>
      <li>El <b>buscador</b> encuentra una factura por N° de documento, RUT, proveedor o DC, y muestra en qué nóminas estuvo.</li>
      <li>Toca una nómina para ver su detalle e historial. Tócala de nuevo, o pulsa <b>Cerrar</b>, para cerrarlo.</li>
      <li><b>Marcar como cargada:</b> indica la <b>fecha de carga</b>, la <b>fecha de pago</b> (se sugiere el día hábil siguiente), el N° de operación y una observación. Queda registrado quién la cargó.</li>
      <li><b>Resultado:</b> desde las 14:00 del día de pago, marca cada pago como <b>Pagado</b> o <b>Rechazado</b> con su motivo. <b>Marcar pendientes como pagados</b> aplica “Pagado” al resto de una vez.</li>
      <li><b>Volver a pendientes:</b> en un pago rechazado, devuelve sus documentos al paso 2 con la marca “Rechazado en nómina N° X”.</li>
      <li><b>Anular nómina:</b> solo si todavía no se cargó en el banco. Sus documentos vuelven a pendientes y la nómina queda cerrada.</li>
      <li><b>Deshacer carga:</b> vuelve a “generada” si ningún pago tiene resultado.</li>
      <li>Puedes descargar otra vez el .txt o el Excel de cualquier nómina, y exportar la bitácora a CSV.</li>
    </ul>`
  },
  {
    id: "p5", titulo: "Configuración", html: `
    <ul>
      <li><b>Prefijo del archivo:</b> <code>AAAAMMDD</code> se reemplaza por la fecha del día.</li>
      <li><b>Email por defecto:</b> se usa cuando el proveedor no tiene correo.</li>
      <li><b>Feriados:</b> el panel los salta al sugerir la fecha de pago y al calcular desde cuándo está el resultado del banco.</li>
      <li><b>Respaldo:</b> descarga todo el panel en un .json, que contiene datos bancarios. Los administradores pueden además importar un respaldo.</li>
      <li>Arriba a la derecha eliges el tema: claro, oscuro o igual al sistema.</li>
    </ul>`
  },
  {
    id: "faq", titulo: "Preguntas frecuentes", html: `
    <dl class="guia-faq">
      <dt>“El RUT no está en el maestro de proveedores”</dt><dd>Pulsa <b>Agregar</b> en esa fila del paso 2, o agrega el proveedor en el paso 1 con sus datos bancarios.</dd>
      <dt>“Este documento ya está en la nómina N° X”</dt><dd>Ese documento ya se envió al banco. Quítalo de pendientes o, si esa nómina no se cargó, anúlala.</dd>
      <dt>El total de un proveedor queda en cero o negativo</dt><dd>Hay una nota de crédito mayor que sus facturas. Revisa los documentos marcados de ese proveedor.</dd>
      <dt>No veo un cambio que hizo otra persona</dt><dd>Los cambios llegan solos en segundos. Si no aparecen, recarga la página.</dd>
      <dt>¿Quién puede entrar?</dt><dd>Solo los correos de la lista de acceso del equipo de Finanzas. Para sumar a alguien, pídeselo a un administrador.</dd>
    </dl>`
  },
];

export function init() {
  const dlg = $("guia");
  $("guiaIndice").innerHTML = SECCIONES.map(s => `<a href="#guia-${s.id}" data-sec="${s.id}">${s.titulo}</a>`).join("");
  $("guiaCuerpo").innerHTML = SECCIONES.map(s => `<section id="guia-${s.id}"><h3>${s.titulo}</h3>${s.html}</section>`).join("");
  $("guiaIndice").addEventListener("click", e => {
    const a = e.target.closest("a[data-sec]"); if (!a) return;
    e.preventDefault(); ir(a.dataset.sec);
  });
  $("btnGuia").onclick = () => {
    dlg.showModal();
    // Abre en el paso en que se está; el flujo general queda al principio.
    ir(["1", "2", "3", "4", "5"].includes(prefs.step) ? "p" + prefs.step : "flujo", false);
  };
  $("guiaCerrar").onclick = () => dlg.close();
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close() }); // clic fuera de la guía
}

function ir(id, suave = true) {
  const sec = $("guia-" + id); if (!sec) return;
  $("guiaCuerpo").scrollTo({ top: sec.offsetTop - $("guiaCuerpo").offsetTop, behavior: suave ? "smooth" : "auto" });
  $("guiaIndice").querySelectorAll("a").forEach(a => a.setAttribute("aria-current", String(a.dataset.sec === id)));
}

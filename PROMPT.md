# Prompt: Panel Impresora de Pago Proveedores BancoEstado en GitHub Pages + Firebase

Copia todo lo que está bajo la línea en Claude Code, abierto en la raíz del repositorio.

---

## Contexto

Soy Wilson Rojas, Encargado de Finanzas del Servicio Local de Educación Pública de Petorca. Tengo un panel que genera las nóminas de carga masiva de pago a proveedores para BancoEstado. Hoy es un solo archivo HTML que guarda todo en `localStorage` del navegador. Necesito llevarlo a este repositorio, publicarlo en **GitHub Pages** y que los datos queden en **Firebase (Firestore)**, compartidos por el equipo de Finanzas.

Uso el mismo proyecto Firebase para otras apps de GitHub Pages (Calendario de permisos, Monitoreo SEP, Situación de Déficit P02, Visor SAF/SPYCG). Esas apps ya tienen reglas de Firestore que **no se pueden tocar**.

El repositorio ya contiene:

- `referencia/panel_actual_claude.html`: el panel funcionando. Es la especificación viva: todo lo que hace debe seguir haciéndolo.
- `assets/plantilla_bancoestado.xlsx`: planilla oficial BancoEstado "Pago (DET-SUBDET) Versión 1.1" sin filas de datos, con logo, colores, comentarios y hojas de apoyo.
- `assets/plantilla_documentos.xlsx`: plantilla de documentos a pagar, con listas desplegables.
- `firestore/bloque_pago.rules`: bloque de reglas nuevo para este panel.

## Objetivo

1. Reestructurar el panel como sitio estático en módulos, sin build obligatorio, servido desde la rama `main` en GitHub Pages.
2. Reemplazar `localStorage` por Firestore con sincronización en tiempo real (`onSnapshot`) y autenticación Firebase.
3. Mantener exactamente el comportamiento, las validaciones y los formatos de salida del panel actual.

## Stack y restricciones

- HTML, CSS y JavaScript con módulos ES nativos. Sin frameworks ni paso de compilación.
- Firebase JS SDK modular v10 desde `https://www.gstatic.com/firebasejs/10.x/...`, con la versión fijada.
- SheetJS y JSZip con versión fijada. Pueden cargarse desde cdnjs o copiarse a `vendor/`.
- Autenticación: el **mismo proveedor que usan mis otras apps** en este proyecto Firebase (Google, con `signInWithPopup`). Pregúntame si no lo ves claro antes de asumir otro.
- La configuración web de Firebase (`firebaseConfig`) va en `js/firebase-config.js`. Es la misma de mis otras apps y te la pego yo; deja un marcador claro. Esa configuración es pública por diseño: la seguridad la dan las reglas.
- El repositorio probablemente será **público**. Nunca se suben datos reales: ni RUT de proveedores, ni cuentas, ni nóminas, ni planillas con datos. Agrega un `.gitignore` que excluya `*.txt` de nóminas, `datos/`, `respaldos/` y archivos `.xls` o `.xlsx` fuera de `assets/`.
- `localStorage` queda solo para preferencias de interfaz (pestaña activa, filtros), nunca para datos de negocio.
- Descargas con `Blob` y `URL.createObjectURL` (el panel actual usa una API propia de Claude, `window.claude.use('downloads')`, que aquí no existe).

## Estructura sugerida

```
index.html
css/panel.css
js/firebase-config.js      // firebaseConfig (marcador)
js/firebase.js             // init, auth, helpers de escritura firmada
js/catalogos.js            // bancos, formas de pago, sectores, tipos de documento
js/formato.js              // normalización, validación, build de nómina, TXT
js/excel.js                // Excel BancoEstado idéntico y plantilla de documentos
js/importar.js             // pegar desde Excel, importar xls/xlsx/csv, planilla banco
js/datos.js                // lectura/escritura Firestore y suscripciones
js/ui/*.js                 // pasos 1 a 4
assets/                    // plantillas xlsx
firestore/bloque_pago.rules
README.md
```

## Modelo de datos en Firestore

Todas las colecciones llevan prefijo `pago_`. Toda escritura incluye `updatedBy` (correo del usuario) y `updatedAt` (`serverTimestamp()`), porque las reglas lo exigen.

- `pago_config/general`: `fuentes` (lista, por defecto GENERAL, SEP, PIE, FAEP), `emailDefecto` (finanzas@sleppetorca.gob.cl), `feriados` (lista de fechas ISO), `prefijoArchivo`.
- `pago_config/contador`: `nextNum` (entero). Correlativo de nóminas.
- `pago_proveedores/{rut}`: id = RUT normalizado sin puntos ni guion (ej. `769915303`). Campos `rut, nombre, email, banco, forma, cuenta, sector, createdAt, createdBy`.
- `pago_documentos/{autoId}`: documentos pendientes. Campos `rut, fecha (DDMMAAAA), monto (entero), ndoc, tipo, fuente, sel (bool), dc (opcional, ej. "DC 54"), hist (opcional, texto de rechazo o anulación previa)`.
- `pago_nominas/{num}`: id = número correlativo como texto. Campos `num, fuente, archivo, estado ('generada' | 'cargada' | 'anulada'), creadaAt, creadaPor, fechaCarga (ISO), operacion, obs, total, lineas, pagos`.
  - `lineas`: lista de mapas `{tipo: 1|2, f: [..9 campos..]}`. Firestore no admite listas de listas, así que cada línea debe ser un mapa.
  - `pagos`: lista de mapas `{rut, nombre, banco, cuenta, monto, estado ('pendiente'|'pagado'|'rechazado'), motivo, reint (fecha ISO o ''), docs: [{docId, fecha, monto, ndoc, tipo, dc}]}`.
- `pago_historial/{autoId}`: solo se agrega. `accion, ref, detalle, antes, despues, autor, createdAt`.

Si una nómina pudiera acercarse a 1 MB, avísame; con cientos de documentos cabe de sobra.

## Operaciones que deben ser atómicas

- **Generar nómina**: en una sola `runTransaction` se lee `pago_config/contador`, se crea `pago_nominas/{nextNum}` con estado `generada`, se incrementa `nextNum` en 1, se borran los `pago_documentos` incluidos y se agrega una entrada en `pago_historial`. Antes de escribir, la transacción verifica que cada documento siga existiendo y siga marcado. Si otro usuario lo movió, se aborta con un mensaje claro. Si el contador no existe, se crea con `nextNum = 2` y la nómina queda con el número 1.
- **Anular nómina** (solo si está en `generada`): estado `anulada` y los documentos vuelven a `pago_documentos` con `hist = "Viene de la nómina N° X anulada"`. Todo en un solo batch.
- **Volver a pendientes un pago rechazado**: se marca `reint` en el pago y sus documentos vuelven a `pago_documentos` con `hist = "Rechazado en nómina N° X: motivo"`, en un solo batch.

## Historial obligatorio

Registrar en `pago_historial`: alta o edición de proveedor, **guardando antes y después cuando cambia el banco, la cuenta o la forma de pago** (es un control clave contra fraude); generación, carga, resultado por pago, anulación y reintegro de nóminas; borrado de documentos pendientes. En la bitácora de cada nómina, mostrar sus entradas de historial.

## Funcionalidad que se mantiene tal cual (ver `referencia/panel_actual_claude.html`)

Título: **Panel Impresora de Pago Proveedores BancoEstado**. Cuatro pasos:

1. **Proveedores**: formulario con validación, botón "Usar Cuenta RUT", carga masiva pegando desde Excel o importando xls/xlsx/csv (incluida una planilla de pago anterior del banco), búsqueda, exportar maestro a CSV.
2. **Documentos a pagar**: fuentes de financiamiento editables; pegar filas (5, 6, 11 o 12 columnas, o con encabezados); importar archivo; descargar la plantilla de documentos con la hoja `Fuentes` rellenada con las fuentes actuales; agregar un documento a mano; marcar o desmarcar para pagar; filtrar por fuente; mover a otra fuente; quitar. La fuente se deduce del nombre del archivo importado cuando corresponda. **Nuevo:** columna `DC` opcional (se importa desde la plantilla, se muestra en la tabla y viaja a la nómina y a la bitácora).
3. **Revisar y generar**: una nómina por fuente con solo los documentos marcados; tabla resumen por fuente con estado; errores que bloquean solo esa fuente; vista previa "Planilla BancoEstado" (logo, naranjos #FF6600 y #FF9900) y vista "Texto .txt"; "Excel borrador" sin registrar; "Generar nómina N° X y registrar", que crea la nómina y descarga el .txt.
4. **Bitácora de nóminas**: contadores (generadas sin cargar, esperando resultado, por registrar resultado, con rechazos por reintegrar); filtro por fuente; buscador por N° de documento, RUT, proveedor o **DC** que muestra el recorrido de cada documento; detalle con fecha de carga, N° de operación y observación; "Marcar como cargada"; resultado por pago (pendiente, pagado, rechazado con motivo); "Marcar pendientes como pagados"; "Volver a pendientes"; "Anular"; "Deshacer carga" si ningún pago tiene resultado; descargas .txt y Excel BancoEstado; exportar bitácora a CSV (una fila por documento, con DC).

El resultado del banco está disponible desde las **14:00 del día hábil siguiente** a la carga. Para calcularlo, salta sábados, domingos y las fechas de `pago_config/general.feriados`. Agrega en configuración una forma de editar los feriados.

## Formato del archivo para BancoEstado (crítico, no cambiar)

- Texto separado por tabulaciones, líneas terminadas en CRLF, incluida la última.
- Línea tipo 1 (pago al beneficiario), 9 campos: `1, RUT sin puntos ni guion con DV, razón social, email, código banco (3 dígitos), forma de pago (01 o 02), N° de cuenta, sector financiero (2 dígitos), monto total`.
- Línea tipo 2 (documento), 5 campos seguidos de 4 tabulaciones vacías: `2, fecha DDMMAAAA, monto, N° documento, tipo documento`.
- Se agrupan en un solo pago los documentos del mismo RUT, banco y cuenta dentro de una misma fuente (opción desactivable). Nunca se mezclan fuentes.
- Las notas de crédito (60 y 61) se restan del total y generan una advertencia.
- Todas las validaciones del panel actual se mantienen: DV del RUT (módulo 11); razón social en mayúsculas, sin tildes, sin ñ ni caracteres especiales, máximo 60, con advertencia si trae números; email de hasta 40 caracteres; banco y sector según catálogo; forma 02 solo con banco 012; cuenta solo con dígitos, letras convertidas en 0, máximo 17, y advertencia si parece un RUT completo; monto del documento de hasta 10 dígitos y total de hasta 13; N° de documento solo numérico; fechas DDMMAAAA o AAAAMMDD al leer, siempre DDMMAAAA al escribir; documento ya incluido en una nómina activa o pagada es error.
- Nombre del archivo: `{prefijo}_{FUENTE}.txt`, con prefijo por defecto `AAAAMMDD_PAGO_PROVEEDORES`.

## Excel BancoEstado idéntico

Tomar `assets/plantilla_bancoestado.xlsx` con `fetch`, abrirla con JSZip y escribir las filas en `xl/worksheets/sheet1.xml` desde la fila 5, como hace `bankWorkbook()` en la referencia. Usa los mismos índices de estilo: tipo 1 usa A=20, B=21, C=22, D=23, E y F=24, G=21, H=18, I=25; tipo 2 usa A, B, D y E=20, C=25 y H=18. Los textos van como `inlineStr` y los montos como número. No se modifica ninguna otra parte del archivo. Se descarga como `.xlsx`.

## Reglas de Firestore

El bloque está en `firestore/bloque_pago.rules`. Se pega **antes** del bloque final `match /{document=**} { allow read, write: if false; }` del archivo de reglas que ya existe en la consola de Firebase. No se modifica ninguna línea de los bloques existentes. Si en el código necesitas un campo que las reglas no permiten, dime qué cambio de regla propones en lugar de relajarlas por tu cuenta.

Lista de acceso: la función `pAllowed()` del bloque. Agrega en el README cómo sumar o quitar personas.

## Migración de los datos actuales

Mis datos actuales viven en el `localStorage` de claude.ai, que no es accesible desde GitHub Pages. Agrega en configuración un **"Importar respaldo JSON"** (solo para `pAdmin`) que acepte un objeto `{maestro, docs, nominas, config}` con la forma que usa la referencia (claves `bepago.maestro.v1`, `bepago.docs.v1`, `bepago.nominas.v1`, `bepago.config.v1`). Debe mostrar un resumen antes de escribir y hacerlo en batches, respetando las reglas. El maestro también puede cargarse con el CSV que exporta el paso 1.

## Entregables

1. Código completo en la estructura indicada, funcionando en GitHub Pages.
2. `README.md` con:
   - cómo pegar el bloque de reglas;
   - cómo agregar el dominio `<usuario>.github.io` en Firebase Authentication, en Dominios autorizados;
   - cómo activar GitHub Pages;
   - cómo gestionar la lista de acceso;
   - y cómo probar.
3. Prueba manual guiada (checklist en el README) que verifique:
   - que al importar una planilla de pago anterior del banco se reconstruyen los proveedores y documentos;
   - que el .txt generado es idéntico byte a byte al de la referencia para los mismos datos;
   - que dos usuarios generando a la vez no obtienen el mismo número de nómina;
   - que un usuario fuera de `pAllowed()` no puede leer nada;
   - y que una nómina anulada no se puede volver a editar.
4. Si puedes, pruebas de las reglas con el emulador de Firestore (`@firebase/rules-unit-testing`) en una carpeta `tests/` que no se publica.

## Forma de trabajo

- Antes de escribir código, muéstrame el plan y pregúntame lo que no esté claro (proveedor de autenticación y `firebaseConfig`, sobre todo).
- Trabaja en commits pequeños y descriptivos.
- Diseño: conserva la paleta y la tipografía del panel actual (IBM Plex Sans y Mono, tokens de color claro y oscuro) y que se vea bien en el móvil.
- Responde y comenta el código en español.

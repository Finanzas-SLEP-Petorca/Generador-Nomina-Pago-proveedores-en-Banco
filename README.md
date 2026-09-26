# Panel Impresora de Pago Proveedores BancoEstado

Panel del Servicio Local de Educación Pública de Petorca para armar las nóminas de carga masiva de pago a proveedores de BancoEstado. Genera archivos en formato DET-SUBDET de 9 columnas, con una nómina por fuente de financiamiento. Es un sitio estático publicado en GitHub Pages. Los datos se guardan en Firestore y los comparte el equipo de Finanzas.

> **Este repositorio es público. Nunca subas datos reales.** Eso incluye RUT de proveedores, cuentas, nóminas `.txt`, planillas con datos y respaldos `.json`. El `.gitignore` los excluye, pero revisa `git status` antes de cada commit.

## Estructura

```
index.html                  Panel (4 pasos + Configuración)
css/panel.css               Estilos (paleta y tipografía del panel original)
js/firebase-config.js       firebaseConfig  ← pegar aquí la configuración
js/firebase.js              Inicialización, Google con signInWithPopup, firma de escrituras
js/catalogos.js             Bancos, formas de pago, sectores y tipos de documento
js/formato.js               Normalización, validaciones, armado de la nómina y .txt
js/importar.js              Pegar desde Excel, importar xls/xlsx/csv/txt, planilla del banco
js/excel.js                 Excel BancoEstado idéntico y plantilla de documentos
js/datos.js                 Firestore: suscripciones, transacciones, historial, migración
js/ui/*.js                  Pasos 1 a 4 y Configuración
assets/                     Plantillas .xlsx vacías y logo
vendor/                     SheetJS 0.18.5 y JSZip 3.10.1 (versiones fijadas)
firestore/bloque_pago.rules Bloque de reglas del panel (con correos marcadores)
referencia/                 Panel anterior (especificación viva)
tests/                      Pruebas (no se publican)
.github/workflows/          Publicación en Pages y pruebas
```

Se usan módulos ES nativos. No hay framework ni paso de compilación.

## Puesta en marcha

### 1. Pegar la configuración de Firebase

1. En la consola de Firebase, abre *Configuración del proyecto → General → Tus apps*. Es el mismo proyecto de Calendario de permisos, Monitoreo SEP, Déficit P02 y Visor SAF/SPYCG.
2. Copia el objeto `firebaseConfig` de la app web que ya usan esas apps.
3. Pega cada valor en `js/firebase-config.js`, reemplazando los `"PEGAR_AQUI"`.

Esa configuración es pública por diseño: la seguridad la dan las reglas de Firestore. Mientras quede algún `PEGAR_AQUI`, el panel muestra el aviso "Falta la configuración de Firebase".

### 2. Pegar el bloque de reglas en Firestore

1. Abre `firestore/bloque_pago.rules`. Reemplaza los correos marcadores (`admin1@example.com`, `usuario1@example.com`, …) por los reales:
   - `pAdmin()`: administradores (tú);
   - `pAllowed()`: el resto del equipo con acceso.

   Guarda esa copia con los correos reales solo en tu computador, por ejemplo como `firestore/bloque_pago.local.rules` (el `.gitignore` la excluye).
2. En la consola de Firebase, abre *Firestore Database → Reglas*.
3. Pega el bloque completo **justo antes** del bloque final:
   ```
       // Todo lo no declarado queda denegado.
       match /{document=**} {
         allow read, write: if false;
       }
   ```
   No modifiques ninguna línea de los bloques existentes. Los nombres del bloque (`pEmail`, `pAdmin`, `pAllowed`, `pFirmado`, `pContadorPath`) no chocan con los de las otras apps.
4. Pulsa **Publicar**. Si la consola marca un error, no publiques y revisa las comas de las listas de correos.

Respecto del bloque original, se agregó una línea en `pago_nominas`: solo se puede anular una nómina que siga en estado `generada`. La interfaz ya lo exigía; ahora también lo exigen las reglas.

### 3. Autorizar el dominio de GitHub Pages en Firebase Authentication

`signInWithPopup` solo funciona desde dominios autorizados:

1. Abre *Authentication → Settings → Dominios autorizados → Agregar dominio*.
2. Agrega `finanzas-slep-petorca.github.io` (en general, `<usuario u organización>.github.io`, sin `https://` ni la ruta del repositorio).
3. Confirma que el proveedor **Google** esté habilitado en *Authentication → Método de acceso*. Las otras apps ya lo usan.

Si falta este paso, al entrar aparece "este dominio no está autorizado en Firebase Authentication".

### 4. Activar GitHub Pages

1. En GitHub, abre *Settings → Pages → Build and deployment → Source* y elige **GitHub Actions**.
2. Haz merge a `main`. El workflow `Publicar en GitHub Pages` corre la prueba de formato y publica solo `index.html`, `css/`, `js/`, `assets/` y `vendor/`.
3. El panel queda en `https://finanzas-slep-petorca.github.io/Generador-Nomina-Pago-proveedores-en-Banco/`.

Se publica con Actions y no "desde la rama" para que `tests/`, `referencia/` y `firestore/` no queden servidos como páginas.

### 5. Migrar los datos del panel anterior (una sola vez)

Los datos actuales viven en el `localStorage` de claude.ai, que no es accesible desde GitHub Pages.

1. En el panel anterior, paso 4, pulsa **Exportar respaldo (.json)**. Si la descarga no está disponible en esa vista, sirve también un objeto con las claves `bepago.maestro.v1`, `bepago.docs.v1`, `bepago.nominas.v1` y `bepago.config.v1` (sus valores pueden venir como texto JSON).
2. En el panel nuevo, entra como administrador y abre **Configuración → Importar respaldo JSON**.
3. Elige el archivo y revisa el resumen: proveedores nuevos o con cambios, documentos pendientes, nóminas y avisos. Recién entonces pulsa **Confirmar e importar**.

Qué hace la importación:

- Escribe en batches, cada escritura firmada y con historial.
- Recrea las nóminas en orden con su número, estado, pagos y resultados, porque las reglas solo dejan crear nóminas en estado `generada` y con el contador en `num + 1`. El contador queda en el número siguiente.
- Solo importa nóminas si la bitácora de Firestore está vacía.
- Deja fuera los documentos pendientes con monto inválido, porque Firestore exige un entero mayor que cero. El resumen los cuenta.

El maestro también se puede cargar solo, con el CSV que exporta el paso 1 (*Importar archivo* en el paso 1).

Guarda el respaldo fuera del repositorio: contiene datos bancarios.

## Lista de acceso: sumar o quitar personas

El acceso lo definen **solo** las reglas de Firestore. El panel no guarda una lista propia: detecta si eres administrador preguntándole a las reglas.

1. En *Firestore Database → Reglas*, busca `function pAllowed()` en el bloque del panel.
2. Para **sumar** a alguien, agrega su correo a la lista, entre comillas y separado por coma. Para **quitarlo**, borra su línea y revisa que no quede una coma sobrante antes del `]`.
3. Los administradores van en `pAdmin()`. Pueden eliminar proveedores, cambiar el RUT de un proveedor e importar respaldos.
4. Pulsa **Publicar**. Firebase aplica las reglas en un par de minutos; las sesiones que ya estaban abiertas pueden tardar hasta unos 10. A quien se quita le aparece "sin acceso" cuando Firestore le rechaza la siguiente lectura o al recargar.
5. Actualiza también tu copia local `firestore/bloque_pago.local.rules`.

Solo entran cuentas con correo verificado (`email_verified`), como las de Google. Esta lista es independiente de `isAllowed()` de las otras apps: estar en una no da acceso a la otra.

## Modelo de datos (Firestore)

| Colección | Contenido |
|---|---|
| `pago_config/general` | `fuentes`, `emailDefecto`, `feriados` (fechas ISO), `prefijoArchivo` (`AAAAMMDD` = fecha del día) |
| `pago_config/contador` | `nextNum`: correlativo de nóminas |
| `pago_proveedores/{rut}` | Maestro. Id = RUT sin puntos ni guion |
| `pago_documentos/{id}` | Documentos pendientes, con `dc` y `hist` opcionales. El id ordena por fecha de ingreso, así la nómina respeta el orden de carga |
| `pago_nominas/{num}` | Nóminas: `lineas` como mapas `{tipo, f}` y `pagos` con sus documentos |
| `pago_historial/{id}` | Bitácora de acciones; solo se agregan entradas |

Toda escritura lleva `updatedBy` (correo) y `updatedAt` (hora del servidor). El historial registra:

- altas y ediciones de proveedores, con antes y después completos cuando cambia banco, cuenta o forma de pago;
- generación, carga, resultados, reintegros y anulación de nóminas;
- borrado de documentos pendientes;
- importaciones.

Tamaño: una nómina ocupa cerca de 300 bytes por documento. Con 500 documentos pesa unos 150 KB; el límite de 1 MB de Firestore recién se acercaría con unos 3.000 documentos en una sola nómina.

Las preferencias de interfaz quedan en `localStorage`: último paso abierto, filtros, fuente por defecto al pegar y "agrupar". Los datos no se guardan en el navegador: Firestore usa caché en memoria.

## Diferencias con el panel anterior

El formato del archivo, las validaciones y los cálculos son los mismos; `tests/formato.test.mjs` lo verifica ejecutando el código de la referencia. Cambia lo siguiente:

- **Datos compartidos y en tiempo real.** Lo que hace una persona lo ven las demás al instante.
- **Generar nómina es una transacción.** Reserva el número, verifica que cada documento siga pendiente y marcado y que los datos bancarios del proveedor no hayan cambiado mientras se revisaba. Si otro usuario movió algo, se aborta con un mensaje.

  Si dos personas generan a la vez, cada una recibe un número distinto. Con el emulador se comprobó que, en ese choque, Firestore responde "permiso denegado" en vez de reintentar, porque la regla del contador se evalúa con el número ya tomado. Por eso el panel reintenta hasta 5 veces con espera creciente.
- **Anular, reintegrar, cargar y registrar resultados** también son atómicos. Una nómina anulada queda cerrada.
- **Columna DC** opcional:
  - se importa desde la plantilla (columna G), como 7.ª columna al pegar documentos, como 13.ª en el formato completo o por encabezado "DC";
  - se muestra en la tabla, viaja a la nómina y a la bitácora, y se puede buscar;
  - la exportación CSV de la bitácora la incluye.
- **Feriados:** el resultado del banco (14:00 del día hábil siguiente) salta también las fechas de Configuración.
- **Monto inválido:** los documentos sin monto válido no se guardan. Se informan al importar.
- **CSV y .txt se leen como texto.** Así no se pierden ceros a la izquierda ni dígitos de cuentas largas.
- **Solo administradores** pueden cambiar el RUT o eliminar un proveedor.
- **Descargas directas** del navegador (Blob). "Copiar texto" sigue disponible.

## Cómo probar

### Pruebas automáticas (carpeta `tests/`, no se publica)

Requieren Node 20 o superior; las de reglas, también Java 11 o superior.

```
cd tests
npm install
npm run formato   # .txt byte a byte y validaciones contra el código de la referencia
npm run reglas    # bloque de reglas en el emulador de Firestore
npm run e2e       # Chromium contra los emuladores de Auth y Firestore (primera vez: npx playwright install chromium)
```

El workflow **Pruebas** corre `formato` y `reglas` en cada push y pull request. Las pruebas usan los correos marcadores del bloque (`admin1@example.com`, `usuario1@example.com`) y solo datos ficticios.

### Probar el panel con emuladores, sin tocar el proyecto real

```
cd tests && npm run emuladores                   # Auth 9099 y Firestore 8080
python3 -m http.server 5000 --bind 127.0.0.1     # desde la raíz del repositorio, en otra terminal
```

Abre `http://localhost:5000/?emulador`. El título muestra "EMULADOR". *Entrar con Google* abre la ventana de cuentas de prueba del emulador: agrega una cuenta con un correo de la lista, por ejemplo `admin1@example.com`. Si la ventana no abre (necesita cargar un script de Google), entra desde la consola del navegador con `__entrarEmulador("admin1@example.com")`. Ese atajo solo existe en modo emulador, en `localhost`; es el que usa `npm run e2e`.

### Prueba manual guiada (checklist)

Hazla con **datos ficticios**, en el emulador o en el proyecto real antes de migrar. Si la haces en el real, borra después lo creado desde la consola de Firebase.

- [ ] **Acceso denegado.** Entra con una cuenta que no esté en `pAllowed()`. Debe aparecer "no tiene acceso a este panel" y ningún dato. En la consola del navegador, `getDoc` sobre cualquier colección `pago_` responde `permission-denied`.
- [ ] **Planilla de pago anterior del banco.** En el paso 1, *Importar archivo* con una planilla BancoEstado (.xlsx o .txt de una nómina anterior), o pega sus filas. Deben aparecer los proveedores en el maestro y sus documentos en el paso 2, con la fuente deducida del nombre del archivo (por ejemplo `…_SEP.xlsx` → SEP).
- [ ] **.txt idéntico byte a byte.** Carga los mismos datos ficticios en el panel anterior y en el nuevo. Genera la nómina en el nuevo y compara:
  - `fc /b anterior.txt nuevo.txt` en Windows, o `cmp` en Mac o Linux;
  - la nueva debe tener tabulaciones y CRLF, también al final.

  `npm run formato` y `npm run e2e` hacen esta comparación automáticamente.
- [ ] **Dos usuarios a la vez.** Con dos personas (o dos navegadores con cuentas distintas) y documentos marcados en fuentes distintas, pulsen *Generar nómina* al mismo tiempo. Deben quedar dos nóminas con números distintos y correlativos, y ningún documento en ambas.
- [ ] **Documento movido por otro.** Una persona revisa el paso 3 y otra desmarca uno de esos documentos. Al generar, la primera recibe el aviso de que un documento ya no está marcado y no se crea la nómina.
- [ ] **Nómina anulada cerrada.** Anula una nómina generada. Sus documentos vuelven a pendientes con "Viene de la nómina N° X anulada". El detalle queda sin botones de acción y con los campos deshabilitados. Un intento directo de escribirla (consola del navegador) responde `permission-denied`.
- [ ] **Rechazo y reintegro.** Marca una nómina como cargada y un pago como *Rechazado* con motivo. Luego *Volver a pendientes*: sus documentos vuelven con "Rechazado en nómina N° X: motivo" y el historial de la nómina lo registra.
- [ ] **Control de datos bancarios.** Cambia la cuenta de un proveedor. En su ficha, *Historial del proveedor* muestra el antes y el después.
- [ ] **DC.** Descarga la plantilla de documentos, llena la columna G e impórtala. El DC aparece en la tabla, en el detalle de la nómina, en el buscador de la bitácora y en el CSV.
- [ ] **Feriados.** Agrega un feriado el día hábil siguiente a una carga. "Resultado desde" debe saltarlo.
- [ ] **Móvil.** Abre el panel en el teléfono: los pasos se ven en dos columnas y las tablas se desplazan de lado.

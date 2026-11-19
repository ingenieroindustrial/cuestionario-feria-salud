# Cuestionario Feria de la Salud

App web para aplicar un cuestionario de 30 preguntas (10 temas × 3 preguntas) a los colaboradores.
Cada respuesta se guarda en el momento en que se marca, así cada persona puede responder por partes
durante el plazo (por defecto 3 días) desde cualquier dispositivo.

Todo corre en Cloudflare:

- **Worker** `cuestionario-feria-salud`: sirve las páginas y la API (`src/index.js`).
- **Base de datos D1** `cuestionario-feria-salud-db`: colaboradores, preguntas, respuestas y avance.

## Páginas

| Ruta | Para quién |
|---|---|
| `/` | Colaboradores: ingresan con su número de documento. |
| `/admin.html` | Administrador: avance, Excel, carga de colaboradores y preguntas, plazo. |

## Publicar (una sola vez)

1. En el panel de Cloudflare entra a **Workers & Pages → Create → Import a repository**.
2. Conecta GitHub y elige el repositorio `cuestionario-feria-salud`.
3. Deja el nombre `cuestionario-feria-salud`, el **Build command** vacío y el **Deploy command** en `npx wrangler deploy`.
4. Pulsa **Deploy**. La app queda en `https://cuestionario-feria-salud.<tu-subdominio>.workers.dev`.

Después de esto, cada cambio que se suba a la rama `main` se publica solo.

## Uso del panel de administrador

1. **Colaboradores**: agrega, edita o elimina personas una por una, o carga la lista completa desde Excel (columnas `documento`, `nombre`, `area`). Cada persona entra solo con su número de documento.
2. **Preguntas**: descarga las actuales, edítalas en Excel (`tema`, `pregunta`, `opcion_a`…`opcion_d`, `correcta` = letra) y súbelas.
3. **Configuración**: fecha y hora de apertura y cierre, título y clave de administrador.
4. **Avance**: indicadores, cobertura por tema, tabla por colaborador y botón **Descargar Excel**
   (hojas: por colaborador, detalle por tema, cobertura por tema).

## Datos en D1

Además de las tablas, hay dos vistas para consultar desde la consola de D1:

- `avance_por_tema`: una fila por colaborador y tema, con estado *Sin responder / Incompleto / Completo - con errores / Completo - todo correcto*.
- `resumen_colaborador`: una fila por colaborador con temas completos, temas que le faltan y temas con errores.

El esquema está en `sql/01_esquema.sql` y las preguntas de ejemplo en `sql/02_preguntas_ejemplo.sql`.

## Seguridad

- La clave de administrador se guarda cifrada (hash con sal), nunca en texto plano.
- Las respuestas correctas nunca se envían al navegador del colaborador.

## Desarrollo local

```bash
npm install
npx wrangler d1 execute DB --local --file=sql/01_esquema.sql
npx wrangler d1 execute DB --local --file=sql/02_preguntas_ejemplo.sql
# crear la fila de config con una clave de prueba (ver sql/01_esquema.sql)
npx wrangler dev
```

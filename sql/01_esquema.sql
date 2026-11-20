-- Cuestionario Feria de la Salud: esquema D1 (SQLite)

CREATE TABLE IF NOT EXISTS config (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  titulo        TEXT NOT NULL DEFAULT 'Cuestionario Feria de la Salud',
  inicio        TEXT NOT NULL,              -- ISO 8601 UTC
  cierre        TEXT NOT NULL,              -- ISO 8601 UTC
  admin_salt    TEXT NOT NULL,
  admin_hash    TEXT NOT NULL,
  bi_salt       TEXT,                       -- clave de solo lectura para Power BI (hash)
  bi_hash       TEXT,
  bi_creada     TEXT
);

CREATE TABLE IF NOT EXISTS temas (
  id      INTEGER PRIMARY KEY,
  orden   INTEGER NOT NULL,
  nombre  TEXT NOT NULL UNIQUE,
  ciudad  TEXT                    -- ciudad de Colombia a la que el tema rinde homenaje
);

CREATE TABLE IF NOT EXISTS preguntas (
  id         INTEGER PRIMARY KEY,
  tema_id    INTEGER NOT NULL REFERENCES temas(id) ON DELETE CASCADE,
  orden      INTEGER NOT NULL,
  enunciado  TEXT NOT NULL,
  opciones   TEXT NOT NULL,                 -- JSON: ["A","B","C","D"]
  correcta   INTEGER NOT NULL,              -- índice de la opción correcta (0 = primera)
  UNIQUE (tema_id, orden)
);

CREATE TABLE IF NOT EXISTS colaboradores (
  id                INTEGER PRIMARY KEY,
  documento         TEXT NOT NULL UNIQUE,   -- cédula o código de empleado
  nombre            TEXT NOT NULL,
  area              TEXT,
  pin_salt          TEXT NOT NULL,
  pin_hash          TEXT NOT NULL,
  intentos_fallidos INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta   TEXT,
  ultimo_ingreso    TEXT,
  enviado_en        TEXT,                   -- cuándo envió el cuestionario (ya no puede cambiar respuestas)
  nombres           TEXT,
  apellidos         TEXT,
  celular           TEXT,
  cargo             TEXT,
  servicio          TEXT,
  sede              TEXT,
  cumple_mes        INTEGER,                -- solo día y mes del cumpleaños (minimización de datos)
  cumple_dia        INTEGER,
  datos_actualizados TEXT,
  autorizacion_version TEXT,                -- versión del aviso de privacidad aceptado
  autorizacion_fecha   TEXT,
  creado            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Prueba de cada autorización de tratamiento de datos (Ley 1581 de 2012, Decreto 1377 de 2013)
CREATE TABLE IF NOT EXISTS autorizaciones (
  id             INTEGER PRIMARY KEY,
  colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  version        TEXT NOT NULL,
  aceptada_en    TEXT NOT NULL,
  ip             TEXT,
  user_agent     TEXT
);
CREATE INDEX IF NOT EXISTS autorizaciones_colab_idx ON autorizaciones(colaborador_id);

CREATE TABLE IF NOT EXISTS sesiones (
  token          TEXT PRIMARY KEY,
  colaborador_id INTEGER REFERENCES colaboradores(id) ON DELETE CASCADE,
  es_admin       INTEGER NOT NULL DEFAULT 0,
  expira         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sesiones_colab_idx ON sesiones(colaborador_id);

-- Cada respuesta se guarda en el momento en que el colaborador la marca
CREATE TABLE IF NOT EXISTS respuestas (
  colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  pregunta_id    INTEGER NOT NULL REFERENCES preguntas(id) ON DELETE CASCADE,
  opcion         INTEGER NOT NULL,
  es_correcta    INTEGER NOT NULL,
  respondida     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (colaborador_id, pregunta_id)
);
CREATE INDEX IF NOT EXISTS respuestas_pregunta_idx ON respuestas(pregunta_id);

-- Temas que el colaborador ya envió (quedan bloqueados y puede ver su resultado)
CREATE TABLE IF NOT EXISTS envios_tema (
  colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  tema_id        INTEGER NOT NULL REFERENCES temas(id) ON DELETE CASCADE,
  enviado_en     TEXT NOT NULL,
  PRIMARY KEY (colaborador_id, tema_id)
);

-- ===== Vistas de reporte (consultables desde el panel de D1 en Cloudflare) =====

-- Una fila por colaborador y tema
DROP VIEW IF EXISTS avance_por_tema;
CREATE VIEW avance_por_tema AS
SELECT c.id AS colaborador_id, c.documento, c.nombre, c.area,
       t.orden AS tema_orden, t.nombre AS tema,
       COUNT(p.id) AS preguntas_tema,
       COUNT(r.pregunta_id) AS respondidas,
       COALESCE(SUM(r.es_correcta), 0) AS correctas,
       CASE
         WHEN COUNT(r.pregunta_id) = 0 THEN 'Sin responder'
         WHEN COUNT(r.pregunta_id) < COUNT(p.id) THEN 'Incompleto'
         WHEN COALESCE(SUM(r.es_correcta), 0) = COUNT(p.id) THEN 'Completo - todo correcto'
         ELSE 'Completo - con errores'
       END AS estado
FROM colaboradores c
CROSS JOIN temas t
JOIN preguntas p ON p.tema_id = t.id
LEFT JOIN respuestas r ON r.pregunta_id = p.id AND r.colaborador_id = c.id
GROUP BY c.id, t.id;

-- Una fila por colaborador
DROP VIEW IF EXISTS resumen_colaborador;
CREATE VIEW resumen_colaborador AS
SELECT colaborador_id, documento, nombre, area,
       SUM(respondidas) AS preguntas_respondidas,
       SUM(preguntas_tema) AS preguntas_total,
       SUM(correctas) AS correctas,
       SUM(respondidas = preguntas_tema) AS temas_completos,
       COUNT(*) AS temas_total,
       COALESCE(GROUP_CONCAT(CASE WHEN respondidas < preguntas_tema THEN tema END, ', '), '') AS temas_faltantes,
       COALESCE(GROUP_CONCAT(CASE WHEN respondidas = preguntas_tema AND correctas < preguntas_tema THEN tema END, ', '), '') AS temas_con_errores,
       CASE
         WHEN SUM(respondidas) = 0 THEN 'No ha iniciado'
         WHEN SUM(respondidas) < SUM(preguntas_tema) THEN 'En progreso'
         ELSE 'Terminó'
       END AS estado
FROM (SELECT * FROM avance_por_tema ORDER BY colaborador_id, tema_orden)
GROUP BY colaborador_id;

-- Actualización de datos de colaboradores + autorización de tratamiento de datos (Ley 1581 de 2012)
ALTER TABLE colaboradores ADD COLUMN nombres TEXT;
ALTER TABLE colaboradores ADD COLUMN apellidos TEXT;
ALTER TABLE colaboradores ADD COLUMN celular TEXT;
ALTER TABLE colaboradores ADD COLUMN cargo TEXT;
ALTER TABLE colaboradores ADD COLUMN servicio TEXT;
ALTER TABLE colaboradores ADD COLUMN sede TEXT;
ALTER TABLE colaboradores ADD COLUMN cumple_mes INTEGER;         -- solo día y mes: no se pide el año (minimización)
ALTER TABLE colaboradores ADD COLUMN cumple_dia INTEGER;
ALTER TABLE colaboradores ADD COLUMN datos_actualizados TEXT;
ALTER TABLE colaboradores ADD COLUMN autorizacion_version TEXT;  -- versión del aviso que aceptó por última vez
ALTER TABLE colaboradores ADD COLUMN autorizacion_fecha TEXT;

-- Prueba de cada autorización otorgada (art. 8 lit. b y art. 9 Ley 1581; art. 7 Decreto 1377 de 2013)
CREATE TABLE IF NOT EXISTS autorizaciones (
  id             INTEGER PRIMARY KEY,
  colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  version        TEXT NOT NULL,
  aceptada_en    TEXT NOT NULL,
  ip             TEXT,
  user_agent     TEXT
);
CREATE INDEX IF NOT EXISTS autorizaciones_colab_idx ON autorizaciones(colaborador_id);

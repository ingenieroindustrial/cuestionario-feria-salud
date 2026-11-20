-- Envío del cuestionario por tema
CREATE TABLE IF NOT EXISTS envios_tema (
  colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  tema_id        INTEGER NOT NULL REFERENCES temas(id) ON DELETE CASCADE,
  enviado_en     TEXT NOT NULL,
  PRIMARY KEY (colaborador_id, tema_id)
);
-- Quien ya había enviado todo el cuestionario queda con todos sus temas enviados
INSERT OR IGNORE INTO envios_tema (colaborador_id, tema_id, enviado_en)
SELECT c.id, t.id, c.enviado_en FROM colaboradores c CROSS JOIN temas t WHERE c.enviado_en IS NOT NULL;

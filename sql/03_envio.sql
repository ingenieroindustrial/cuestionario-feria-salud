-- Migración aplicada el 2026-11-20: fecha de envío del cuestionario
ALTER TABLE colaboradores ADD COLUMN enviado_en TEXT;

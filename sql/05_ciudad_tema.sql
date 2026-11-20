-- Migración aplicada el 2026-11-20: ciudad homenajeada por tema
ALTER TABLE temas ADD COLUMN ciudad TEXT;

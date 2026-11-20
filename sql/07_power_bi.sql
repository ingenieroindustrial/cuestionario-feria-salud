-- Clave de solo lectura para Power BI
ALTER TABLE config ADD COLUMN bi_salt TEXT;
ALTER TABLE config ADD COLUMN bi_hash TEXT;
ALTER TABLE config ADD COLUMN bi_creada TEXT;

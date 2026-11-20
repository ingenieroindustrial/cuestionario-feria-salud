-- Tabla (vista) con los datos actualizados de cada colaborador, lista para consultar en la consola de D1:
--   SELECT * FROM datos_colaboradores;
-- Horas en hora de Colombia (UTC-5).
DROP VIEW IF EXISTS datos_colaboradores;
CREATE VIEW datos_colaboradores AS
SELECT
  c.documento AS identificacion,
  c.nombres,
  c.apellidos,
  c.celular,
  CASE WHEN c.cumple_mes IS NULL THEN NULL ELSE c.cumple_dia || ' de ' || CASE c.cumple_mes
    WHEN 1 THEN 'enero' WHEN 2 THEN 'febrero' WHEN 3 THEN 'marzo' WHEN 4 THEN 'abril' WHEN 5 THEN 'mayo' WHEN 6 THEN 'junio'
    WHEN 7 THEN 'julio' WHEN 8 THEN 'agosto' WHEN 9 THEN 'septiembre' WHEN 10 THEN 'octubre' WHEN 11 THEN 'noviembre' ELSE 'diciembre' END END AS cumpleanos,
  c.cumple_mes,
  c.cumple_dia,
  c.cargo,
  c.servicio,
  c.sede,
  CASE WHEN c.autorizacion_fecha IS NOT NULL THEN 'Sí' ELSE 'No' END AS autorizo_tratamiento,
  c.autorizacion_version AS version_aviso,
  strftime('%Y-%m-%d %H:%M', c.autorizacion_fecha, '-5 hours') AS fecha_autorizacion,
  strftime('%Y-%m-%d %H:%M', c.datos_actualizados, '-5 hours') AS datos_actualizados
FROM colaboradores c;

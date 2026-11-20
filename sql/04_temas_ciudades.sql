-- Temas reales de la feria (cada uno honra una ciudad) con preguntas BORRADOR para validar.
-- correcta = posición de la opción correcta, empezando en 0.
DELETE FROM respuestas;
UPDATE colaboradores SET enviado_en = NULL;
DELETE FROM preguntas;
DELETE FROM temas;
INSERT INTO temas (id, orden, nombre, ciudad) VALUES
 (1, 1, 'Seguridad del paciente', 'Bogotá'),
 (2, 2, 'Epidemiología', 'Armenia'),
 (3, 3, 'Gestión ambiental', 'Leticia'),
 (4, 4, 'Mantenimiento', 'Cali'),
 (5, 5, 'Humanización', 'Bucaramanga'),
 (6, 6, 'Talento humano', 'Cartagena'),
 (7, 7, 'Laboratorio', 'Ipiales'),
 (8, 8, 'Farmacia', 'Barranquilla'),
 (9, 9, 'Planeación', 'Medellín'),
 (10, 10, 'Biomédica', 'Villavicencio');
INSERT INTO preguntas (tema_id, orden, enunciado, opciones, correcta) VALUES
 (1, 1, '¿Cuántos datos mínimos se deben verificar para identificar a un paciente antes de un procedimiento o un medicamento?', '["Dos: nombre completo y número de documento", "Uno: el número de la cama", "Solo el nombre", "Ninguno si el paciente está consciente"]', 0),
 (1, 2, '¿Qué es un evento adverso?', '["Una queja del paciente", "Un daño al paciente causado por la atención en salud y no por su enfermedad", "Un retraso en la asignación de citas", "Una complicación propia de la enfermedad"]', 1),
 (1, 3, 'Si ocurre un incidente o un evento adverso, lo correcto es:', '["Contarlo solo a los compañeros de turno", "Reportarlo por el canal institucional para aprender y prevenir que se repita", "Esperar a que el paciente se queje", "Ocultarlo para evitar sanciones"]', 1),
 (2, 1, '¿Cuántos momentos para la higiene de manos propone la OMS?', '["3", "7", "5", "10"]', 2),
 (2, 2, 'En Colombia, los eventos de interés en salud pública se notifican al:', '["PILA", "RIPS", "SIVIGILA", "RUAF"]', 2),
 (2, 3, 'Una infección asociada a la atención en salud (IAAS) es:', '["Una vacuna aplicada en la institución", "Una infección que el paciente adquiere durante la atención y que no tenía al ingresar", "Una infección que el paciente trae desde su casa", "Una reacción alérgica a un medicamento"]', 1),
 (3, 1, 'Según el código de colores vigente en Colombia, los residuos aprovechables limpios (papel, cartón, plástico, vidrio) van en la bolsa:', '["Roja", "Negra", "Blanca", "Verde"]', 2),
 (3, 2, 'Las gasas o elementos con sangre o fluidos corporales se desechan en la bolsa:', '["Verde", "Blanca", "Negra", "Roja"]', 3),
 (3, 3, 'Las agujas y demás elementos cortopunzantes se desechan en:', '["El guardián (recipiente rígido de seguridad)", "La caneca de reciclaje", "La bolsa negra", "Cualquier caneca con tapa"]', 0),
 (4, 1, 'El mantenimiento preventivo es el que:', '["Se programa para evitar que los equipos e instalaciones fallen", "Se hace solo cuando el equipo ya se dañó", "Hace cada usuario por su cuenta", "No es necesario si el equipo es nuevo"]', 0),
 (4, 2, 'Si encuentras una falla en un equipo o en las instalaciones, debes:', '["Repararla tú mismo", "Desconectar el equipo y no decir nada", "Reportarla al área de mantenimiento por el canal establecido", "Ignorarla si todavía funciona"]', 2),
 (4, 3, '¿Por qué no se deben sobrecargar los tomacorrientes con multitomas?', '["No hay ningún problema en hacerlo", "Porque se ven desordenados", "Por el riesgo de cortocircuito e incendio", "Porque gastan menos energía"]', 2),
 (5, 1, 'Humanizar la atención en salud significa:', '["Dar prioridad a los trámites sobre las personas", "Atender lo más rápido posible sin hablar con el paciente", "Tratar a cada paciente con respeto, empatía y dignidad, como persona y no como un caso", "Que solo el médico se encargue del trato al paciente"]', 2),
 (5, 2, 'Al iniciar la atención de un paciente, lo recomendado es:', '["Hablar solo con el acompañante", "Llamarlo por el número de la cama", "Saludarlo, presentarse y llamarlo por su nombre", "Empezar el procedimiento sin explicarle nada"]', 2),
 (5, 3, 'Si un paciente o familiar está molesto, lo mejor es:', '["Escucharlo con calma, mostrar empatía y orientarlo para resolver su inquietud", "Ignorarlo hasta que se calme", "Responderle en el mismo tono", "Pedirle que se retire de la institución"]', 0),
 (6, 1, 'La inducción a un colaborador nuevo sirve para:', '["Que conozca la institución, sus normas y las funciones de su cargo", "Reemplazar la capacitación de su jefe", "Evaluar si merece un aumento", "Cumplir un trámite sin importancia"]', 0),
 (6, 2, 'Si sufres un accidente de trabajo, debes:', '["No reportarlo si la lesión es leve", "Esperar al final del turno para ver si mejora", "Informarlo de inmediato a tu jefe y al área de Seguridad y Salud en el Trabajo", "Contarlo solo a un compañero"]', 2),
 (6, 3, 'El código de ética de la institución sirve para:', '["Reemplazar el reglamento de trabajo", "Aplicarse solo a los directivos", "Sancionar únicamente a los pacientes", "Orientar el comportamiento de todos los colaboradores"]', 3),
 (7, 1, 'Antes de tomar una muestra, lo primero es:', '["Rotular los tubos al final del turno", "Preguntar solo el número de la cama", "Tomar la muestra y luego confirmar quién es", "Identificar correctamente al paciente y rotular la muestra frente a él"]', 3),
 (7, 2, 'Una muestra que llega al laboratorio sin rótulo debe:', '["Rotularse en el laboratorio por suposición", "Procesarse si se sabe de qué servicio viene", "Guardarse hasta que alguien la reclame", "Rechazarse y solicitar una nueva muestra"]', 3),
 (7, 3, 'Al manipular muestras biológicas es indispensable usar:', '["Guantes y los demás elementos de protección indicados", "Solo tapabocas", "Guantes solo si la muestra tiene sangre visible", "Ningún elemento si es una muestra pequeña"]', 0),
 (8, 1, 'Los correctos de la administración de medicamentos incluyen:', '["Solo el medicamento y la dosis", "El color y la marca del medicamento", "Paciente, medicamento, dosis, vía y hora correctos", "La cama, el servicio y el turno"]', 2),
 (8, 2, 'Los medicamentos de alto riesgo son los que:', '["Se toman por vía oral", "Vienen importados", "Son más costosos", "Si se usan mal pueden causar un daño grave al paciente"]', 3),
 (8, 3, 'Si encuentras un medicamento vencido, debes:', '["Botarlo a la basura común", "Devolverlo al estante sin decir nada", "Usarlo si vence este mes", "No usarlo, separarlo y reportarlo a farmacia"]', 3),
 (9, 1, 'La plataforma estratégica de una institución incluye:', '["La lista de proveedores", "Misión, visión, valores y objetivos", "El inventario de equipos", "El horario de los turnos"]', 1),
 (9, 2, 'Un indicador sirve para:', '["Reemplazar los planes de trabajo", "Decorar los informes", "Calificar a los pacientes", "Medir el cumplimiento de una meta o el desempeño de un proceso"]', 3),
 (9, 3, 'El ciclo PHVA significa:', '["Prevenir, Hacer, Validar y Archivar", "Preparar, Hablar, Vender y Ahorrar", "Planear, Hacer, Verificar y Actuar", "Pensar, Hacer, Volver y Analizar"]', 2),
 (10, 1, 'Antes de usar un equipo biomédico se debe:', '["Ajustar sus parámetros sin capacitación", "Desconectar los equipos cercanos", "Usarlo de inmediato si está encendido", "Verificar que funcione bien y que su mantenimiento esté vigente"]', 3),
 (10, 2, 'La tecnovigilancia se encarga de:', '["Controlar el inventario de papelería", "Revisar el internet de la institución", "Vigilar y reportar incidentes y eventos adversos relacionados con dispositivos médicos", "Vigilar las cámaras de seguridad"]', 2),
 (10, 3, 'Si un equipo biomédico falla mientras lo usas, debes:', '["Seguir usándolo con cuidado", "Guardarlo sin avisar", "Retirarlo de servicio, rotularlo como fuera de servicio y reportarlo", "Repararlo tú mismo"]', 2);

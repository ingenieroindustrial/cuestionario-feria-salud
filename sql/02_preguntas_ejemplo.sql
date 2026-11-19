-- Preguntas DE EJEMPLO. Reemplazar por las definitivas antes de la feria.
-- correcta = posición de la opción correcta, empezando en 0.

DELETE FROM preguntas;
DELETE FROM temas;

INSERT INTO temas (id, orden, nombre) VALUES
 (1, 1, 'Alimentación saludable'),
 (2, 2, 'Actividad física'),
 (3, 3, 'Salud mental'),
 (4, 4, 'Sueño y descanso'),
 (5, 5, 'Ergonomía y pausas activas'),
 (6, 6, 'Hidratación'),
 (7, 7, 'Salud cardiovascular'),
 (8, 8, 'Salud visual'),
 (9, 9, 'Alcohol y tabaco'),
 (10, 10, 'Primeros auxilios');

INSERT INTO preguntas (tema_id, orden, enunciado, opciones, correcta) VALUES
 (1, 1, '¿Cuántas porciones de frutas y verduras se recomienda consumir al día?', '["1 porción","2 porciones","Al menos 5 porciones","Solo en el almuerzo"]', 2),
 (1, 2, '¿Cuál de estos alimentos aporta más fibra?', '["Pan blanco","Avena en hojuelas","Gaseosa","Queso"]', 1),
 (1, 3, '¿Qué es mejor para reducir el consumo de sal?', '["Usar más salsas de paquete","Cocinar con hierbas y especias naturales","Comer más embutidos","Agregar sal antes de probar la comida"]', 1),

 (2, 1, '¿Cuántos minutos de actividad física moderada a la semana recomienda la OMS para adultos?', '["30 minutos","60 minutos","Entre 150 y 300 minutos","Solo los fines de semana"]', 2),
 (2, 2, '¿Cuál de estas es una actividad física moderada?', '["Ver televisión","Caminar a paso rápido","Dormir la siesta","Trabajar sentado"]', 1),
 (2, 3, '¿Qué se recomienda hacer antes de empezar a hacer ejercicio?', '["Comer abundante","Calentar y estirar","Tomar bebidas energizantes","Nada, se empieza de una vez"]', 1),

 (3, 1, '¿Cuál de estas es una señal de estrés que conviene atender?', '["Dormir bien","Irritabilidad y cansancio constante","Tener buen apetito","Disfrutar del tiempo libre"]', 1),
 (3, 2, '¿Qué ayuda a manejar el estrés en el trabajo?', '["Saltarse las pausas","Organizar prioridades y hacer pausas","Trabajar sin descanso","Aislarse de los compañeros"]', 1),
 (3, 3, 'Si un compañero se ve muy afectado emocionalmente, lo mejor es:', '["Ignorarlo","Escucharlo y orientarlo a buscar ayuda profesional","Burlarse para que se anime","Contárselo a todos"]', 1),

 (4, 1, '¿Cuántas horas de sueño se recomiendan para un adulto?', '["4 a 5 horas","7 a 9 horas","10 a 12 horas","No importa"]', 1),
 (4, 2, '¿Qué hábito ayuda a dormir mejor?', '["Usar el celular en la cama","Tomar café en la noche","Mantener horarios regulares para acostarse","Cenar muy pesado"]', 2),
 (4, 3, 'Dormir poco de forma habitual aumenta el riesgo de:', '["Accidentes laborales","Mejor concentración","Más energía","Ninguno"]', 0),

 (5, 1, '¿Cada cuánto se recomienda hacer una pausa activa en trabajo de oficina?', '["Cada 4 horas","Cada 1 a 2 horas","Una vez al día","Solo al final del turno"]', 1),
 (5, 2, '¿A qué altura debe quedar la parte superior de la pantalla del computador?', '["Muy por encima de los ojos","A la altura de los ojos o un poco abajo","A la altura del pecho","No importa"]', 1),
 (5, 3, 'Para levantar una caja del piso se debe:', '["Doblar la espalda con piernas rectas","Doblar las rodillas y mantener la espalda recta","Girar el tronco mientras se levanta","Levantarla con un solo brazo"]', 1),

 (6, 1, '¿Aproximadamente cuánta agua se recomienda tomar al día?', '["Medio vaso","Entre 6 y 8 vasos","Solo cuando hay mucha sed","15 litros"]', 1),
 (6, 2, '¿Cuál es una señal de deshidratación?', '["Orina clara","Boca seca y orina oscura","Piel húmeda","Buena concentración"]', 1),
 (6, 3, '¿Cuál es la mejor bebida para hidratarse durante la jornada?', '["Gaseosa","Agua","Bebida energizante","Café"]', 1),

 (7, 1, '¿Cuál se considera una presión arterial normal en un adulto?', '["Menos de 120/80 mmHg","180/110 mmHg","160/100 mmHg","Cualquier valor"]', 0),
 (7, 2, '¿Cuál de estos es un factor de riesgo para enfermedad del corazón?', '["Caminar a diario","Fumar","Comer frutas","Dormir bien"]', 1),
 (7, 3, '¿Qué síntoma puede indicar un infarto?', '["Dolor en el pecho que se extiende al brazo izquierdo","Picazón en la mano","Hipo","Estornudos"]', 0),

 (8, 1, '¿Qué es la regla 20-20-20 para cuidar la vista frente a pantallas?', '["Cada 20 minutos mirar algo a 20 pies (6 m) durante 20 segundos","Trabajar 20 horas seguidas","Usar 20 pantallas","Parpadear 20 veces al día"]', 0),
 (8, 2, '¿Cada cuánto se recomienda un control visual en adultos?', '["Nunca","Cada 1 a 2 años","Cada 10 años","Solo si hay dolor"]', 1),
 (8, 3, 'Si cae una sustancia química en los ojos, lo primero es:', '["Frotar los ojos","Lavar con abundante agua limpia","Ponerse gotas cualquiera","Esperar a que pase"]', 1),

 (9, 1, '¿Cuál es el efecto del tabaco en la salud?', '["Mejora la respiración","Aumenta el riesgo de cáncer y enfermedades del corazón","No tiene efectos","Ayuda a la digestión"]', 1),
 (9, 2, '¿El alcohol afecta los reflejos al conducir?', '["No, nunca","Sí, incluso en pequeñas cantidades","Solo si se toma más de una botella","Solo en la noche"]', 1),
 (9, 3, 'Fumar cigarrillo electrónico (vapeador):', '["Es completamente inofensivo","También tiene riesgos para la salud","Cura la tos","Es recomendado por los médicos"]', 1),

 (10, 1, 'Ante una persona inconsciente, lo primero que se debe hacer es:', '["Darle agua","Verificar que la escena sea segura y pedir ayuda","Moverla rápidamente","Dejarla sola"]', 1),
 (10, 2, '¿Qué se debe hacer ante una herida con sangrado abundante?', '["Hacer presión directa con un paño limpio","Lavarla con alcohol y dejarla abierta","Ponerle café","No hacer nada"]', 0),
 (10, 3, 'Ante una quemadura leve, lo indicado es:', '["Aplicar crema dental","Enfriar con agua a temperatura ambiente varios minutos","Reventar las ampollas","Aplicar hielo directo"]', 1);

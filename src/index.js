// Cuestionario Feria de la Salud — Cloudflare Worker + D1
// Sirve la API en /api/* y deja que Cloudflare sirva los archivos de /public.

const SESION_COLAB_DIAS = 7;
const SESION_ADMIN_HORAS = 12;

class HttpError extends Error {
  constructor(status, codigo, mensaje) { super(mensaje); this.status = status; this.codigo = codigo; }
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const ahora = () => new Date().toISOString();
const masMs = (ms) => new Date(Date.now() + ms).toISOString();

function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function aleatorioHex(bytes = 16) {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}
async function hashClave(salt, clave) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${clave}`)));
}
function igual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const limpiar = (v) => (v === undefined || v === null ? '' : String(v).trim());
const limpiarDoc = (v) => limpiar(v).replace(/[.,\s-]/g, '');

async function leerJson(req) {
  try { return await req.json(); } catch { throw new HttpError(400, 'JSON_INVALIDO', 'Solicitud inválida'); }
}

async function sesion(req, env, admin = false) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) throw new HttpError(401, 'SESION_INVALIDA', 'Debes iniciar sesión');
  const s = await env.DB.prepare('SELECT * FROM sesiones WHERE token = ? AND expira > ?').bind(token, ahora()).first();
  if (!s) throw new HttpError(401, 'SESION_INVALIDA', 'Tu sesión expiró, ingresa de nuevo');
  if (admin && !s.es_admin) throw new HttpError(403, 'NO_AUTORIZADO', 'No autorizado');
  if (!admin && !s.colaborador_id) throw new HttpError(403, 'NO_AUTORIZADO', 'No autorizado');
  return s;
}

async function config(env) {
  return env.DB.prepare('SELECT * FROM config WHERE id = 1').first();
}

// ---------------------------------------------------------------- colaborador

async function ingresar(req, env) {
  const { documento } = await leerJson(req);
  const doc = limpiarDoc(documento);
  if (!doc) throw new HttpError(400, 'DATOS', 'Escribe tu número de documento');
  const c = await env.DB.prepare('SELECT id, nombre FROM colaboradores WHERE documento = ?').bind(doc).first();
  if (!c) throw new HttpError(401, 'NO_REGISTRADO', 'Ese documento no está registrado. Revisa el número o comunícate con el organizador.');
  const token = aleatorioHex(24);
  await env.DB.batch([
    env.DB.prepare('UPDATE colaboradores SET ultimo_ingreso = ? WHERE id = ?').bind(ahora(), c.id),
    env.DB.prepare('DELETE FROM sesiones WHERE colaborador_id = ? AND expira < ?').bind(c.id, ahora()),
    env.DB.prepare('INSERT INTO sesiones (token, colaborador_id, es_admin, expira) VALUES (?, ?, 0, ?)')
      .bind(token, c.id, masMs(SESION_COLAB_DIAS * 864e5)),
  ]);
  return json({ token, nombre: c.nombre });
}

async function miCuestionario(req, env) {
  const s = await sesion(req, env);
  const [cfg, colab, temas, preguntas, resp, envios] = await Promise.all([
    config(env),
    env.DB.prepare('SELECT nombre, enviado_en FROM colaboradores WHERE id = ?').bind(s.colaborador_id).first(),
    env.DB.prepare('SELECT id, nombre, ciudad FROM temas ORDER BY orden').all(),
    env.DB.prepare('SELECT id, tema_id, enunciado, opciones FROM preguntas ORDER BY tema_id, orden').all(),
    env.DB.prepare('SELECT pregunta_id, opcion FROM respuestas WHERE colaborador_id = ?').bind(s.colaborador_id).all(),
    env.DB.prepare('SELECT tema_id, enviado_en FROM envios_tema WHERE colaborador_id = ?').bind(s.colaborador_id).all(),
  ]);
  const mias = new Map(resp.results.map((r) => [r.pregunta_id, r.opcion]));
  const enviados = new Map(envios.results.map((e) => [e.tema_id, e.enviado_en]));
  const resultado = enviados.size || colab?.enviado_en ? await calcularResultado(env, s.colaborador_id) : null;
  const resTema = new Map((resultado?.por_tema || []).map((t) => [t.id, t]));
  return json({
    nombre: colab?.nombre,
    enviado_en: colab?.enviado_en || null,
    resultado: colab?.enviado_en ? resultado : null,
    titulo: cfg.titulo,
    inicio: cfg.inicio,
    cierre: cfg.cierre,
    ahora: ahora(),
    temas: temas.results.map((t) => ({
      id: t.id,
      nombre: t.nombre,
      ciudad: t.ciudad || '',
      enviado_en: enviados.get(t.id) || null,
      resultado: enviados.has(t.id) ? resTema.get(t.id) : null,
      preguntas: preguntas.results
        .filter((p) => p.tema_id === t.id)
        .map((p) => ({ id: p.id, enunciado: p.enunciado, opciones: JSON.parse(p.opciones), respuesta: mias.get(p.id) ?? null })),
    })),
  });
}

// Resultado del colaborador: % de aciertos y preguntas falladas agrupadas por tema
async function calcularResultado(env, colabId) {
  const [temas, preguntas, resp] = await Promise.all([
    env.DB.prepare('SELECT id, nombre, ciudad FROM temas ORDER BY orden').all(),
    env.DB.prepare('SELECT id, tema_id, enunciado, opciones, correcta FROM preguntas ORDER BY tema_id, orden').all(),
    env.DB.prepare('SELECT pregunta_id, opcion, es_correcta FROM respuestas WHERE colaborador_id = ?').bind(colabId).all(),
  ]);
  const mias = new Map(resp.results.map((r) => [r.pregunta_id, r]));
  let correctas = 0;
  const total = preguntas.results.length;
  const por_tema = temas.results.map((t) => {
    const ps = preguntas.results.filter((p) => p.tema_id === t.id);
    const falladas = [];
    let ok = 0;
    for (const p of ps) {
      const r = mias.get(p.id);
      const opciones = JSON.parse(p.opciones);
      if (r && r.es_correcta) { ok++; continue; }
      falladas.push({ enunciado: p.enunciado, tu_respuesta: r ? opciones[r.opcion] ?? null : null, correcta: opciones[p.correcta] });
    }
    correctas += ok;
    return { id: t.id, nombre: t.nombre, ciudad: t.ciudad || '', correctas: ok, total: ps.length, falladas };
  });
  return { correctas, total, porcentaje: total ? Math.round((100 * correctas) / total) : 0, por_tema };
}

async function enviarCuestionario(req, env) {
  const s = await sesion(req, env);
  const c = await env.DB.prepare('SELECT enviado_en FROM colaboradores WHERE id = ?').bind(s.colaborador_id).first();
  if (!c.enviado_en) {
    const cfg = await config(env);
    const t = ahora();
    if (t < cfg.inicio) throw new HttpError(403, 'NO_HA_INICIADO', 'El cuestionario todavía no ha abierto');
    if (t > cfg.cierre) throw new HttpError(403, 'CERRADO', 'El plazo para responder ya terminó');
    const { total } = await env.DB.prepare('SELECT COUNT(*) AS total FROM preguntas').first();
    const { hechas } = await env.DB.prepare('SELECT COUNT(*) AS hechas FROM respuestas WHERE colaborador_id = ?').bind(s.colaborador_id).first();
    if (hechas < total) throw new HttpError(400, 'INCOMPLETO', `Te faltan ${total - hechas} preguntas por responder antes de enviar.`);
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO envios_tema (colaborador_id, tema_id, enviado_en) SELECT ?, id, ? FROM temas').bind(s.colaborador_id, t),
      env.DB.prepare('UPDATE colaboradores SET enviado_en = ? WHERE id = ? AND enviado_en IS NULL').bind(t, s.colaborador_id),
    ]);
  }
  return json({ ok: true, resultado: await calcularResultado(env, s.colaborador_id) });
}

// Envía un solo tema: queda bloqueado y el colaborador ve sus aciertos. Al enviar el último, queda enviado todo el cuestionario.
async function enviarTema(req, env) {
  const s = await sesion(req, env);
  const { tema_id } = await leerJson(req);
  const tid = Number(tema_id);
  const tema = await env.DB.prepare('SELECT id FROM temas WHERE id = ?').bind(tid).first();
  if (!tema) throw new HttpError(400, 'TEMA_INVALIDO', 'Tema inválido');
  const ya = await env.DB.prepare('SELECT 1 FROM envios_tema WHERE colaborador_id = ? AND tema_id = ?').bind(s.colaborador_id, tid).first();
  const t = ahora();
  if (!ya) {
    const cfg = await config(env);
    if (t < cfg.inicio) throw new HttpError(403, 'NO_HA_INICIADO', 'El cuestionario todavía no ha abierto');
    if (t > cfg.cierre) throw new HttpError(403, 'CERRADO', 'El plazo para responder ya terminó');
    const { total, hechas } = await env.DB.prepare(
      `SELECT COUNT(*) AS total, COUNT(r.pregunta_id) AS hechas FROM preguntas p
       LEFT JOIN respuestas r ON r.pregunta_id = p.id AND r.colaborador_id = ? WHERE p.tema_id = ?`
    ).bind(s.colaborador_id, tid).first();
    if (hechas < total) throw new HttpError(400, 'INCOMPLETO', `Te faltan ${total - hechas} preguntas de este tema antes de enviarlo.`);
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO envios_tema (colaborador_id, tema_id, enviado_en) VALUES (?, ?, ?)').bind(s.colaborador_id, tid, t),
      // Si con este quedan enviados todos los temas, el cuestionario completo queda enviado
      env.DB.prepare(
        `UPDATE colaboradores SET enviado_en = ? WHERE id = ? AND enviado_en IS NULL
         AND (SELECT COUNT(*) FROM envios_tema WHERE colaborador_id = ?) >= (SELECT COUNT(*) FROM temas)`
      ).bind(t, s.colaborador_id, s.colaborador_id),
    ]);
  }
  const res = await calcularResultado(env, s.colaborador_id);
  const c = await env.DB.prepare('SELECT enviado_en FROM colaboradores WHERE id = ?').bind(s.colaborador_id).first();
  return json({ ok: true, tema: res.por_tema.find((x) => x.id === tid), completo: !!c.enviado_en, resultado: c.enviado_en ? res : null });
}

async function guardarRespuesta(req, env) {
  const s = await sesion(req, env);
  const { pregunta_id, opcion } = await leerJson(req);
  const cfg = await config(env);
  const t = ahora();
  if (t < cfg.inicio) throw new HttpError(403, 'NO_HA_INICIADO', 'El cuestionario todavía no ha abierto');
  if (t > cfg.cierre) throw new HttpError(403, 'CERRADO', 'El plazo para responder ya terminó');
  const yo = await env.DB.prepare('SELECT enviado_en FROM colaboradores WHERE id = ?').bind(s.colaborador_id).first();
  if (yo?.enviado_en) throw new HttpError(403, 'ENVIADO', 'Ya enviaste tu cuestionario. Las respuestas no se pueden cambiar.');
  const p = await env.DB.prepare('SELECT id, tema_id, opciones, correcta FROM preguntas WHERE id = ?').bind(Number(pregunta_id)).first();
  if (!p) throw new HttpError(400, 'PREGUNTA_INVALIDA', 'Pregunta inválida');
  const env_t = await env.DB.prepare('SELECT 1 FROM envios_tema WHERE colaborador_id = ? AND tema_id = ?').bind(s.colaborador_id, p.tema_id).first();
  if (env_t) throw new HttpError(403, 'TEMA_ENVIADO', 'Ya enviaste este tema. Sus respuestas no se pueden cambiar.');
  const n = JSON.parse(p.opciones).length;
  const o = Number(opcion);
  if (!Number.isInteger(o) || o < 0 || o >= n) throw new HttpError(400, 'OPCION_INVALIDA', 'Opción inválida');
  await env.DB.prepare(
    `INSERT INTO respuestas (colaborador_id, pregunta_id, opcion, es_correcta, respondida) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (colaborador_id, pregunta_id) DO UPDATE SET opcion = excluded.opcion, es_correcta = excluded.es_correcta, respondida = excluded.respondida`
  ).bind(s.colaborador_id, p.id, o, o === p.correcta ? 1 : 0, t).run();
  return json({ ok: true, guardado: t });
}

async function salir(req, env) {
  const auth = req.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) await env.DB.prepare('DELETE FROM sesiones WHERE token = ?').bind(auth.slice(7)).run();
  return json({ ok: true });
}

// ---------------------------------------------------------------- administrador

async function adminIngresar(req, env) {
  const { clave } = await leerJson(req);
  const cfg = await config(env);
  const h = await hashClave(cfg.admin_salt, limpiar(clave));
  if (!igual(h, cfg.admin_hash)) {
    await new Promise((r) => setTimeout(r, 800));
    throw new HttpError(401, 'CREDENCIALES', 'Clave incorrecta');
  }
  const token = aleatorioHex(24);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sesiones WHERE es_admin = 1 AND expira < ?').bind(ahora()),
    env.DB.prepare('INSERT INTO sesiones (token, colaborador_id, es_admin, expira) VALUES (?, NULL, 1, ?)').bind(token, masMs(SESION_ADMIN_HORAS * 36e5)),
  ]);
  return json({ token });
}

async function adminReporte(req, env) {
  await sesion(req, env, true);
  // Una fila por colaborador; el avance por tema viene compactado como "tema:respondidas:correctas,..."
  // para que el Worker haga muy poco trabajo aunque haya miles de personas.
  const [cfg, temas, colabs] = await Promise.all([
    config(env),
    env.DB.prepare('SELECT t.id, t.nombre, t.ciudad, COUNT(p.id) AS n FROM temas t LEFT JOIN preguntas p ON p.tema_id = t.id GROUP BY t.id ORDER BY t.orden').all(),
    env.DB.prepare(
      `SELECT c.documento AS d, c.nombre AS n, c.area AS a, c.ultimo_ingreso AS i, c.enviado_en AS e,
              (SELECT MAX(respondida) FROM respuestas WHERE colaborador_id = c.id) AS u,
              (SELECT GROUP_CONCAT(x, ',') FROM (
                 SELECT p.tema_id || ':' || COUNT(*) || ':' || SUM(r.es_correcta) AS x
                 FROM respuestas r JOIN preguntas p ON p.id = r.pregunta_id
                 WHERE r.colaborador_id = c.id GROUP BY p.tema_id)) AS g,
              (SELECT GROUP_CONCAT(tema_id, ',') FROM envios_tema WHERE colaborador_id = c.id) AS s
       FROM colaboradores c ORDER BY c.nombre`
    ).all(),
  ]);
  return json({
    config: { titulo: cfg.titulo, inicio: cfg.inicio, cierre: cfg.cierre, bi_creada: cfg.bi_creada || null },
    temas: temas.results,
    colaboradores: colabs.results,
  });
}

async function adminPlazo(req, env) {
  await sesion(req, env, true);
  const { inicio, cierre, titulo } = await leerJson(req);
  const i = new Date(inicio), c = new Date(cierre);
  if (isNaN(i) || isNaN(c) || c <= i) throw new HttpError(400, 'FECHAS', 'La fecha de cierre debe ser posterior a la de inicio');
  await env.DB.prepare('UPDATE config SET inicio = ?, cierre = ?, titulo = COALESCE(NULLIF(?, \'\'), titulo) WHERE id = 1')
    .bind(i.toISOString(), c.toISOString(), limpiar(titulo)).run();
  return json({ ok: true });
}

// Carga masiva: [{documento, nombre, area}]. Crea los nuevos y actualiza nombre/área de los existentes.
async function adminCargarColaboradores(req, env) {
  await sesion(req, env, true);
  const { filas } = await leerJson(req);
  if (!Array.isArray(filas) || filas.length === 0) throw new HttpError(400, 'DATOS', 'No llegaron filas');
  if (filas.length > 500) throw new HttpError(400, 'DATOS', 'Máximo 500 filas por envío');
  const stmts = [];
  const vistos = new Set();
  let validas = 0, omitidos = 0;
  for (const f of filas) {
    const doc = limpiarDoc(f.documento);
    const nombre = limpiar(f.nombre);
    const area = limpiar(f.area) || null;
    if (!doc || !nombre || vistos.has(doc)) { omitidos++; continue; }
    vistos.add(doc);
    validas++;
    stmts.push(env.DB.prepare(
      `INSERT INTO colaboradores (documento, nombre, area, pin_salt, pin_hash) VALUES (?, ?, ?, '', '')
       ON CONFLICT (documento) DO UPDATE SET nombre = excluded.nombre, area = excluded.area`
    ).bind(doc, nombre, area));
  }
  const antes = (await env.DB.prepare('SELECT COUNT(*) AS n FROM colaboradores').first()).n;
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
  const despues = (await env.DB.prepare('SELECT COUNT(*) AS n FROM colaboradores').first()).n;
  const nuevos = despues - antes;
  return json({ nuevos, actualizados: validas - nuevos, omitidos });
}

// Crea o edita un colaborador. Si viene documento_anterior, se edita ese registro (y se puede cambiar el documento).
async function adminGuardarColaborador(req, env) {
  await sesion(req, env, true);
  const { documento_anterior, documento, nombre, area } = await leerJson(req);
  const doc = limpiarDoc(documento);
  const nom = limpiar(nombre);
  const ar = limpiar(area) || null;
  if (!doc) throw new HttpError(400, 'DATOS', 'Escribe el número de documento.');
  if (!/^[0-9A-Za-z]{3,20}$/.test(doc)) throw new HttpError(400, 'DATOS', 'El documento solo puede tener números o letras, entre 3 y 20 caracteres.');
  if (!nom) throw new HttpError(400, 'DATOS', 'Escribe el nombre completo.');
  const anterior = limpiarDoc(documento_anterior);
  const otro = await env.DB.prepare('SELECT documento FROM colaboradores WHERE documento = ?').bind(doc).first();
  if (anterior) {
    if (otro && doc !== anterior) throw new HttpError(409, 'DUPLICADO', `Ya existe otro colaborador con el documento ${doc}.`);
    const r = await env.DB.prepare('UPDATE colaboradores SET documento = ?, nombre = ?, area = ? WHERE documento = ?').bind(doc, nom, ar, anterior).run();
    if (!r.meta.changes) throw new HttpError(404, 'NO_EXISTE', 'Ese colaborador ya no existe. Actualiza la página.');
    return json({ ok: true, accion: 'editado' });
  }
  if (otro) throw new HttpError(409, 'DUPLICADO', `Ya existe un colaborador con el documento ${doc}.`);
  await env.DB.prepare("INSERT INTO colaboradores (documento, nombre, area, pin_salt, pin_hash) VALUES (?, ?, ?, '', '')").bind(doc, nom, ar).run();
  return json({ ok: true, accion: 'creado' });
}

// Todas las respuestas, por páginas, para el Excel: [documento, pregunta_id, opcion, es_correcta]
async function adminRespuestas(req, env) {
  await sesion(req, env, true);
  const desde = Math.max(0, Number(new URL(req.url).searchParams.get('desde')) || 0);
  const LOTE = 4000;
  const r = await env.DB.prepare(
    `SELECT r.rowid AS k, c.documento AS d, r.pregunta_id AS p, r.opcion AS o, r.es_correcta AS ok
     FROM respuestas r JOIN colaboradores c ON c.id = r.colaborador_id WHERE r.rowid > ? ORDER BY r.rowid LIMIT ?`
  ).bind(desde, LOTE).raw();
  const filas = r.map(([k, d, p, o, ok]) => [d, p, o, ok]);
  return json({ filas, siguiente: r.length === LOTE ? r[r.length - 1][0] : null });
}

async function adminReabrir(req, env) {
  await sesion(req, env, true);
  const { documento } = await leerJson(req);
  const doc = limpiarDoc(documento);
  const [r] = await env.DB.batch([
    env.DB.prepare('UPDATE colaboradores SET enviado_en = NULL WHERE documento = ?').bind(doc),
    env.DB.prepare('DELETE FROM envios_tema WHERE colaborador_id = (SELECT id FROM colaboradores WHERE documento = ?)').bind(doc),
  ]);
  if (!r.meta.changes) throw new HttpError(404, 'NO_EXISTE', 'No existe un colaborador con ese documento');
  return json({ ok: true });
}

async function adminEliminarColaborador(req, env) {
  await sesion(req, env, true);
  const { documento } = await leerJson(req);
  const r = await env.DB.prepare('DELETE FROM colaboradores WHERE documento = ?').bind(limpiarDoc(documento)).run();
  if (!r.meta.changes) throw new HttpError(404, 'NO_EXISTE', 'No existe un colaborador con ese documento');
  return json({ ok: true });
}

async function adminCambiarClave(req, env) {
  await sesion(req, env, true);
  const { actual, nueva } = await leerJson(req);
  const cfg = await config(env);
  if (!igual(await hashClave(cfg.admin_salt, limpiar(actual)), cfg.admin_hash)) throw new HttpError(401, 'CREDENCIALES', 'La clave actual no es correcta');
  if (limpiar(nueva).length < 8) throw new HttpError(400, 'DATOS', 'La nueva clave debe tener al menos 8 caracteres');
  const salt = aleatorioHex(16);
  await env.DB.batch([
    env.DB.prepare('UPDATE config SET admin_salt = ?, admin_hash = ? WHERE id = 1').bind(salt, await hashClave(salt, limpiar(nueva))),
    env.DB.prepare('DELETE FROM sesiones WHERE es_admin = 1'),
  ]);
  return json({ ok: true });
}

// Reemplaza todas las preguntas: [{tema, enunciado, opciones:[...], correcta}]
async function adminCargarPreguntas(req, env) {
  await sesion(req, env, true);
  const { preguntas, forzar } = await leerJson(req);
  if (!Array.isArray(preguntas) || preguntas.length === 0) throw new HttpError(400, 'DATOS', 'No llegaron preguntas');
  const nResp = (await env.DB.prepare('SELECT COUNT(*) AS n FROM respuestas').first()).n;
  if (nResp > 0 && !forzar) {
    throw new HttpError(409, 'HAY_RESPUESTAS', `Ya hay ${nResp} respuestas guardadas. Si reemplazas las preguntas se borrarán.`);
  }
  const temas = [];
  const ciudades = new Map();
  const errores = [];
  preguntas.forEach((p, i) => {
    const tema = limpiar(p.tema);
    const opciones = (p.opciones || []).map(limpiar).filter(Boolean);
    const correcta = Number(p.correcta);
    if (!tema || !limpiar(p.enunciado) || opciones.length < 2 || !Number.isInteger(correcta) || correcta < 0 || correcta >= opciones.length) {
      errores.push(i + 2);
    }
    if (tema && !temas.includes(tema)) temas.push(tema);
    if (tema && limpiar(p.ciudad) && !ciudades.has(tema)) ciudades.set(tema, limpiar(p.ciudad));
  });
  if (errores.length) throw new HttpError(400, 'DATOS', `Revisa las filas: ${errores.slice(0, 15).join(', ')}${errores.length > 15 ? '…' : ''}`);
  const stmts = [
    env.DB.prepare('DELETE FROM respuestas'),
    env.DB.prepare('DELETE FROM envios_tema'),
    env.DB.prepare('UPDATE colaboradores SET enviado_en = NULL'),
    env.DB.prepare('DELETE FROM preguntas'),
    env.DB.prepare('DELETE FROM temas'),
  ];
  temas.forEach((t, i) => stmts.push(env.DB.prepare('INSERT INTO temas (id, orden, nombre, ciudad) VALUES (?, ?, ?, ?)').bind(i + 1, i + 1, t, ciudades.get(t) || null)));
  const orden = new Map();
  for (const p of preguntas) {
    const tid = temas.indexOf(limpiar(p.tema)) + 1;
    const o = (orden.get(tid) || 0) + 1;
    orden.set(tid, o);
    const opciones = p.opciones.map(limpiar).filter(Boolean);
    stmts.push(env.DB.prepare('INSERT INTO preguntas (tema_id, orden, enunciado, opciones, correcta) VALUES (?, ?, ?, ?, ?)')
      .bind(tid, o, limpiar(p.enunciado), JSON.stringify(opciones), Number(p.correcta)));
  }
  await env.DB.batch(stmts);
  return json({ ok: true, temas: temas.length, preguntas: preguntas.length });
}

async function adminPreguntas(req, env) {
  await sesion(req, env, true);
  const r = await env.DB.prepare(
    'SELECT p.id, t.nombre AS tema, t.ciudad, p.enunciado, p.opciones, p.correcta FROM preguntas p JOIN temas t ON t.id = p.tema_id ORDER BY t.orden, p.orden'
  ).all();
  return json({ preguntas: r.results.map((p) => ({ ...p, opciones: JSON.parse(p.opciones) })) });
}

// ---------------------------------------------------------------- Power BI (solo lectura)
// GET /api/bi/<tabla>?desde=N  con encabezado  x-clave: <clave de Power BI>
// Respuesta: { tabla, filas: [...], siguiente }  — si "siguiente" no es null, pedir de nuevo con desde=siguiente.
// Nunca expone la configuración, las sesiones ni los hashes.

const BI_LOTE = 5000;
const LETRA = 'ABCDEFGH';
// Fechas en hora de Colombia (UTC-5, sin horario de verano), formato que Power BI reconoce
const horaCol = (iso) => (iso ? new Date(new Date(iso).getTime() - 5 * 36e5).toISOString().slice(0, 19).replace('T', ' ') : null);
const pctBI = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);

const TABLAS_BI = {
  temas: {
    desc: 'Los 10 temas con su ciudad homenajeada',
    async leer(env) {
      const r = await env.DB.prepare(
        'SELECT t.id AS tema_id, t.orden, t.nombre AS tema, t.ciudad, (SELECT COUNT(*) FROM preguntas p WHERE p.tema_id = t.id) AS preguntas FROM temas t ORDER BY t.orden'
      ).all();
      return { filas: r.results };
    },
  },
  preguntas: {
    desc: 'Preguntas con sus opciones y la respuesta correcta',
    async leer(env) {
      const r = await env.DB.prepare(
        'SELECT p.id AS pregunta_id, p.tema_id, t.nombre AS tema, t.orden AS tema_orden, p.orden, p.enunciado, p.opciones, p.correcta FROM preguntas p JOIN temas t ON t.id = p.tema_id ORDER BY t.orden, p.orden'
      ).all();
      return {
        filas: r.results.map((p) => {
          const o = JSON.parse(p.opciones);
          return {
            pregunta_id: p.pregunta_id, codigo: `T${p.tema_orden}-P${p.orden}`, tema_id: p.tema_id, tema: p.tema, orden: p.orden, enunciado: p.enunciado,
            opcion_a: o[0] ?? null, opcion_b: o[1] ?? null, opcion_c: o[2] ?? null, opcion_d: o[3] ?? null,
            correcta: LETRA[p.correcta], respuesta_correcta: o[p.correcta] ?? null,
          };
        }),
      };
    },
  },
  colaboradores: {
    desc: 'Colaboradores registrados',
    async leer(env, desde) {
      const r = await env.DB.prepare(
        'SELECT id, documento, nombre, area, creado, ultimo_ingreso, enviado_en FROM colaboradores WHERE id > ? ORDER BY id LIMIT ?'
      ).bind(desde, BI_LOTE).all();
      return {
        filas: r.results.map((c) => ({ documento: c.documento, nombre: c.nombre, area: c.area, registrado: horaCol(c.creado), ultimo_ingreso: horaCol(c.ultimo_ingreso), envio_los_10_temas: horaCol(c.enviado_en) })),
        siguiente: r.results.length === BI_LOTE ? r.results[r.results.length - 1].id : null,
      };
    },
  },
  respuestas: {
    desc: 'Cada respuesta marcada: una fila por colaborador y pregunta',
    async leer(env, desde) {
      const r = await env.DB.prepare(
        `SELECT r.rowid AS k, c.documento, p.tema_id, r.pregunta_id, r.opcion, r.es_correcta, r.respondida,
                CASE WHEN e.tema_id IS NULL THEN 0 ELSE 1 END AS enviado
         FROM respuestas r JOIN colaboradores c ON c.id = r.colaborador_id JOIN preguntas p ON p.id = r.pregunta_id
         LEFT JOIN envios_tema e ON e.colaborador_id = r.colaborador_id AND e.tema_id = p.tema_id
         WHERE r.rowid > ? ORDER BY r.rowid LIMIT ?`
      ).bind(desde, BI_LOTE).all();
      return {
        filas: r.results.map((x) => ({ documento: x.documento, tema_id: x.tema_id, pregunta_id: x.pregunta_id, opcion: LETRA[x.opcion], es_correcta: x.es_correcta, tema_enviado: x.enviado, respondida: horaCol(x.respondida) })),
        siguiente: r.results.length === BI_LOTE ? r.results[r.results.length - 1].k : null,
      };
    },
  },
  envios_tema: {
    desc: 'Temas enviados: una fila por colaborador y tema enviado',
    async leer(env, desde) {
      const r = await env.DB.prepare(
        `SELECT e.rowid AS k, c.documento, e.tema_id, e.enviado_en FROM envios_tema e JOIN colaboradores c ON c.id = e.colaborador_id
         WHERE e.rowid > ? ORDER BY e.rowid LIMIT ?`
      ).bind(desde, BI_LOTE).all();
      return {
        filas: r.results.map((x) => ({ documento: x.documento, tema_id: x.tema_id, enviado_en: horaCol(x.enviado_en) })),
        siguiente: r.results.length === BI_LOTE ? r.results[r.results.length - 1].k : null,
      };
    },
  },
  resultado_tema: {
    desc: 'Resultado por colaborador y tema (10 filas por persona)',
    async leer(env, desde) {
      const COLABS = 500;
      const r = await env.DB.prepare(
        `SELECT c.id AS k, c.documento, c.nombre, c.area, t.id AS tema_id, t.nombre AS tema, t.ciudad,
                COUNT(p.id) AS preguntas, COUNT(r.pregunta_id) AS respondidas, COALESCE(SUM(r.es_correcta), 0) AS correctas, e.enviado_en
         FROM (SELECT id, documento, nombre, area FROM colaboradores WHERE id > ? ORDER BY id LIMIT ?) c
         CROSS JOIN temas t
         LEFT JOIN preguntas p ON p.tema_id = t.id
         LEFT JOIN respuestas r ON r.pregunta_id = p.id AND r.colaborador_id = c.id
         LEFT JOIN envios_tema e ON e.colaborador_id = c.id AND e.tema_id = t.id
         GROUP BY c.id, t.id ORDER BY c.id, t.orden`
      ).bind(desde, COLABS).all();
      const ids = new Set(r.results.map((x) => x.k));
      return {
        filas: r.results.map((x) => ({
          documento: x.documento, nombre: x.nombre, area: x.area, tema_id: x.tema_id, tema: x.tema, ciudad: x.ciudad,
          preguntas: x.preguntas, respondidas: x.respondidas, correctas: x.correctas,
          estado: x.enviado_en ? 'Enviado' : x.respondidas === 0 ? 'Sin empezar' : x.respondidas < x.preguntas ? 'Incompleto' : 'Respondido sin enviar',
          enviado: x.enviado_en ? 1 : 0, enviado_en: horaCol(x.enviado_en),
          porcentaje: x.enviado_en ? pctBI(x.correctas, x.preguntas) : null,
        })),
        siguiente: ids.size === COLABS ? r.results[r.results.length - 1].k : null,
      };
    },
  },
  resultado_colaborador: {
    desc: 'Resumen por colaborador con su % de aprobación',
    async leer(env, desde) {
      const LOTE = 2000;
      const [tot, r] = await Promise.all([
        env.DB.prepare('SELECT (SELECT COUNT(*) FROM temas) AS temas, (SELECT COUNT(*) FROM preguntas) AS preguntas').first(),
        env.DB.prepare(
          `SELECT c.id AS k, c.documento, c.nombre, c.area, c.ultimo_ingreso, c.enviado_en,
                  (SELECT COUNT(*) FROM respuestas WHERE colaborador_id = c.id) AS respondidas,
                  (SELECT COUNT(*) FROM envios_tema WHERE colaborador_id = c.id) AS temas_enviados,
                  (SELECT COUNT(*) FROM envios_tema e JOIN preguntas p ON p.tema_id = e.tema_id WHERE e.colaborador_id = c.id) AS preguntas_enviadas,
                  (SELECT COUNT(*) FROM respuestas r JOIN preguntas p ON p.id = r.pregunta_id
                     JOIN envios_tema e ON e.colaborador_id = r.colaborador_id AND e.tema_id = p.tema_id
                   WHERE r.colaborador_id = c.id AND r.es_correcta = 1) AS correctas_enviadas,
                  (SELECT MAX(respondida) FROM respuestas WHERE colaborador_id = c.id) AS ultima_respuesta
           FROM colaboradores c WHERE c.id > ? ORDER BY c.id LIMIT ?`
        ).bind(desde, LOTE).all(),
      ]);
      return {
        filas: r.results.map((x) => ({
          documento: x.documento, nombre: x.nombre, area: x.area,
          estado: x.temas_enviados >= tot.temas && tot.temas ? 'Envió los 10 temas' : x.temas_enviados > 0 ? 'Envió algunos temas' : x.respondidas === 0 ? 'No ha iniciado' : 'En progreso',
          temas_enviados: x.temas_enviados, temas_total: tot.temas,
          preguntas_respondidas: x.respondidas, preguntas_total: tot.preguntas,
          preguntas_enviadas: x.preguntas_enviadas, correctas_enviadas: x.correctas_enviadas,
          porcentaje_aprobacion: pctBI(x.correctas_enviadas, x.preguntas_enviadas),
          porcentaje_sobre_total: pctBI(x.correctas_enviadas, tot.preguntas) ?? 0,
          ultimo_ingreso: horaCol(x.ultimo_ingreso), ultima_respuesta: horaCol(x.ultima_respuesta), envio_los_10_temas: horaCol(x.enviado_en),
        })),
        siguiente: r.results.length === LOTE ? r.results[r.results.length - 1].k : null,
      };
    },
  },
  // ----- Estadísticas listas para el tablero final
  resumen_tema: {
    desc: 'Por tema: cuántos lo vieron, lo enviaron, % de aciertos y ranking de más visto',
    async leer(env) {
      const [tot, r] = await Promise.all([
        env.DB.prepare('SELECT COUNT(*) AS n FROM colaboradores').first(),
        env.DB.prepare(
          `SELECT t.id AS tema_id, t.orden, t.nombre AS tema, t.ciudad,
                  (SELECT COUNT(*) FROM preguntas WHERE tema_id = t.id) AS preguntas,
                  (SELECT COUNT(DISTINCT r.colaborador_id) FROM respuestas r JOIN preguntas p ON p.id = r.pregunta_id WHERE p.tema_id = t.id) AS lo_empezaron,
                  (SELECT COUNT(*) FROM envios_tema WHERE tema_id = t.id) AS lo_enviaron,
                  (SELECT COUNT(*) FROM respuestas r JOIN preguntas p ON p.id = r.pregunta_id JOIN envios_tema e ON e.colaborador_id = r.colaborador_id AND e.tema_id = p.tema_id WHERE p.tema_id = t.id) AS respuestas_enviadas,
                  (SELECT COUNT(*) FROM respuestas r JOIN preguntas p ON p.id = r.pregunta_id JOIN envios_tema e ON e.colaborador_id = r.colaborador_id AND e.tema_id = p.tema_id WHERE p.tema_id = t.id AND r.es_correcta = 1) AS correctas,
                  (SELECT COUNT(*) FROM (SELECT e.colaborador_id FROM envios_tema e JOIN preguntas p ON p.tema_id = e.tema_id
                      LEFT JOIN respuestas r ON r.colaborador_id = e.colaborador_id AND r.pregunta_id = p.id
                    WHERE e.tema_id = t.id GROUP BY e.colaborador_id HAVING SUM(COALESCE(r.es_correcta, 0)) = COUNT(p.id))) AS perfectos
           FROM temas t ORDER BY t.orden`
        ).all(),
      ]);
      const orden = [...r.results].sort((a, b) => b.lo_enviaron - a.lo_enviaron);
      return {
        filas: r.results.map((x) => ({
          tema_id: x.tema_id, orden: x.orden, tema: x.tema, ciudad: x.ciudad, preguntas: x.preguntas, colaboradores_total: tot.n,
          lo_empezaron: x.lo_empezaron, lo_enviaron: x.lo_enviaron, no_lo_enviaron: tot.n - x.lo_enviaron,
          porcentaje_cobertura: pctBI(x.lo_enviaron, tot.n),
          respuestas_enviadas: x.respuestas_enviadas, correctas: x.correctas, incorrectas: x.respuestas_enviadas - x.correctas,
          porcentaje_aprobacion: pctBI(x.correctas, x.respuestas_enviadas),
          colaboradores_con_todo_correcto: x.perfectos,
          ranking_mas_visto: orden.findIndex((o) => o.tema_id === x.tema_id) + 1,
        })),
      };
    },
  },
  resumen_pregunta: {
    desc: 'Por pregunta: correctas, incorrectas, % de acierto y cuántos eligieron cada opción',
    async leer(env) {
      const [ps, r] = await Promise.all([
        TABLAS_BI.preguntas.leer(env),
        env.DB.prepare(
          `SELECT r.pregunta_id, r.opcion, COUNT(*) AS n,
                  SUM(CASE WHEN e.tema_id IS NULL THEN 0 ELSE 1 END) AS n_env
           FROM respuestas r JOIN preguntas p ON p.id = r.pregunta_id
           LEFT JOIN envios_tema e ON e.colaborador_id = r.colaborador_id AND e.tema_id = p.tema_id
           GROUP BY r.pregunta_id, r.opcion`
        ).all(),
      ]);
      const m = new Map();
      for (const x of r.results) { if (!m.has(x.pregunta_id)) m.set(x.pregunta_id, []); m.get(x.pregunta_id)[x.opcion] = x.n_env; }
      return {
        filas: ps.filas.map((p) => {
          const cnt = m.get(p.pregunta_id) || [];
          const ci = LETRA.indexOf(p.correcta);
          const total = cnt.reduce((a, b) => a + (b || 0), 0), ok = cnt[ci] || 0;
          let peor = null, max = 0;
          cnt.forEach((n, i) => { if (i !== ci && (n || 0) > max) { max = n; peor = LETRA[i]; } });
          return {
            pregunta_id: p.pregunta_id, codigo: p.codigo, tema_id: p.tema_id, tema: p.tema, enunciado: p.enunciado,
            correcta: p.correcta, respuesta_correcta: p.respuesta_correcta,
            respondieron: total, correctas: ok, incorrectas: total - ok, porcentaje_acierto: pctBI(ok, total),
            eligieron_a: cnt[0] || 0, eligieron_b: cnt[1] || 0, eligieron_c: cnt[2] || 0, eligieron_d: cnt[3] || 0,
            error_mas_comun: peor, error_mas_comun_texto: peor ? p['opcion_' + peor.toLowerCase()] : null,
          };
        }),
      };
    },
  },
  resumen_area: {
    desc: 'Por área: participación y % de aprobación',
    async leer(env) {
      const r = await env.DB.prepare(
        `SELECT COALESCE(NULLIF(c.area, ''), 'Sin área') AS area, COUNT(*) AS colaboradores,
                SUM(CASE WHEN EXISTS (SELECT 1 FROM respuestas WHERE colaborador_id = c.id) THEN 1 ELSE 0 END) AS participaron,
                SUM(CASE WHEN EXISTS (SELECT 1 FROM envios_tema WHERE colaborador_id = c.id) THEN 1 ELSE 0 END) AS enviaron_algun_tema,
                SUM(CASE WHEN c.enviado_en IS NOT NULL THEN 1 ELSE 0 END) AS enviaron_los_10,
                SUM((SELECT COUNT(*) FROM envios_tema WHERE colaborador_id = c.id)) AS temas_enviados,
                SUM((SELECT COUNT(*) FROM respuestas r JOIN preguntas p ON p.id = r.pregunta_id JOIN envios_tema e ON e.colaborador_id = r.colaborador_id AND e.tema_id = p.tema_id WHERE r.colaborador_id = c.id)) AS respuestas_enviadas,
                SUM((SELECT COUNT(*) FROM respuestas r JOIN preguntas p ON p.id = r.pregunta_id JOIN envios_tema e ON e.colaborador_id = r.colaborador_id AND e.tema_id = p.tema_id WHERE r.colaborador_id = c.id AND r.es_correcta = 1)) AS correctas
         FROM colaboradores c GROUP BY 1 ORDER BY 1`
      ).all();
      return {
        filas: r.results.map((x) => ({
          ...x, porcentaje_participacion: pctBI(x.participaron, x.colaboradores), porcentaje_completaron: pctBI(x.enviaron_los_10, x.colaboradores),
          promedio_temas_enviados: x.colaboradores ? Math.round((10 * x.temas_enviados) / x.colaboradores) / 10 : 0,
          porcentaje_aprobacion: pctBI(x.correctas, x.respuestas_enviadas),
        })),
      };
    },
  },
  avance_diario: {
    desc: 'Por día (hora Colombia): respuestas, temas enviados y personas activas',
    async leer(env) {
      const dia = (col) => `date(${col}, '-5 hours')`;
      const [a, b] = await Promise.all([
        env.DB.prepare(`SELECT ${dia('respondida')} AS dia, COUNT(*) AS respuestas, COUNT(DISTINCT colaborador_id) AS personas_activas FROM respuestas GROUP BY 1`).all(),
        env.DB.prepare(`SELECT ${dia('enviado_en')} AS dia, COUNT(*) AS temas_enviados, COUNT(DISTINCT colaborador_id) AS personas_que_enviaron FROM envios_tema GROUP BY 1`).all(),
      ]);
      const m = new Map();
      for (const x of a.results) m.set(x.dia, { dia: x.dia, respuestas: x.respuestas, personas_activas: x.personas_activas, temas_enviados: 0, personas_que_enviaron: 0 });
      for (const x of b.results) Object.assign(m.get(x.dia) || m.set(x.dia, { dia: x.dia, respuestas: 0, personas_activas: 0 }).get(x.dia), { temas_enviados: x.temas_enviados, personas_que_enviaron: x.personas_que_enviaron });
      return { filas: [...m.values()].sort((x, y) => (x.dia < y.dia ? -1 : 1)) };
    },
  },
};

async function claveBI(req, env) {
  const url = new URL(req.url);
  const clave = req.headers.get('x-clave') || url.searchParams.get('clave') || '';
  const cfg = await env.DB.prepare('SELECT bi_salt, bi_hash FROM config WHERE id = 1').first();
  if (!cfg?.bi_hash) throw new HttpError(403, 'BI_SIN_CLAVE', 'Primero genera la clave de Power BI en el panel (Configuración).');
  if (!clave || !igual(await hashClave(cfg.bi_salt, clave), cfg.bi_hash)) {
    await new Promise((r) => setTimeout(r, 500));
    throw new HttpError(401, 'BI_CLAVE', 'Clave de Power BI incorrecta');
  }
}

async function biTabla(req, env, nombre) {
  await claveBI(req, env);
  const t = TABLAS_BI[nombre];
  if (!t) throw new HttpError(404, 'NO_ENCONTRADO', `No existe la tabla ${nombre}`);
  const desde = Math.max(0, Number(new URL(req.url).searchParams.get('desde')) || 0);
  const { filas, siguiente = null } = await t.leer(env, desde);
  return json({ tabla: nombre, filas, siguiente });
}

async function biIndice(req, env) {
  await claveBI(req, env);
  return json({ tablas: Object.entries(TABLAS_BI).map(([nombre, t]) => ({ nombre, descripcion: t.desc, ruta: `/api/bi/${nombre}` })) });
}

async function adminGenerarClaveBI(req, env) {
  await sesion(req, env, true);
  const clave = 'bi_' + aleatorioHex(20);
  const salt = aleatorioHex(16);
  const t = ahora();
  await env.DB.prepare('UPDATE config SET bi_salt = ?, bi_hash = ?, bi_creada = ? WHERE id = 1').bind(salt, await hashClave(salt, clave), t).run();
  return json({ clave, creada: t });
}

async function adminQuitarClaveBI(req, env) {
  await sesion(req, env, true);
  await env.DB.prepare('UPDATE config SET bi_salt = NULL, bi_hash = NULL, bi_creada = NULL WHERE id = 1').run();
  return json({ ok: true });
}

// ---------------------------------------------------------------- router

const rutas = {
  'POST /api/ingresar': ingresar,
  'GET /api/cuestionario': miCuestionario,
  'POST /api/respuesta': guardarRespuesta,
  'POST /api/salir': salir,
  'POST /api/enviar': enviarCuestionario,
  'POST /api/enviar-tema': enviarTema,
  'POST /api/admin/ingresar': adminIngresar,
  'GET /api/admin/reporte': adminReporte,
  'POST /api/admin/plazo': adminPlazo,
  'POST /api/admin/colaboradores': adminCargarColaboradores,
  'POST /api/admin/eliminar-colaborador': adminEliminarColaborador,
  'POST /api/admin/colaborador': adminGuardarColaborador,
  'POST /api/admin/reabrir': adminReabrir,
  'GET /api/admin/respuestas': adminRespuestas,
  'POST /api/admin/clave': adminCambiarClave,
  'GET /api/admin/preguntas': adminPreguntas,
  'POST /api/admin/preguntas': adminCargarPreguntas,
  'POST /api/admin/clave-bi': adminGenerarClaveBI,
  'POST /api/admin/quitar-clave-bi': adminQuitarClaveBI,
  'GET /api/bi': biIndice,
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    let h = rutas[`${req.method} ${url.pathname}`];
    const bi = req.method === 'GET' && url.pathname.match(/^\/api\/bi\/([a-z_]+)$/);
    if (!h && bi) h = (r, e) => biTabla(r, e, bi[1]);
    if (!h) return json({ error: 'NO_ENCONTRADO', mensaje: 'Ruta no encontrada' }, 404);
    try {
      return await h(req, env);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.codigo, mensaje: e.message }, e.status);
      console.error(e);
      return json({ error: 'ERROR', mensaje: 'Ocurrió un error, intenta de nuevo' }, 500);
    }
  },
};

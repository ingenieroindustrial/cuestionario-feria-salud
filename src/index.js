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
  const [cfg, colab, temas, preguntas, resp] = await Promise.all([
    config(env),
    env.DB.prepare('SELECT nombre FROM colaboradores WHERE id = ?').bind(s.colaborador_id).first(),
    env.DB.prepare('SELECT id, nombre FROM temas ORDER BY orden').all(),
    env.DB.prepare('SELECT id, tema_id, enunciado, opciones FROM preguntas ORDER BY tema_id, orden').all(),
    env.DB.prepare('SELECT pregunta_id, opcion FROM respuestas WHERE colaborador_id = ?').bind(s.colaborador_id).all(),
  ]);
  const mias = new Map(resp.results.map((r) => [r.pregunta_id, r.opcion]));
  return json({
    nombre: colab?.nombre,
    titulo: cfg.titulo,
    inicio: cfg.inicio,
    cierre: cfg.cierre,
    ahora: ahora(),
    temas: temas.results.map((t) => ({
      id: t.id,
      nombre: t.nombre,
      preguntas: preguntas.results
        .filter((p) => p.tema_id === t.id)
        .map((p) => ({ id: p.id, enunciado: p.enunciado, opciones: JSON.parse(p.opciones), respuesta: mias.get(p.id) ?? null })),
    })),
  });
}

async function guardarRespuesta(req, env) {
  const s = await sesion(req, env);
  const { pregunta_id, opcion } = await leerJson(req);
  const cfg = await config(env);
  const t = ahora();
  if (t < cfg.inicio) throw new HttpError(403, 'NO_HA_INICIADO', 'El cuestionario todavía no ha abierto');
  if (t > cfg.cierre) throw new HttpError(403, 'CERRADO', 'El plazo para responder ya terminó');
  const p = await env.DB.prepare('SELECT id, opciones, correcta FROM preguntas WHERE id = ?').bind(Number(pregunta_id)).first();
  if (!p) throw new HttpError(400, 'PREGUNTA_INVALIDA', 'Pregunta inválida');
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
    env.DB.prepare('SELECT t.id, t.nombre, COUNT(p.id) AS n FROM temas t LEFT JOIN preguntas p ON p.tema_id = t.id GROUP BY t.id ORDER BY t.orden').all(),
    env.DB.prepare(
      `SELECT c.documento AS d, c.nombre AS n, c.area AS a, c.ultimo_ingreso AS i,
              (SELECT MAX(respondida) FROM respuestas WHERE colaborador_id = c.id) AS u,
              (SELECT GROUP_CONCAT(x, ',') FROM (
                 SELECT p.tema_id || ':' || COUNT(*) || ':' || SUM(r.es_correcta) AS x
                 FROM respuestas r JOIN preguntas p ON p.id = r.pregunta_id
                 WHERE r.colaborador_id = c.id GROUP BY p.tema_id)) AS g
       FROM colaboradores c ORDER BY c.nombre`
    ).all(),
  ]);
  return json({
    config: { titulo: cfg.titulo, inicio: cfg.inicio, cierre: cfg.cierre },
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
  const errores = [];
  preguntas.forEach((p, i) => {
    const tema = limpiar(p.tema);
    const opciones = (p.opciones || []).map(limpiar).filter(Boolean);
    const correcta = Number(p.correcta);
    if (!tema || !limpiar(p.enunciado) || opciones.length < 2 || !Number.isInteger(correcta) || correcta < 0 || correcta >= opciones.length) {
      errores.push(i + 2);
    }
    if (tema && !temas.includes(tema)) temas.push(tema);
  });
  if (errores.length) throw new HttpError(400, 'DATOS', `Revisa las filas: ${errores.slice(0, 15).join(', ')}${errores.length > 15 ? '…' : ''}`);
  const stmts = [
    env.DB.prepare('DELETE FROM respuestas'),
    env.DB.prepare('DELETE FROM preguntas'),
    env.DB.prepare('DELETE FROM temas'),
  ];
  temas.forEach((t, i) => stmts.push(env.DB.prepare('INSERT INTO temas (id, orden, nombre) VALUES (?, ?, ?)').bind(i + 1, i + 1, t)));
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
    'SELECT t.nombre AS tema, p.enunciado, p.opciones, p.correcta FROM preguntas p JOIN temas t ON t.id = p.tema_id ORDER BY t.orden, p.orden'
  ).all();
  return json({ preguntas: r.results.map((p) => ({ ...p, opciones: JSON.parse(p.opciones) })) });
}

// ---------------------------------------------------------------- router

const rutas = {
  'POST /api/ingresar': ingresar,
  'GET /api/cuestionario': miCuestionario,
  'POST /api/respuesta': guardarRespuesta,
  'POST /api/salir': salir,
  'POST /api/admin/ingresar': adminIngresar,
  'GET /api/admin/reporte': adminReporte,
  'POST /api/admin/plazo': adminPlazo,
  'POST /api/admin/colaboradores': adminCargarColaboradores,
  'POST /api/admin/eliminar-colaborador': adminEliminarColaborador,
  'POST /api/admin/colaborador': adminGuardarColaborador,
  'POST /api/admin/clave': adminCambiarClave,
  'GET /api/admin/preguntas': adminPreguntas,
  'POST /api/admin/preguntas': adminCargarPreguntas,
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    const h = rutas[`${req.method} ${url.pathname}`];
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

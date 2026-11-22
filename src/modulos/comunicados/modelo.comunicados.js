import { pool } from '../../config/conexion.bd.js'

// Comunicados oficiales del club (CU 6.3 · RF-26). SQL crudo; las reglas las decide el controlador.
// Estados: BORRADOR → PUBLICADO → RETIRADO. Solo un borrador se edita o se publica, y solo uno publicado se retira.

const CON_TILDES = 'áàäâéèëêíìïîóòöôúùüûñ'
const SIN_TILDES = 'aaaaeeeeiiiioooouuuun'
const sinTildes = (texto) => texto.toLowerCase().replace(/[áàäâéèëêíìïîóòöôúùüûñ]/g, (c) => SIN_TILDES[CON_TILDES.indexOf(c)])
const escaparLike = (texto) => texto.replace(/[\\%_]/g, '\\$&')

const COLUMNAS = `c.id, c.titulo, c.mensaje, c.alcance, c.estado, c.fecha_publicacion as "fechaPublicacion",
  json_build_object('id', u.id, 'nombre', u.nombre, 'apellido', u.apellido) as autor`
const DESDE = 'from comunicado c join usuario u on u.id = c.autor_usuario_id'

// Listado: los publicados primero por fecha de publicación (del más reciente al más viejo) y los demás por orden de
// creación. Se puede filtrar por estado y buscar por título (sin distinguir mayúsculas ni acentos).
export const listarComunicados = async ({ q, estado, pagina, tamanio }, db = pool) => {
  const condiciones = []
  const valores = []
  const agregar = (valor) => {
    valores.push(valor)
    return `$${valores.length}`
  }
  for (const palabra of sinTildes(q ?? '').split(/\s+/).filter(Boolean)) {
    condiciones.push(`translate(lower(c.titulo), '${CON_TILDES}', '${SIN_TILDES}') like ${agregar(`%${escaparLike(palabra)}%`)}`)
  }
  if (estado) condiciones.push(`c.estado = ${agregar(estado)}`)
  const donde = condiciones.length > 0 ? `where ${condiciones.join(' and ')}` : ''

  const { rows: conteo } = await db.query(`select count(*)::int as total ${DESDE} ${donde}`, valores)
  const { rows } = await db.query(
    `select ${COLUMNAS} ${DESDE} ${donde}
      order by coalesce(c.fecha_publicacion, now()) desc, c.id
      limit ${agregar(tamanio)} offset ${agregar((pagina - 1) * tamanio)}`,
    valores
  )
  return { comunicados: rows, total: conteo[0].total }
}

export const buscarComunicado = async (id, db = pool) => {
  const { rows } = await db.query(`select ${COLUMNAS} ${DESDE} where c.id = $1`, [id])
  return rows[0] ?? null
}

// Alta. Con accion 'PUBLICAR' queda PUBLICADO con la fecha de ahora (publicar()); con 'BORRADOR', sin fecha.
export const crearComunicado = async ({ titulo, mensaje, alcance, accion }, autorId, db = pool) => {
  const publicar = accion === 'PUBLICAR'
  const { rows } = await db.query(
    `insert into comunicado (autor_usuario_id, titulo, mensaje, alcance, estado, fecha_publicacion)
     values ($1, $2, $3, $4, $5, ${publicar ? 'now()' : 'null'}) returning id`,
    [autorId, titulo, mensaje, alcance, publicar ? 'PUBLICADO' : 'BORRADOR']
  )
  return buscarComunicado(rows[0].id, db)
}

// Edita un borrador y, si se pidió, lo publica en el mismo paso. El `where estado = 'BORRADOR'` hace que de dos pedidos
// simultáneos solo prospere uno. Devuelve { resultado: 'NO_ENCONTRADO' | 'NO_ES_BORRADOR' | 'OK', comunicado }.
export const editarBorrador = async (id, { titulo, mensaje, alcance, accion }, db = pool) => {
  const publicar = accion === 'PUBLICAR'
  const { rowCount } = await db.query(
    `update comunicado
        set titulo = $2, mensaje = $3, alcance = $4,
            estado = case when $5 then 'PUBLICADO'::estado_comunicado else estado end,
            fecha_publicacion = case when $5 then now() else fecha_publicacion end
      where id = $1 and estado = 'BORRADOR'`,
    [id, titulo, mensaje, alcance, publicar]
  )
  if (rowCount === 1) return { resultado: 'OK', comunicado: await buscarComunicado(id, db) }
  return { resultado: (await buscarComunicado(id, db)) ? 'NO_ES_BORRADOR' : 'NO_ENCONTRADO' }
}

// Publica un borrador ya guardado: exige que tenga mensaje. Devuelve { resultado: 'NO_ENCONTRADO' | 'NO_ES_BORRADOR' |
// 'SIN_MENSAJE' | 'OK', comunicado }.
export const publicarBorrador = async (id, db = pool) => {
  const { rowCount } = await db.query(
    `update comunicado set estado = 'PUBLICADO', fecha_publicacion = now()
      where id = $1 and estado = 'BORRADOR' and btrim(mensaje) <> ''`,
    [id]
  )
  if (rowCount === 1) return { resultado: 'OK', comunicado: await buscarComunicado(id, db) }
  const actual = await buscarComunicado(id, db)
  if (!actual) return { resultado: 'NO_ENCONTRADO' }
  return { resultado: actual.estado === 'BORRADOR' ? 'SIN_MENSAJE' : 'NO_ES_BORRADOR' }
}

// Retira un comunicado publicado (retirar()): conserva su fecha de publicación y deja de verse en el portal.
export const retirarComunicado = async (id, db = pool) => {
  const { rowCount } = await db.query(
    "update comunicado set estado = 'RETIRADO' where id = $1 and estado = 'PUBLICADO'",
    [id]
  )
  if (rowCount === 1) return { resultado: 'OK', comunicado: await buscarComunicado(id, db) }
  return { resultado: (await buscarComunicado(id, db)) ? 'NO_ESTA_PUBLICADO' : 'NO_ENCONTRADO' }
}
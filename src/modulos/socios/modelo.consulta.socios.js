import { pool } from '../../config/conexion.bd.js'
import { sinTildes } from '../usuarios/modelo.consulta.usuarios.js'
import { categoriaDeJugador } from '../torneos/modelo.categorias.js'
import { SQL_CUOTA_VENCIDA } from '../cuotas/modelo.cuotas.js'
import { CATEGORIA_ACTUAL } from '../jugadores/modelo.jugadores.js'

// Consulta de socios (CU 4.1 · paso 2, A3). SQL crudo; las reglas las decide el controlador.

const DISCIPLINAS = ['TENIS', 'PADEL']
const CON_TILDES = 'áàäâéèëêíìïîóòöôúùüûñ'
const SIN_TILDES = 'aaaaeeeeiiiioooouuuun'
const columnaNormalizada = (expresion) => `translate(lower(${expresion}), '${CON_TILDES}', '${SIN_TILDES}')`
const escaparLike = (texto) => texto.replace(/[\\%_]/g, '\\$&')

// estaAlDia(): un socio está ADEUDADO si tiene al menos una cuota PENDIENTE con vencimiento anterior a hoy (la misma
// regla que `estaVencida` en el listado de cuotas); en cualquier otro caso, incluso sin cuotas, está AL_DIA.
const TIENE_CUOTA_VENCIDA = `exists (select 1 from cuota_mensual c where c.socio_id = s.id and ${SQL_CUOTA_VENCIDA})`

const COLUMNAS = `s.id, s.jugador_id as "jugadorId", u.nombre, u.apellido, j.dni,
       s.fecha_alta::text as "fechaAlta", s.estado,
       case when ${TIENE_CUOTA_VENCIDA} then 'ADEUDADO' else 'AL_DIA' end as "situacionCuotas",
       json_build_object('TENIS', ${CATEGORIA_ACTUAL('TENIS')}, 'PADEL', ${CATEGORIA_ACTUAL('PADEL')}) as categorias`

const DESDE = `from socio s
       join jugador j on j.id = s.jugador_id
       join usuario u on u.id = j.usuario_id`

// Búsqueda por nombre, apellido o DNI, sin distinguir mayúsculas ni acentos. Cada palabra tiene que aparecer en alguno
// de esos campos (así "ana pérez" encuentra a Ana Pérez). El DNI se compara también sin puntos ("30.123.456").
// Los socios dados de baja siguen apareciendo, con su estado y su situación de cuotas.
export const listarSocios = async ({ q, estado, cuotas, pagina, tamanio }, db = pool) => {
  const condiciones = []
  const valores = []
  const agregar = (valor) => {
    valores.push(valor)
    return `$${valores.length}`
  }

  for (const palabra of sinTildes(q ?? '').split(/\s+/).filter(Boolean)) {
    const patron = agregar(`%${escaparLike(palabra)}%`)
    const soloDigitos = palabra.replace(/\./g, '')
    const porDni = soloDigitos ? ` or j.dni like ${agregar(`%${escaparLike(soloDigitos)}%`)}` : ''
    condiciones.push(
      `(${columnaNormalizada('u.nombre')} like ${patron}
        or ${columnaNormalizada('u.apellido')} like ${patron}${porDni})`
    )
  }
  if (estado) condiciones.push(`s.estado = ${agregar(estado)}`)
  if (cuotas === 'ADEUDADO') condiciones.push(TIENE_CUOTA_VENCIDA)
  if (cuotas === 'AL_DIA') condiciones.push(`not ${TIENE_CUOTA_VENCIDA}`)

  const donde = condiciones.length > 0 ? `where ${condiciones.join(' and ')}` : ''

  const { rows: conteo } = await db.query(`select count(*)::int as total ${DESDE} ${donde}`, valores)
  const { rows } = await db.query(
    `select ${COLUMNAS} ${DESDE} ${donde}
      order by u.apellido, u.nombre, s.id
      limit ${agregar(tamanio)} offset ${agregar((pagina - 1) * tamanio)}`,
    valores
  )
  return { socios: rows, total: conteo[0].total }
}

// Detalle: suma correo, teléfono, la categoría y los puntos de cada disciplina y las últimas cuotas.
// Si el jugador nunca jugó en una disciplina, figura en la categoría inicial con 0 puntos.
export const buscarSocioDetalle = async (id, db = pool) => {
  const { rows } = await db.query(
    `select ${COLUMNAS}, u.email, u.telefono ${DESDE} where s.id = $1`,
    [id]
  )
  const socio = rows[0]
  if (!socio) return null

  const categorias = {}
  for (const disciplina of DISCIPLINAS) {
    const { rows: [ranking] } = await db.query(
      'select puntos_totales as puntos from ranking_disciplina where jugador_id = $1 and disciplina = $2',
      [socio.jugadorId, disciplina]
    )
    const categoria = await categoriaDeJugador(socio.jugadorId, disciplina, db)
    categorias[disciplina] = categoria ? { id: categoria.id, nombre: categoria.nombre, puntos: ranking?.puntos ?? 0 } : null
  }

  const { rows: ultimasCuotas } = await db.query(
    `select id, mes, anio, monto, estado_pago as "estadoPago", fecha_vencimiento::text as "fechaVencimiento",
            fecha_pago as "fechaPago", ${SQL_CUOTA_VENCIDA} as vencida
       from cuota_mensual
      where socio_id = $1
      order by anio desc, mes desc
      limit 6`,
    [id]
  )
  return { ...socio, categorias, ultimasCuotas }
}
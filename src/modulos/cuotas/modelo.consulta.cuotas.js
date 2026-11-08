import { pool } from '../../config/conexion.bd.js'
import { sinTildes } from '../usuarios/modelo.consulta.usuarios.js'
import { SQL_CUOTA_VENCIDA } from './modelo.cuotas.js'

// Consulta de cuotas (CU 4.2 · paso 2, A2). Solo lectura. La condición de «vencida» es la misma que usa la situación de
// cuotas del socio (SQL_CUOTA_VENCIDA): compara con `current_date` de la base, que está en America/Argentina/Cordoba.

const CON_TILDES = 'áàäâéèëêíìïîóòöôúùüûñ'
const SIN_TILDES = 'aaaaeeeeiiiioooouuuun'
const columnaNormalizada = (expresion) => `translate(lower(${expresion}), '${CON_TILDES}', '${SIN_TILDES}')`
const escaparLike = (texto) => texto.replace(/[\\%_]/g, '\\$&')

const COLUMNAS = `c.id, c.socio_id as "socioId", u.nombre, u.apellido, j.dni, s.estado as "socioEstado",
       c.mes, c.anio, c.monto, c.estado_pago as "estadoPago", c.fecha_vencimiento::text as "fechaVencimiento",
       ${SQL_CUOTA_VENCIDA} as vencida, c.fecha_pago as "fechaPago", c.metodo_pago as "metodoPago"`

const DESDE = `from cuota_mensual c
       join socio s on s.id = c.socio_id
       join jugador j on j.id = s.jugador_id
       join usuario u on u.id = j.usuario_id`

// Filtros: mes, año, estado (PENDIENTE, PAGADO o ADEUDADO = pendientes ya vencidas) y búsqueda por nombre, apellido o DNI
// del socio, sin distinguir mayúsculas ni acentos (cada palabra tiene que aparecer en alguno de esos campos).
// Devuelve la página pedida, el `total` de cuotas del filtro y `totalPendiente`: la suma de los montos PENDIENTES de todo
// el filtro (no solo de la página). Los socios dados de baja siguen apareciendo con sus cuotas.
export const listarCuotas = async ({ mes, anio, estado, q, pagina, tamanio }, db = pool) => {
  const condiciones = []
  const valores = []
  const agregar = (valor) => {
    valores.push(valor)
    return `$${valores.length}`
  }

  if (mes) condiciones.push(`c.mes = ${agregar(mes)}`)
  if (anio) condiciones.push(`c.anio = ${agregar(anio)}`)
  if (estado === 'ADEUDADO') condiciones.push(SQL_CUOTA_VENCIDA)
  else if (estado) condiciones.push(`c.estado_pago = ${agregar(estado)}`)

  for (const palabra of sinTildes(q ?? '').split(/\s+/).filter(Boolean)) {
    const patron = agregar(`%${escaparLike(palabra)}%`)
    const soloDigitos = palabra.replace(/\./g, '')
    const porDni = soloDigitos ? ` or j.dni like ${agregar(`%${escaparLike(soloDigitos)}%`)}` : ''
    condiciones.push(
      `(${columnaNormalizada('u.nombre')} like ${patron}
        or ${columnaNormalizada('u.apellido')} like ${patron}${porDni})`
    )
  }

  const donde = condiciones.length > 0 ? `where ${condiciones.join(' and ')}` : ''
  // Las adeudadas, de la más antigua a la más reciente; el resto, del período más nuevo al más viejo
  const orden = estado === 'ADEUDADO'
    ? 'c.fecha_vencimiento, u.apellido, u.nombre, c.id'
    : 'c.anio desc, c.mes desc, u.apellido, u.nombre, c.id'

  const { rows: resumen } = await db.query(
    `select count(*)::int as total,
            coalesce(sum(c.monto) filter (where c.estado_pago = 'PENDIENTE'), 0)::numeric(14,2)::text as "totalPendiente"
       ${DESDE} ${donde}`,
    valores
  )
  const { rows } = await db.query(
    `select ${COLUMNAS} ${DESDE} ${donde}
      order by ${orden}
      limit ${agregar(tamanio)} offset ${agregar((pagina - 1) * tamanio)}`,
    valores
  )
  return { cuotas: rows, total: resumen[0].total, totalPendiente: resumen[0].totalPendiente }
}
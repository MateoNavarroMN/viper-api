import { pool } from '../../config/conexion.bd.js'
import { buscarSocioDeJugador } from '../socios/modelo.socios.js'
import { SQL_CUOTA_VENCIDA } from './modelo.cuotas.js'

// Cuotas del propio jugador (CU 4.2 · A3, solo lectura). Las usan «Mis cuotas» y «Mi actividad».
// Un jugador es socio mientras su socio esté ACTIVO; con la baja deja de ver cuotas.

const COLUMNAS = `id, mes, anio, monto, estado_pago as "estadoPago", fecha_vencimiento::text as "fechaVencimiento",
  ${SQL_CUOTA_VENCIDA} as vencida, fecha_pago as "fechaPago"`

// Todas las cuotas del socio, de la más reciente a la más antigua
const listarCuotasDeSocio = async (socioId, db = pool) => {
  const { rows } = await db.query(
    `select ${COLUMNAS} from cuota_mensual where socio_id = $1 order by anio desc, mes desc`,
    [socioId]
  )
  return rows
}

// { situacion, cuotas, pagoEnLinea } del jugador, o null si no es socio ACTIVO.
// situacion es ADEUDADO si tiene alguna cuota vencida (la misma condición que el listado de socios) y AL_DIA en cualquier otro caso.
// El pago en línea todavía no existe: se informa como no disponible.
export const obtenerMisCuotas = async (jugadorId, db = pool) => {
  const socio = await buscarSocioDeJugador(jugadorId, db)
  if (!socio || socio.estado !== 'ACTIVO') return null

  const cuotas = await listarCuotasDeSocio(socio.id, db)
  return {
    situacion: cuotas.some((c) => c.vencida) ? 'ADEUDADO' : 'AL_DIA',
    cuotas,
    pagoEnLinea: { disponible: false },
  }
}
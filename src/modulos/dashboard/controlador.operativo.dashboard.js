import { fechaDeHoy } from '../caja/modelo.caja.js'
import { esFechaValida } from '../caja/validaciones.caja.js'
import { vencerPendientes } from '../pagos/modelo.estado.pagos.js'
import { cajaDelDia, canchasDelDia } from './modelo.dashboard.js'

// GET /api/dashboard/caja  (Administrador)
// La caja de hoy: totales y últimos movimientos del día, si está abierta o cerrada y el último cierre (`ultimoCierre: null` si todavía no hubo).
export const caja = async (req, res) => {
  try {
    // Los cobros en línea sin actividad hace más de una hora se anulan: no figuran como pendientes
    await vencerPendientes()
    return res.status(200).json(await cajaDelDia())
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo obtener la caja del día' })
  }
}

// GET /api/dashboard/canchas?fecha=AAAA-MM-DD  (Administrador; sin fecha, hoy)
// Ocupación por cancha y deporte, reservas del día y reservas pendientes de pago con su plazo. Sin reservas: todo libre y ocupación en cero.
export const canchas = async (req, res) => {
  const { fecha } = req.query
  if (fecha !== undefined && !esFechaValida(fecha)) {
    return res.status(400).json({ mensaje: 'Parámetro inválido: la fecha debe tener el formato AAAA-MM-DD', campo: 'fecha' })
  }
  try {
    return res.status(200).json(await canchasDelDia(fecha ?? (await fechaDeHoy())))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudieron obtener las canchas del día' })
  }
}
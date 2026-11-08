import { buscarCuotaPorId, fechaDeHoy, registrarPagoCuota, situacionCuotasDelSocio } from './modelo.cuotas.js'

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/
const FECHA_MINIMA = '2020-01-01'
// En este alcance solo se registran pagos presenciales; Mercado Pago llega más adelante por otra vía
const MEDIOS = ['EFECTIVO', 'TRANSFERENCIA']

// «2026-02-30» tiene el formato correcto pero no existe: al armar la fecha se corre a marzo y no coincide
const esFechaReal = (texto) => {
  const fecha = new Date(`${texto}T00:00:00Z`)
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === texto
}

const invalido = (res, mensaje, campo) => res.status(400).json({ mensaje, campo })

// POST /api/cuotas/:id/pago  { metodoPago: 'EFECTIVO' | 'TRANSFERENCIA', fechaPago?: 'AAAA-MM-DD' }
// (CU 4.2 · A1, Recepcionista y Administrador). Sin fechaPago se toma el momento actual.
// El estado del socio pasa a «Al día» solo: se calcula a partir de sus cuotas vencidas.
export const registrarPago = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return res.status(404).json({ mensaje: 'Cuota no encontrada' })

  const { metodoPago, fechaPago } = req.body ?? {}
  if (!MEDIOS.includes(metodoPago)) return invalido(res, 'Medio de pago no válido', 'metodoPago')

  const conFecha = fechaPago !== undefined && fechaPago !== null && fechaPago !== ''
  if (conFecha && (typeof fechaPago !== 'string' || !REGEX_FECHA.test(fechaPago) || !esFechaReal(fechaPago) || fechaPago < FECHA_MINIMA)) {
    return invalido(res, 'La fecha de pago no es válida', 'fechaPago')
  }

  try {
    if (conFecha && fechaPago > (await fechaDeHoy())) return invalido(res, 'La fecha de pago no puede ser futura', 'fechaPago')

    const cuota = await buscarCuotaPorId(id)
    if (!cuota) return res.status(404).json({ mensaje: 'Cuota no encontrada' })
    if (cuota.estadoPago === 'PAGADO') return res.status(409).json({ mensaje: 'La cuota ya está pagada' })

    const pagada = await registrarPagoCuota(id, metodoPago, conFecha ? fechaPago : null, req.usuario.id)
    // Otra persona registró el pago entre la consulta y la actualización
    if (!pagada) return res.status(409).json({ mensaje: 'La cuota ya está pagada' })

    const situacionCuotas = await situacionCuotasDelSocio(pagada.socioId)
    return res.json({ mensaje: 'Pago registrado', cuota: pagada, situacionCuotas })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo registrar el pago' })
  }
}

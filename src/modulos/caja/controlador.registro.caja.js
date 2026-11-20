import { MENSAJE_CAJA_CERRADA } from './modelo.caja.js'
import { obtenerMovimiento } from './modelo.movimientos.caja.js'
import { registrarMovimientoManual } from './modelo.registro.caja.js'

const CONCEPTOS_EGRESO = ['PROVEEDOR', 'SERVICIOS', 'OTRO']
const CONCEPTOS_COBRO = ['RESERVA', 'INSCRIPCION', 'CUOTA']
const METODOS = ['EFECTIVO', 'TRANSFERENCIA']
const DESCRIPCION_MAXIMA = 200
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const invalido = (res, mensaje, campo) => res.status(400).json({ mensaje, campo })

// Monto como número o texto con punto o coma («1500», «1500.5», «1500,50»), mayor a cero y con hasta dos decimales
const leerMonto = (valor) => {
  if (typeof valor === 'number') return Number.isFinite(valor) && Math.round(valor * 100) / 100 === valor && valor > 0 && valor < 1e10 ? valor : null
  if (typeof valor !== 'string' || !/^\d{1,10}([.,]\d{1,2})?$/.test(valor.trim())) return null
  const numero = Number(valor.trim().replace(',', '.'))
  return numero > 0 ? numero : null
}

// Cada motivo por el que un cobro no prospera: estado HTTP, mensaje y el campo del formulario al que apunta
const RECHAZOS = {
  RESERVA: {
    NO_ENCONTRADO: [404, 'La reserva no existe'],
    NO_COBRABLE: [409, 'Esta reserva no se cobra desde la caja'],
    SIN_MONTO: [409, 'La reserva no tiene un importe para cobrar'],
    YA_PAGADO: [409, 'La reserva ya fue pagada'],
    VENCIDO: [409, 'El plazo de pago de la reserva venció'],
    CANCELADO: [409, 'La reserva fue cancelada'],
  },
  INSCRIPCION: {
    NO_ENCONTRADO: [404, 'La inscripción no existe'],
    SIN_MONTO: [409, 'La inscripción no tiene un importe para cobrar'],
    YA_PAGADO: [409, 'La inscripción ya fue pagada'],
    VENCIDO: [409, 'La inscripción está anulada: su plazo de pago venció'],
  },
  CUOTA: {
    NO_ENCONTRADO: [404, 'La cuota no existe'],
    YA_PAGADO: [409, 'La cuota ya fue pagada'],
  },
}

// POST /api/caja/movimientos  (Recepcionista y Administrador). Dos formas:
//  · Egreso:  { tipo: 'EGRESO', concepto: 'PROVEEDOR' | 'SERVICIOS' | 'OTRO', monto, metodoPago, descripcion }
//  · Cobro:   { tipo: 'INGRESO', concepto: 'RESERVA' | 'INSCRIPCION' | 'CUOTA', origenId, metodoPago, descripcion? }
// metodoPago: 'EFECTIVO' | 'TRANSFERENCIA'. En un cobro el monto y el cliente salen del origen (si se manda un monto, se ignora).
// Responde 201 con { mensaje, movimiento } (el mismo movimiento que devuelve el detalle) y, en una cuota, la situación del socio.
export const registrar = async (req, res) => {
  const { tipo, concepto, metodoPago, descripcion, monto, origenId } = req.body ?? {}

  if (tipo !== 'INGRESO' && tipo !== 'EGRESO') return invalido(res, 'El tipo de movimiento debe ser INGRESO o EGRESO', 'tipo')
  const conceptos = tipo === 'EGRESO' ? CONCEPTOS_EGRESO : CONCEPTOS_COBRO
  if (!conceptos.includes(concepto)) {
    return invalido(res, tipo === 'EGRESO' ? 'Un egreso es por Proveedor, Servicios u Otro' : 'Un cobro es de una Reserva, una Inscripción o una Cuota', 'concepto')
  }
  if (!METODOS.includes(metodoPago)) return invalido(res, 'Elegí el medio de pago: efectivo o transferencia', 'metodoPago')

  let texto
  if (descripcion !== undefined && descripcion !== null && descripcion !== '') {
    if (typeof descripcion !== 'string') return invalido(res, 'La descripción no es válida', 'descripcion')
    texto = descripcion.trim()
    if (texto.length > DESCRIPCION_MAXIMA) return invalido(res, `La descripción no puede superar los ${DESCRIPCION_MAXIMA} caracteres`, 'descripcion')
  }

  const datos = { tipo, concepto, metodoPago, operadorId: req.usuario.id, descripcion: texto || undefined }
  if (tipo === 'EGRESO') {
    if (!datos.descripcion) return invalido(res, 'Ingresá una descripción del movimiento', 'descripcion')
    datos.monto = leerMonto(monto)
    if (datos.monto === null) return invalido(res, 'El monto tiene que ser un número mayor a cero, con hasta dos decimales', 'monto')
  } else {
    if (typeof origenId !== 'string' || !REGEX_UUID.test(origenId)) return invalido(res, 'Elegí qué se está cobrando', 'origenId')
    datos.origenId = origenId.toLowerCase()
  }

  try {
    const r = await registrarMovimientoManual(datos)
    if (r.resultado === 'CAJA_CERRADA') return res.status(409).json({ mensaje: MENSAJE_CAJA_CERRADA })
    if (r.resultado !== 'OK') {
      const [estado, mensaje] = RECHAZOS[concepto][r.resultado] ?? [409, 'No se pudo cobrar este origen']
      return res.status(estado).json({ mensaje, campo: 'origenId', estadoOrigen: r.estadoOrigen })
    }
    const respuesta = { mensaje: 'Movimiento registrado correctamente', movimiento: await obtenerMovimiento(r.id) }
    if (r.situacionCuotas) respuesta.situacionCuotas = r.situacionCuotas
    return res.status(201).json(respuesta)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo registrar el movimiento. No se guardó ningún cambio' })
  }
}
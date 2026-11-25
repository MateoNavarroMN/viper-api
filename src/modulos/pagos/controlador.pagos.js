import { crearOrden, esErrorMercadoPago } from './cliente.mercadopago.js'
import { leerLineas } from '../pos/lineas.pos.js'
import { anularIntento, guardarOrden, registrarIntentoDePago } from './modelo.pagos.js'

const CONCEPTOS = ['RESERVA', 'INSCRIPCION', 'CUOTA', 'TIENDA']
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MENSAJE_NO_SE_PUDO = 'No pudimos iniciar el pago. Probá de nuevo o pagá en recepción'

// POST /api/pagos/mercadopago
//  · Reserva, inscripción o cuota:  { concepto: 'RESERVA' | 'INSCRIPCION' | 'CUOTA', origenId }
//  · Venta de la tienda (solo Recepción y Administrador, cobro en el mostrador):  { concepto: 'TIENDA', lineas: [{ productoId, cantidad }] }
//    La venta queda pendiente sin tocar el stock: el stock se descuenta cuando el pago se acredita.
// Empieza un pago en línea con Mercado Pago. El Jugador paga solo lo suyo (lo ajeno responde como si no existiera); Recepción y
// Administrador pueden iniciarlo para cualquier cliente. Responde 201 { mensaje, transaccionId, urlPago }: el front lleva al
// jugador a `urlPago` para que pague en Mercado Pago. Nunca se guardan ni se piden datos de tarjeta.
//  · 400 concepto u origenId inválidos · 404 el origen no existe (o no es del jugador)
//  · 403 un Jugador quiso iniciar una venta de la tienda
//  · 409 ya pagado, vencido, cancelado o que no se paga en línea (con el motivo); en la tienda, productos sin stock (con `lineas`)
//  · 502 Mercado Pago no pudo crear la orden: el intento queda anulado
export const iniciar = async (req, res) => {
  const { concepto, origenId, lineas } = req.body ?? {}
  if (!CONCEPTOS.includes(concepto)) return res.status(400).json({ mensaje: 'Elegí qué querés pagar: reserva, inscripción, cuota o una venta de la tienda', campo: 'concepto' })

  let datos
  if (concepto === 'TIENDA') {
    if (req.usuario.rol === 'JUGADOR') return res.status(403).json({ mensaje: 'Las ventas de la tienda las cobra el personal del club' })
    const leidas = leerLineas(lineas)
    if (leidas.error) return res.status(400).json({ mensaje: leidas.error.mensaje, campo: 'lineas', ...(leidas.error.linea !== undefined && { linea: leidas.error.linea }) })
    datos = { concepto, lineas: leidas.lineas, operadorId: req.usuario.id }
  } else {
    if (typeof origenId !== 'string' || !REGEX_UUID.test(origenId)) return res.status(400).json({ mensaje: 'El pago que querés hacer no es válido', campo: 'origenId' })
    // Un Jugador solo puede pagar lo suyo; el personal, lo de cualquiera
    datos = { concepto, origenId, usuarioId: req.usuario.rol === 'JUGADOR' ? req.usuario.id : null }
  }

  let intento
  try {
    intento = await registrarIntentoDePago(datos)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo iniciar el pago' })
  }
  if (intento.resultado === 'NO_ENCONTRADO') return res.status(404).json({ mensaje: 'No encontramos lo que querés pagar', campo: 'origenId' })
  if (intento.resultado === 'RECHAZADO') return res.status(409).json({ mensaje: intento.mensaje, ...(intento.lineas && { campo: 'lineas', lineas: intento.lineas }) })

  try {
    const { ordenId, urlPago } = await crearOrden({
      transaccionId: intento.transaccionId,
      titulo: intento.titulo,
      monto: intento.monto,
      minutosDeVigencia: intento.minutosDeVigencia,
    })
    await guardarOrden(intento.transaccionId, ordenId)
    return res.status(201).json({ mensaje: 'Pago iniciado', transaccionId: intento.transaccionId, urlPago })
  } catch (error) {
    if (esErrorMercadoPago(error)) console.error(`Mercado Pago: ${error.message} · ${error.detalle ?? ''}`)
    else console.error(error)
    await anularIntento(intento.transaccionId).catch((e) => console.error(e))
    return res.status(502).json({ mensaje: MENSAJE_NO_SE_PUDO })
  }
}
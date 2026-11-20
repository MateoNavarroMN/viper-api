import { crearOrden, esErrorMercadoPago } from './cliente.mercadopago.js'
import { anularIntento, guardarOrden, registrarIntentoDePago } from './modelo.pagos.js'

const CONCEPTOS = ['RESERVA', 'INSCRIPCION', 'CUOTA']
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MENSAJE_NO_SE_PUDO = 'No pudimos iniciar el pago. Probá de nuevo o pagá en recepción'

// POST /api/pagos/mercadopago  { concepto: 'RESERVA' | 'INSCRIPCION' | 'CUOTA', origenId }
// Empieza un pago en línea con Mercado Pago. El Jugador paga solo lo suyo (lo ajeno responde como si no existiera); Recepción y
// Administrador pueden iniciarlo para cualquier cliente. Responde 201 { mensaje, transaccionId, urlPago }: el front lleva al
// jugador a `urlPago` para que pague en Mercado Pago. Nunca se guardan ni se piden datos de tarjeta.
//  · 400 concepto u origenId inválidos · 404 el origen no existe (o no es del jugador)
//  · 409 ya pagado, vencido, cancelado o que no se paga en línea (con el motivo)
//  · 502 Mercado Pago no pudo crear la orden: el intento queda anulado
export const iniciar = async (req, res) => {
  const { concepto, origenId } = req.body ?? {}
  if (!CONCEPTOS.includes(concepto)) return res.status(400).json({ mensaje: 'Elegí qué querés pagar: reserva, inscripción o cuota', campo: 'concepto' })
  if (typeof origenId !== 'string' || !REGEX_UUID.test(origenId)) return res.status(400).json({ mensaje: 'El pago que querés hacer no es válido', campo: 'origenId' })

  let intento
  try {
    // Un Jugador solo puede pagar lo suyo; el personal, lo de cualquiera
    const solo = req.usuario.rol === 'JUGADOR' ? req.usuario.id : null
    intento = await registrarIntentoDePago({ concepto, origenId, usuarioId: solo })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo iniciar el pago' })
  }
  if (intento.resultado === 'NO_ENCONTRADO') return res.status(404).json({ mensaje: 'No encontramos lo que querés pagar', campo: 'origenId' })
  if (intento.resultado === 'RECHAZADO') return res.status(409).json({ mensaje: intento.mensaje })

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
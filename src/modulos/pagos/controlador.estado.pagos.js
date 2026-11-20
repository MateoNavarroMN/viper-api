import { cancelarOrden, esErrorMercadoPago } from './cliente.mercadopago.js'
import { armarRespuesta, cancelarPendiente, conciliar, leerIntentoAcreditado, leerPago, vencerPendientes } from './modelo.estado.pagos.js'

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Busca el pago y comprueba que quien pregunta pueda verlo: el Jugador solo el suyo (lo ajeno responde como si no existiera);
// Recepción y Administrador, cualquiera. Responde por `res` y devuelve null si no corresponde seguir.
const buscar = async (req, res) => {
  const { transaccionId } = req.params
  if (!REGEX_UUID.test(transaccionId)) {
    res.status(400).json({ mensaje: 'El pago que consultás no es válido', campo: 'transaccionId' })
    return null
  }
  const pago = await leerPago(transaccionId)
  if (!pago || (req.usuario.rol === 'JUGADOR' && pago.clienteId !== req.usuario.id)) {
    res.status(404).json({ mensaje: 'No encontramos ese pago' })
    return null
  }
  return pago
}

// GET /api/pagos/:transaccionId  (dueño del pago, Recepcionista o Administrador)
// Estado del pago y de lo que se paga, para la pantalla de resultado. La página de retorno de Mercado Pago llama acá y no confía
// en lo que traiga la dirección: se puede consultar más tarde, desde otro dispositivo o tras volver sin conexión.
// Si el pago sigue pendiente se le pregunta a Mercado Pago (por si el aviso no llegó) y, pasada una hora sin actividad, se anula.
// Responde 200 { transaccionId, estado: PAGADO | PENDIENTE | RECHAZADO | CANCELADO | VENCIDO, mensaje, motivo, monto, medioDePago,
//                fecha, numeroOperacion, requiereDevolucion, origen: { tipo, id, estado, pagado }, puedeReintentar }
export const consultar = async (req, res) => {
  try {
    let pago = await buscar(req, res)
    if (!pago) return
    if (pago.estado === 'PENDIENTE' || pago.estado === 'ANULADO') {
      await conciliar(pago)
      if (pago.esViejo) await vencerPendientes(pago.id)
      pago = await leerPago(pago.id)
    }
    // Si se acreditó con otro intento de lo mismo, se informa como pagado (con los datos del pago que sí se acreditó)
    const acreditado = await leerIntentoAcreditado(pago)
    if (acreditado) return res.status(200).json({ ...(await armarRespuesta(acreditado)), transaccionId: pago.id })
    return res.status(200).json(await armarRespuesta(pago))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo consultar el pago' })
  }
}

// POST /api/pagos/:transaccionId/cancelar  (dueño del pago, Recepcionista o Administrador)
// La persona volvió de Mercado Pago sin pagar: se anula el pago pendiente para que no quede colgado.
//  · 200 { mensaje, ...estado }   se anuló (o ya estaba anulado o rechazado: repetirlo no hace daño)
//  · 409 el pago ya se acreditó: no se puede cancelar
// Antes de anular se consulta a Mercado Pago, por si el pago se acreditó y el aviso todavía no llegó.
export const cancelar = async (req, res) => {
  try {
    const pago = await buscar(req, res)
    if (!pago) return
    await conciliar(pago)
    const resultado = await cancelarPendiente(pago.id)
    if (resultado === 'YA_PAGADO' || (await leerIntentoAcreditado(await leerPago(pago.id)))) return res.status(409).json({ mensaje: 'El pago ya se acreditó, no se puede cancelar' })

    if (resultado === 'CANCELADO' && pago.ordenId) {
      // Se le avisa a Mercado Pago para que cierre la orden; si falla no importa
      await cancelarOrden(pago.ordenId).catch((error) => {
        if (esErrorMercadoPago(error)) console.error(`Mercado Pago: ${error.message} · ${error.detalle ?? ''}`)
      })
    }
    const actual = await leerPago(pago.id)
    return res.status(200).json({ mensaje: resultado === 'CANCELADO' ? 'Pago cancelado' : 'El pago ya no estaba pendiente', ...(await armarRespuesta(actual)) })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo cancelar el pago' })
  }
}
import { esErrorMercadoPago, obtenerOrden } from './cliente.mercadopago.js'
import { firmaValida } from './firma.mercadopago.js'
import { aplicarOrden, idDePago, registrarNotificacion } from './modelo.webhook.pagos.js'

const REGEX_ID_ORDEN = /^[A-Za-z0-9]{10,64}$/

// Anota el aviso sin que un fallo al anotar tape la respuesta a Mercado Pago
const anotar = async (datos) => {
  try {
    await registrarNotificacion(datos)
  } catch (error) {
    console.error('No se pudo registrar el aviso de Mercado Pago', error)
  }
}

// POST /api/pagos/mercadopago/webhook  (público: lo llama Mercado Pago, sin sesión de Viper)
// Aviso de que una orden cambió. Pasos:
//  1. valida la firma `x-signature` con MP_WEBHOOK_SECRET: si no es válida, 401 y no se hace nada más
//  2. NO confía en el cuerpo: con el id de la orden consulta la orden a Mercado Pago y de ahí saca estado, monto y referencia
//  3. actualiza el movimiento (ver aplicarOrden). Es idempotente: un aviso repetido no duplica nada
// Responde 200 cuando el aviso se atendió (aunque no haya hecho falta cambiar nada), y 500 si hubo un problema pasajero (por ejemplo, no se
// pudo consultar la orden): Mercado Pago reintenta los avisos que no reciben 200.
export const recibir = async (req, res) => {
  const dataId = req.query['data.id'] ?? req.query.data_id ?? req.body?.data?.id
  const tipo = req.query.type ?? req.body?.type
  const idTexto = typeof dataId === 'string' ? dataId : undefined
  const resumen = { tipo: tipo ?? null, accion: req.body?.action ?? null, ordenId: idTexto ?? null, enVivo: req.body?.live_mode ?? null }

  const valida = firmaValida({
    secreto: process.env.MP_WEBHOOK_SECRET,
    encabezadoFirma: req.get('x-signature'),
    requestId: req.get('x-request-id'),
    dataId: idTexto,
  })
  if (!valida) {
    console.warn('Aviso de Mercado Pago con firma inválida (o MP_WEBHOOK_SECRET sin configurar)')
    await anotar({ paymentId: idTexto, resumen, resultado: 'FIRMA_INVALIDA' })
    return res.status(401).json({ mensaje: 'Firma inválida' })
  }

  // Solo interesan los avisos de órdenes y con un id que parezca el de una orden
  if ((tipo && tipo !== 'order') || !idTexto || !REGEX_ID_ORDEN.test(idTexto)) {
    await anotar({ paymentId: idTexto, resumen, resultado: 'IGNORADA' })
    return res.status(200).json({ resultado: 'IGNORADA' })
  }

  try {
    let orden
    try {
      orden = await obtenerOrden(idTexto)
    } catch (error) {
      if (esErrorMercadoPago(error) && error.estado === 404) {
        await anotar({ paymentId: idTexto, resumen, resultado: 'NO_CORRESPONDE' })
        return res.status(200).json({ resultado: 'NO_CORRESPONDE' })
      }
      throw error
    }

    const resultado = await aplicarOrden(orden)
    await anotar({
      paymentId: idDePago(orden),
      resumen: { ...resumen, estadoOrden: orden.status, detalleOrden: orden.status_detail, referencia: orden.external_reference ?? null },
      resultado,
    })
    return res.status(200).json({ resultado })
  } catch (error) {
    if (esErrorMercadoPago(error)) console.error(`Mercado Pago: ${error.message} · ${error.detalle ?? ''}`)
    else console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo procesar el aviso' })
  }
}
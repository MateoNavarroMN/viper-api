// Cliente mínimo de la API de Orders de Mercado Pago (Checkout Pro). No usa el SDK: alcanza con una llamada HTTP.
// Variables de entorno (nunca en el repo):
//  · MP_ACCESS_TOKEN    credencial del vendedor (TEST-… en pruebas, APP_USR-… en producción)
//  · MP_BACK_URL_BASE   dirección pública del front a la que vuelve el jugador (por ejemplo https://viper.vercel.app)
//  · MP_API_URL         opcional: otra dirección de la API de Mercado Pago (por defecto la oficial)
const API_POR_DEFECTO = 'https://api.mercadopago.com'
const TIEMPO_MAXIMO_MS = 15000

// Error al hablar con Mercado Pago. `detalle` es solo para el registro del servidor: no se le muestra al usuario.
export class MercadoPagoError extends Error {
  constructor(mensaje, detalle) {
    super(mensaje)
    this.name = 'MercadoPagoError'
    this.detalle = detalle
  }
}
export const esErrorMercadoPago = (error) => error instanceof MercadoPagoError

// Pesos como texto con dos decimales: 8000 → '8000.00'
export const montoMercadoPago = (monto) => (Math.round(Number(monto) * 100) / 100).toFixed(2)

// Direcciones a las que vuelve el jugador al terminar de pagar. `ref` es el id de la transacción en Viper.
export const direccionesDeRetorno = (transaccionId) => {
  const base = (process.env.MP_BACK_URL_BASE ?? '').replace(/\/+$/, '')
  const aDonde = (estado) => `${base}/portal/pago/resultado?estado=${estado}&ref=${transaccionId}`
  return { success_url: aDonde('aprobado'), failure_url: aDonde('rechazado'), pending_url: aDonde('pendiente') }
}

// Crea una orden de pago de Checkout Pro y devuelve { ordenId, urlPago }.
//  · transaccionId: id de la transacción en Viper; viaja como `external_reference` y como clave de idempotencia (reintentar el mismo
//    pedido no genera una orden nueva)
//  · titulo / monto: lo que se cobra (un solo ítem)
//  · minutosDeVigencia: pasado ese tiempo la orden vence sola en Mercado Pago
export const crearOrden = async ({ transaccionId, titulo, monto, minutosDeVigencia = 60 }) => {
  const token = process.env.MP_ACCESS_TOKEN
  if (!token) throw new MercadoPagoError('Mercado Pago no está configurado', 'Falta MP_ACCESS_TOKEN')
  if (!process.env.MP_BACK_URL_BASE) throw new MercadoPagoError('Mercado Pago no está configurado', 'Falta MP_BACK_URL_BASE')

  const total = montoMercadoPago(monto)
  const cuerpo = {
    type: 'online',
    processing_mode: 'manual',
    total_amount: total,
    external_reference: transaccionId,
    description: titulo.slice(0, 200),
    expiration_time: `PT${minutosDeVigencia}M`,
    items: [{ title: titulo.slice(0, 100), unit_price: total, quantity: 1 }],
    config: { online: { ...direccionesDeRetorno(transaccionId), auto_return: 'approved' } },
  }

  let respuesta
  try {
    respuesta = await fetch(`${process.env.MP_API_URL ?? API_POR_DEFECTO}/v1/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Idempotency-Key': transaccionId,
      },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    })
  } catch (error) {
    throw new MercadoPagoError('No se pudo conectar con Mercado Pago', error.message)
  }

  const datos = await respuesta.json().catch(() => null)
  if (!respuesta.ok) throw new MercadoPagoError('Mercado Pago rechazó la orden', `HTTP ${respuesta.status} ${JSON.stringify(datos)}`)
  if (!datos?.id || !datos?.checkout_url) throw new MercadoPagoError('Mercado Pago respondió sin dirección de pago', JSON.stringify(datos))
  return { ordenId: datos.id, urlPago: datos.checkout_url }
}
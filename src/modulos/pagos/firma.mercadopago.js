import { createHmac, timingSafeEqual } from 'node:crypto'

// Validación de la firma de los avisos (webhooks) de Mercado Pago. Cada aviso trae:
//  · el encabezado `x-signature`: «ts=<momento>,v1=<firma>»
//  · el encabezado `x-request-id`
//  · el id de la orden en el parámetro `data.id` de la dirección
// La firma es el HMAC-SHA256 (en hexadecimal) de «id:<data.id>;request-id:<x-request-id>;ts:<ts>;» con la clave secreta que Mercado Pago
// muestra al configurar el webhook (MP_WEBHOOK_SECRET). Si el id es alfanumérico se usa en minúsculas. Un dato que no vino se omite del texto.
export const firmaValida = ({ secreto, encabezadoFirma, requestId, dataId }) => {
  if (!secreto || !encabezadoFirma) return false

  const partes = {}
  for (const parte of String(encabezadoFirma).split(',')) {
    const i = parte.indexOf('=')
    if (i > 0) partes[parte.slice(0, i).trim()] = parte.slice(i + 1).trim()
  }
  const { ts, v1 } = partes
  if (!ts || !v1) return false

  const id = typeof dataId === 'string' && /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId
  let texto = ''
  if (id) texto += `id:${id};`
  if (requestId) texto += `request-id:${requestId};`
  texto += `ts:${ts};`

  const esperada = createHmac('sha256', secreto).update(texto).digest('hex')
  const recibida = Buffer.from(v1, 'utf8')
  const calculada = Buffer.from(esperada, 'utf8')
  return recibida.length === calculada.length && timingSafeEqual(recibida, calculada)
}
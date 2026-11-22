import { esFechaValida } from '../caja/validaciones.caja.js'
import { RUBROS, validarFiltros } from '../reportes/modelo.reportes.js'
import { alertasDelPanel, detalleDeAlerta, gestionarDevolucion } from './modelo.alertas.dashboard.js'
import { movimientosDeUnRubro } from './modelo.rubros.dashboard.js'

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TAMANIO_POR_DEFECTO = 20
const TAMANIO_MAXIMO = 100

// Entero positivo escrito solo con dígitos; si no viene, usa el valor por defecto; si viene mal, null
const entero = (valor, porDefecto) => {
  if (valor === undefined) return porDefecto
  return typeof valor === 'string' && /^\d{1,6}$/.test(valor) && Number(valor) >= 1 ? Number(valor) : null
}

// GET /api/dashboard/alertas  (Administrador)
// Lo que requiere atención: cajas de jornadas anteriores sin cerrar o descuadradas, reservas e inscripciones pendientes por vencer,
// socios con cuotas vencidas, productos sin stock y pagos en línea para devolver. Cada alerta trae `cantidad` y el `destino`
// (pantalla de gestión donde se atiende). Sin alertas: lista vacía, `sinAlertas: true` y un mensaje.
export const alertas = async (req, res) => {
  try {
    return res.status(200).json(await alertasDelPanel())
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudieron obtener las alertas' })
  }
}

// GET /api/dashboard/alertas/:tipo  (Administrador)
// Los elementos afectados por una alerta, cada uno con su pantalla de gestión. 404 si el tipo de alerta no existe.
export const alertaPorTipo = async (req, res) => {
  try {
    const detalle = await detalleDeAlerta(req.params.tipo)
    if (!detalle) return res.status(404).json({ mensaje: 'El tipo de alerta no existe' })
    return res.status(200).json(detalle)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo obtener el detalle de la alerta' })
  }
}

// POST /api/dashboard/devoluciones/:id/gestionar  (Administrador)
// Marca como gestionada la devolución de un pago en línea: deja de figurar entre las alertas.
//  404 el pago no existe · 409 no tenía devolución pendiente o ya estaba gestionada
export const gestionar = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return res.status(404).json({ mensaje: 'El pago no existe' })
  try {
    const resultado = await gestionarDevolucion(id)
    if (resultado === 'NO_EXISTE') return res.status(404).json({ mensaje: 'El pago no existe' })
    if (resultado === 'NO_REQUIERE') return res.status(409).json({ mensaje: 'Ese pago no tiene una devolución pendiente' })
    if (resultado === 'YA_GESTIONADA') return res.status(409).json({ mensaje: 'Esa devolución ya figura como gestionada' })
    return res.status(200).json({ mensaje: 'La devolución quedó marcada como gestionada' })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo marcar la devolución como gestionada' })
  }
}

// GET /api/dashboard/rubros/:rubro/movimientos?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&pagina=&tamanio=  (Administrador)
// Movimientos aprobados del rubro en el período (sin fechas: el mes actual): fecha y hora, concepto, descripción, monto, medio de pago y operador.
// Responde { rubro, desde, hasta, movimientos, total, totales, pagina, tamanio, totalPaginas, sinMovimientos }. Un rubro sin movimientos devuelve lista vacía.
//  404 el rubro no existe · 400 fecha o paginado inválido
export const movimientosDelRubro = async (req, res) => {
  const { rubro } = req.params
  if (!RUBROS.includes(rubro)) return res.status(404).json({ mensaje: 'El rubro no existe' })
  try {
    const filtros = await validarFiltros({ desde: req.query.desde, hasta: req.query.hasta }, esFechaValida)
    if (filtros.error) return res.status(400).json(filtros.error)
    const pagina = entero(req.query.pagina, 1)
    if (pagina === null) return res.status(400).json({ mensaje: 'Parámetro inválido: la página debe ser un número desde 1', campo: 'pagina' })
    const tamanio = entero(req.query.tamanio, TAMANIO_POR_DEFECTO)
    if (tamanio === null || tamanio > TAMANIO_MAXIMO) {
      return res.status(400).json({ mensaje: `Parámetro inválido: el tamaño debe estar entre 1 y ${TAMANIO_MAXIMO}`, campo: 'tamanio' })
    }
    const r = await movimientosDeUnRubro(rubro, filtros.desde, filtros.hasta, pagina, tamanio)
    return res.status(200).json({
      rubro,
      desde: filtros.desde,
      hasta: filtros.hasta,
      ...r,
      pagina,
      tamanio,
      totalPaginas: Math.max(1, Math.ceil(r.total / tamanio)),
      sinMovimientos: r.total === 0,
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudieron obtener los movimientos del rubro' })
  }
}
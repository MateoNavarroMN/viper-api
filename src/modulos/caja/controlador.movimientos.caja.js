import { cajaCerrada, fechaDeHoy } from './modelo.caja.js'
import { listarMovimientos, obtenerMovimiento } from './modelo.movimientos.caja.js'
import { esFechaValida } from './validaciones.caja.js'

const TIPOS = ['INGRESO', 'EGRESO']
const CONCEPTOS = ['TIENDA', 'RESERVA', 'INSCRIPCION', 'CUOTA', 'PROVEEDOR', 'SERVICIOS', 'OTRO']
const METODOS = ['EFECTIVO', 'TRANSFERENCIA', 'MERCADO_PAGO']
const ESTADOS = ['PENDIENTE', 'APROBADO', 'RECHAZADO', 'ANULADO']
const TAMANIO_POR_DEFECTO = 20
const TAMANIO_MAXIMO = 100
const DIAS_MAXIMOS = 366
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const invalido = (res, mensaje, campo) => res.status(400).json({ mensaje: `Parámetro inválido: ${mensaje}`, campo })

// Entero positivo escrito solo con dígitos; si no viene, usa el valor por defecto; si viene mal, null
const entero = (valor, porDefecto) => {
  if (valor === undefined) return porDefecto
  return typeof valor === 'string' && /^\d{1,6}$/.test(valor) && Number(valor) >= 1 ? Number(valor) : null
}

const diasEntre = (desde, hasta) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000)

// GET /api/caja/movimientos?fecha=&desde=&hasta=&tipo=&concepto=&metodo=&estado=&pagina=&tamanio=  (Recepcionista y Administrador)
// Sin fechas devuelve los movimientos de hoy. `fecha` es un solo día; `desde` y `hasta` van juntos (un rango de hasta 366 días).
// Responde { movimientos, total, totales: { ingresos, egresos, saldo }, desde, hasta, hoy, cajaCerrada, pagina, tamanio, totalPaginas }.
// Los totales solo suman los movimientos APROBADOS que coinciden con los filtros. Sin coincidencias: lista vacía y totales en cero.
export const listar = async (req, res) => {
  const { fecha, desde, hasta, tipo, concepto, metodo, estado } = req.query
  for (const [campo, valor] of [['fecha', fecha], ['desde', desde], ['hasta', hasta]]) {
    if (valor !== undefined && !esFechaValida(valor)) return invalido(res, `${campo} debe tener el formato AAAA-MM-DD`, campo)
  }
  if (fecha !== undefined && (desde !== undefined || hasta !== undefined)) return invalido(res, 'usá fecha, o bien desde y hasta, pero no las dos cosas', 'fecha')
  if ((desde === undefined) !== (hasta === undefined)) return invalido(res, 'desde y hasta se piden juntos', desde === undefined ? 'desde' : 'hasta')
  if (desde !== undefined && desde > hasta) return invalido(res, 'desde no puede ser posterior a hasta', 'desde')
  if (desde !== undefined && diasEntre(desde, hasta) >= DIAS_MAXIMOS) return invalido(res, `el rango no puede superar ${DIAS_MAXIMOS} días`, 'hasta')
  if (tipo !== undefined && !TIPOS.includes(tipo)) return invalido(res, 'el tipo debe ser INGRESO o EGRESO', 'tipo')
  if (concepto !== undefined && !CONCEPTOS.includes(concepto)) return invalido(res, `el concepto debe ser ${CONCEPTOS.join(', ')}`, 'concepto')
  if (metodo !== undefined && !METODOS.includes(metodo)) return invalido(res, `el medio de pago debe ser ${METODOS.join(', ')}`, 'metodo')
  if (estado !== undefined && !ESTADOS.includes(estado)) return invalido(res, `el estado debe ser ${ESTADOS.join(', ')}`, 'estado')
  const pagina = entero(req.query.pagina, 1)
  if (pagina === null) return invalido(res, 'la página debe ser un número desde 1', 'pagina')
  const tamanio = entero(req.query.tamanio, TAMANIO_POR_DEFECTO)
  if (tamanio === null || tamanio > TAMANIO_MAXIMO) return invalido(res, `el tamaño debe estar entre 1 y ${TAMANIO_MAXIMO}`, 'tamanio')

  try {
    const hoy = await fechaDeHoy()
    const primero = desde ?? fecha ?? hoy
    const ultimo = hasta ?? fecha ?? hoy
    const r = await listarMovimientos({ desde: primero, hasta: ultimo, tipo, concepto, metodo, estado, pagina, tamanio })
    return res.status(200).json({
      ...r,
      desde: primero,
      hasta: ultimo,
      hoy,
      cajaCerrada: primero === ultimo ? await cajaCerrada(primero) : null,
      pagina,
      tamanio,
      totalPaginas: Math.max(1, Math.ceil(r.total / tamanio)),
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudieron obtener los movimientos de caja' })
  }
}

// GET /api/caja/movimientos/:id  (Recepcionista y Administrador): detalle con cliente, origen y, en una venta, los productos
export const detalle = async (req, res) => {
  const { id } = req.params
  const NO_ENCONTRADO = { mensaje: 'Movimiento no encontrado' }
  if (!REGEX_UUID.test(id)) return res.status(404).json(NO_ENCONTRADO)
  try {
    const movimiento = await obtenerMovimiento(id)
    if (!movimiento) return res.status(404).json(NO_ENCONTRADO)
    return res.status(200).json({ movimiento })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo obtener el movimiento' })
  }
}
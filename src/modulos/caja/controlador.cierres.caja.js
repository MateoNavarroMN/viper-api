import { fechaDeHoy } from './modelo.caja.js'
import { ejecutarCierre, esCierreRechazado, listarCierres, obtenerCierre } from './modelo.cierres.caja.js'
import { esFechaValida } from './validaciones.caja.js'
import { vencerPendientes } from '../pagos/modelo.estado.pagos.js'

const ESTADOS = ['CUADRADO', 'DESCUADRADO']
const TAMANIO_POR_DEFECTO = 20
const TAMANIO_MAXIMO = 100
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MONTO_MAXIMO = 9999999999.99 // numeric(12,2)

const invalido = (res, mensaje, campo) => res.status(400).json({ mensaje: `Parámetro inválido: ${mensaje}`, campo })

const entero = (valor, porDefecto) => {
  if (valor === undefined) return porDefecto
  return typeof valor === 'string' && /^\d{1,6}$/.test(valor) && Number(valor) >= 1 ? Number(valor) : null
}

// Monto en pesos: número o texto («1500», «1.500,50» no; «1500,5» y «1500.50» sí), mayor o igual a 0 y con hasta 2 decimales.
// Devuelve el número, o null si no es un monto válido (el 0 es válido: la caja puede haberse quedado sin efectivo).
const aMonto = (valor) => {
  let numero = null
  if (typeof valor === 'number') numero = valor
  else if (typeof valor === 'string' && /^\d+([.,]\d{1,2})?$/.test(valor.trim())) numero = Number(valor.trim().replace(',', '.'))
  if (numero === null || !Number.isFinite(numero) || numero < 0 || numero > MONTO_MAXIMO) return null
  return Math.abs(Math.round(numero * 100) - numero * 100) < 1e-6 ? numero : null
}

// POST /api/caja/cierre  { fecha?, efectivoDeclarado }  (Recepcionista y Administrador)
// Cierra la caja de la jornada (por defecto la de hoy). El servidor recalcula todo y no confía en lo que mostró la pantalla.
//  201 { mensaje, cierre, resumen, movimientosCerrados }   (CUADRADO o DESCUADRADO; descuadrado también se puede cerrar)
//  400 monto declarado inválido / fecha inválida o futura
//  409 { codigo: 'YA_CERRADA' | 'SIN_MOVIMIENTOS' | 'COBROS_PENDIENTES', mensaje, pendientes? }
export const cerrar = async (req, res) => {
  const { fecha, efectivoDeclarado } = req.body ?? {}
  const monto = aMonto(efectivoDeclarado)
  if (monto === null) return res.status(400).json({ mensaje: 'Ingresá un monto válido', campo: 'efectivoDeclarado' })
  if (fecha !== undefined && fecha !== null && fecha !== '' && !esFechaValida(fecha)) {
    return res.status(400).json({ mensaje: 'La fecha debe tener el formato AAAA-MM-DD', campo: 'fecha' })
  }

  try {
    const hoy = await fechaDeHoy()
    const dia = fecha || hoy
    if (dia > hoy) return res.status(400).json({ mensaje: 'La fecha de la jornada no puede ser futura', campo: 'fecha' })

    // Los cobros en línea sin actividad hace más de una hora se anulan para que no frenen el cierre
    await vencerPendientes()

    const r = await ejecutarCierre({ fecha: dia, efectivoDeclarado: monto, responsableId: req.usuario.id })
    return res.status(201).json({ mensaje: 'Caja cerrada', ...r })
  } catch (error) {
    if (esCierreRechazado(error)) return res.status(409).json({ codigo: error.codigo, mensaje: error.message, ...error.datos })
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo cerrar la caja' })
  }
}

// GET /api/caja/cierres?desde=&hasta=&estado=&pagina=&tamanio=  (Recepcionista y Administrador)
// Historial de cierres, del más reciente al más antiguo. Responde { cierres, total, pagina, tamanio, totalPaginas }.
export const historial = async (req, res) => {
  const { desde, hasta, estado } = req.query
  for (const [campo, valor] of [['desde', desde], ['hasta', hasta]]) {
    if (valor !== undefined && !esFechaValida(valor)) return invalido(res, `${campo} debe tener el formato AAAA-MM-DD`, campo)
  }
  if (desde !== undefined && hasta !== undefined && desde > hasta) return invalido(res, 'desde no puede ser posterior a hasta', 'desde')
  if (estado !== undefined && !ESTADOS.includes(estado)) return invalido(res, 'el estado debe ser CUADRADO o DESCUADRADO', 'estado')
  const pagina = entero(req.query.pagina, 1)
  if (pagina === null) return invalido(res, 'la página debe ser un número desde 1', 'pagina')
  const tamanio = entero(req.query.tamanio, TAMANIO_POR_DEFECTO)
  if (tamanio === null || tamanio > TAMANIO_MAXIMO) return invalido(res, `el tamaño debe estar entre 1 y ${TAMANIO_MAXIMO}`, 'tamanio')

  try {
    const r = await listarCierres({ desde, hasta, estado, pagina, tamanio })
    return res.status(200).json({ ...r, pagina, tamanio, totalPaginas: Math.max(1, Math.ceil(r.total / tamanio)) })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudieron obtener los cierres de caja' })
  }
}

// GET /api/caja/cierres/:id  (Recepcionista y Administrador)
// Un cierre con el resumen de su jornada y los movimientos que cerró: { cierre, resumen, movimientos }.
export const detalleCierre = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return res.status(404).json({ mensaje: 'Cierre no encontrado' })
  try {
    const r = await obtenerCierre(id)
    if (!r) return res.status(404).json({ mensaje: 'Cierre no encontrado' })
    return res.status(200).json(r)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo obtener el cierre' })
  }
}
import { listarCuotas } from './modelo.consulta.cuotas.js'

const ESTADOS = ['PENDIENTE', 'PAGADO', 'ADEUDADO']
const TAMANIO_POR_DEFECTO = 10
const TAMANIO_MAXIMO = 50
const LARGO_MAXIMO_BUSQUEDA = 100

// Un parámetro de query tiene que venir una sola vez y como texto (?q=a&q=b llega como arreglo)
const texto = (valor) => (typeof valor === 'string' ? valor.trim() : undefined)

// Entero escrito solo con dígitos dentro del rango; si no viene, usa el valor por defecto; si viene mal, null
const entero = (valor, porDefecto, minimo, maximo) => {
  if (valor === undefined) return porDefecto
  if (typeof valor !== 'string' || !/^\d{1,6}$/.test(valor)) return null
  const numero = Number(valor)
  return numero >= minimo && numero <= maximo ? numero : null
}

const invalido = (res, mensaje, campo) => res.status(400).json({ mensaje: `Parámetro inválido: ${mensaje}`, campo })

// GET /api/cuotas?mes=&anio=&estado=&q=&pagina=&tamanio=  (CU 4.2 · paso 2, A2; Recepcionista y Administrador)
// estado: PENDIENTE | PAGADO | ADEUDADO (las pendientes ya vencidas). Es una consulta de solo lectura.
export const listar = async (req, res) => {
  const { q, estado } = req.query
  if (q !== undefined && (texto(q) === undefined || texto(q).length > LARGO_MAXIMO_BUSQUEDA)) {
    return invalido(res, `la búsqueda puede tener hasta ${LARGO_MAXIMO_BUSQUEDA} caracteres`, 'q')
  }
  if (estado !== undefined && !ESTADOS.includes(estado)) return invalido(res, 'el estado no existe', 'estado')

  const mes = entero(req.query.mes, undefined, 1, 12)
  if (mes === null) return invalido(res, 'el mes debe estar entre 1 y 12', 'mes')
  const anio = entero(req.query.anio, undefined, 2020, 2100)
  if (anio === null) return invalido(res, 'el año debe estar entre 2020 y 2100', 'anio')
  const pagina = entero(req.query.pagina, 1, 1, 999999)
  if (pagina === null) return invalido(res, 'la página debe ser un número desde 1', 'pagina')
  const tamanio = entero(req.query.tamanio, TAMANIO_POR_DEFECTO, 1, TAMANIO_MAXIMO)
  if (tamanio === null) return invalido(res, `el tamaño debe estar entre 1 y ${TAMANIO_MAXIMO}`, 'tamanio')

  try {
    const { cuotas, total, totalPendiente } = await listarCuotas({ mes, anio, estado, q: texto(q), pagina, tamanio })
    // Sin resultados es una lista vacía, no un error
    return res.status(200).json({ cuotas, total, totalPendiente, pagina, tamanio, totalPaginas: Math.ceil(total / tamanio) })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo obtener el listado de cuotas' })
  }
}
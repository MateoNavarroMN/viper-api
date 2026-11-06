import { listarSocios, buscarSocioDetalle } from './modelo.consulta.socios.js'

const ESTADOS = ['ACTIVO', 'BAJA']
const SITUACIONES = ['AL_DIA', 'ADEUDADO']
const TAMANIO_POR_DEFECTO = 10
const TAMANIO_MAXIMO = 50
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Un parámetro de query tiene que venir una sola vez y como texto (?q=a&q=b llega como arreglo)
const texto = (valor) => (typeof valor === 'string' ? valor.trim() : undefined)

// Entero positivo escrito solo con dígitos; si no viene, usa el valor por defecto; si viene mal, null
const entero = (valor, porDefecto) => {
  if (valor === undefined) return porDefecto
  return typeof valor === 'string' && /^\d{1,6}$/.test(valor) && Number(valor) >= 1 ? Number(valor) : null
}

const invalido = (res, mensaje, campo) => res.status(400).json({ mensaje: `Parámetro inválido: ${mensaje}`, campo })

// GET /api/socios?q=&estado=&cuotas=&pagina=&tamanio=  (CU 4.1 · paso 2, A3; Recepcionista y Administrador)
export const listar = async (req, res) => {
  const { q, estado, cuotas } = req.query
  if (q !== undefined && texto(q) === undefined) return invalido(res, 'q', 'q')
  if (estado !== undefined && !ESTADOS.includes(estado)) return invalido(res, 'el estado no existe', 'estado')
  if (cuotas !== undefined && !SITUACIONES.includes(cuotas)) return invalido(res, 'la situación de cuotas no existe', 'cuotas')

  const pagina = entero(req.query.pagina, 1)
  if (pagina === null) return invalido(res, 'la página debe ser un número desde 1', 'pagina')
  const tamanio = entero(req.query.tamanio, TAMANIO_POR_DEFECTO)
  if (tamanio === null || tamanio > TAMANIO_MAXIMO) {
    return invalido(res, `el tamaño debe estar entre 1 y ${TAMANIO_MAXIMO}`, 'tamanio')
  }

  try {
    const { socios, total } = await listarSocios({ q: texto(q), estado, cuotas, pagina, tamanio })
    // A3: sin resultados es una lista vacía, no un error
    return res.status(200).json({ socios, total, pagina, tamanio, totalPaginas: Math.ceil(total / tamanio) })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo obtener el listado de socios' })
  }
}

// GET /api/socios/:id  (Recepcionista y Administrador)
export const obtener = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return res.status(404).json({ mensaje: 'Socio no encontrado' })

  try {
    const socio = await buscarSocioDetalle(id)
    if (!socio) return res.status(404).json({ mensaje: 'Socio no encontrado' })
    return res.status(200).json({ socio })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo obtener el socio' })
  }
}
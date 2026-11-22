import { validarComunicado } from './validaciones.comunicados.js'
import { buscarComunicado, crearComunicado, editarBorrador, listarComunicados, publicarBorrador, retirarComunicado } from './modelo.comunicados.js'

const ESTADOS = ['BORRADOR', 'PUBLICADO', 'RETIRADO']
const TAMANIO_POR_DEFECTO = 10
const TAMANIO_MAXIMO = 50
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NO_ENCONTRADO = { mensaje: 'Comunicado no encontrado' }
const SOLO_BORRADOR = { mensaje: 'Solo se puede editar un borrador. Retirá el comunicado y redactá uno nuevo' }

// Un parámetro de query tiene que venir una sola vez y como texto (?q=a&q=b llega como arreglo)
const texto = (valor) => (typeof valor === 'string' ? valor.trim() : undefined)

// Entero positivo escrito solo con dígitos; si no viene, usa el valor por defecto; si viene mal, null
const entero = (valor, porDefecto) => {
  if (valor === undefined) return porDefecto
  return typeof valor === 'string' && /^\d{1,6}$/.test(valor) && Number(valor) >= 1 ? Number(valor) : null
}

const invalido = (res, mensaje, campo) => res.status(400).json({ mensaje: `Parámetro inválido: ${mensaje}`, campo })

// GET /api/comunicados?q=&estado=&pagina=&tamanio=  (solo Administrador)
export const listar = async (req, res) => {
  const { q, estado } = req.query
  if (q !== undefined && texto(q) === undefined) return invalido(res, 'q', 'q')
  if (estado !== undefined && !ESTADOS.includes(estado)) return invalido(res, 'el estado no existe', 'estado')
  const pagina = entero(req.query.pagina, 1)
  if (pagina === null) return invalido(res, 'la página debe ser un número desde 1', 'pagina')
  const tamanio = entero(req.query.tamanio, TAMANIO_POR_DEFECTO)
  if (tamanio === null || tamanio > TAMANIO_MAXIMO) return invalido(res, `el tamaño debe estar entre 1 y ${TAMANIO_MAXIMO}`, 'tamanio')

  try {
    const { comunicados, total } = await listarComunicados({ q: texto(q), estado, pagina, tamanio })
    // Sin comunicados es una lista vacía, no un error
    return res.status(200).json({ comunicados, total, pagina, tamanio, totalPaginas: Math.ceil(total / tamanio) })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudieron obtener los comunicados' })
  }
}

// GET /api/comunicados/:id  (solo Administrador): con el mensaje completo
export const obtener = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return res.status(404).json(NO_ENCONTRADO)
  try {
    const comunicado = await buscarComunicado(id)
    return comunicado ? res.status(200).json({ comunicado }) : res.status(404).json(NO_ENCONTRADO)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo obtener el comunicado' })
  }
}

// POST /api/comunicados  { titulo, mensaje, alcance, accion: 'BORRADOR' | 'PUBLICAR' }
// El autor es el usuario de la sesión. Con 'BORRADOR' solo hace falta el título.
export const crear = async (req, res) => {
  const { error, datos } = validarComunicado(req.body)
  if (error) return res.status(400).json(error)
  try {
    const comunicado = await crearComunicado(datos, req.usuario.id)
    return res.status(201).json({
      mensaje: datos.accion === 'PUBLICAR' ? 'Comunicado publicado' : 'Borrador guardado',
      comunicado,
    })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ mensaje: 'No se pudo guardar el comunicado' })
  }
}

// PUT /api/comunicados/:id  { titulo, mensaje, alcance, accion }  (solo un borrador)
export const editar = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return res.status(404).json(NO_ENCONTRADO)
  const { error, datos } = validarComunicado(req.body)
  if (error) return res.status(400).json(error)
  try {
    const r = await editarBorrador(id, datos)
    if (r.resultado === 'NO_ENCONTRADO') return res.status(404).json(NO_ENCONTRADO)
    if (r.resultado === 'NO_ES_BORRADOR') return res.status(409).json(SOLO_BORRADOR)
    return res.status(200).json({
      mensaje: datos.accion === 'PUBLICAR' ? 'Comunicado publicado' : 'Borrador guardado',
      comunicado: r.comunicado,
    })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ mensaje: 'No se pudo guardar el comunicado' })
  }
}

// POST /api/comunicados/:id/publicar  (publica un borrador ya guardado)
export const publicar = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return res.status(404).json(NO_ENCONTRADO)
  try {
    const r = await publicarBorrador(id)
    if (r.resultado === 'NO_ENCONTRADO') return res.status(404).json(NO_ENCONTRADO)
    if (r.resultado === 'NO_ES_BORRADOR') return res.status(409).json({ mensaje: 'Solo se puede publicar un borrador' })
    if (r.resultado === 'SIN_MENSAJE') {
      return res.status(400).json({ mensaje: 'Datos inválidos: el mensaje es obligatorio para publicar', campo: 'mensaje' })
    }
    return res.status(200).json({ mensaje: 'Comunicado publicado', comunicado: r.comunicado })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ mensaje: 'No se pudo publicar el comunicado' })
  }
}

// POST /api/comunicados/:id/retirar  (solo uno publicado)
export const retirar = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return res.status(404).json(NO_ENCONTRADO)
  try {
    const r = await retirarComunicado(id)
    if (r.resultado === 'NO_ENCONTRADO') return res.status(404).json(NO_ENCONTRADO)
    if (r.resultado === 'NO_ESTA_PUBLICADO') return res.status(409).json({ mensaje: 'Solo se puede retirar un comunicado publicado' })
    return res.status(200).json({ mensaje: 'Comunicado retirado. Deja de mostrarse en el portal', comunicado: r.comunicado })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ mensaje: 'No se pudo retirar el comunicado' })
  }
}
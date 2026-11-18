import { actualizarCancha, crearCancha, disponibilidadDelDia, listarTodasLasCanchas, obtenerCanchaConReservas } from './modelo.canchas.js'
import { validarCancha } from './validaciones.canchas.js'

const DISCIPLINAS = ['TENIS', 'PADEL']

const esFecha = (valor) => {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const fecha = new Date(`${valor}T00:00:00Z`)
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor
}

// GET /api/canchas/disponibilidad?disciplina=TENIS&fecha=2026-11-07
export const disponibilidad = async (req, res) => {
  const { disciplina, fecha } = req.query
  if (!DISCIPLINAS.includes(disciplina)) {
    return res.status(400).json({ mensaje: 'La disciplina debe ser TENIS o PADEL', campo: 'disciplina' })
  }
  if (!esFecha(fecha)) {
    return res.status(400).json({ mensaje: 'La fecha debe tener el formato AAAA-MM-DD', campo: 'fecha' })
  }

  try {
    return res.status(200).json(await disponibilidadDelDia(disciplina, fecha, req.usuario.rol))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo obtener la disponibilidad de las canchas' })
  }
}

// GET /api/canchas (solo Administrador): todas las canchas con sus reservas futuras
export const listar = async (req, res) => {
  try {
    return res.status(200).json({ canchas: await listarTodasLasCanchas() })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudieron obtener las canchas' })
  }
}

const NOMBRE_REPETIDO = { mensaje: 'Ya existe otra cancha con ese nombre', campo: 'nombre' }

// POST /api/canchas  { nombre, deporte, tipoSuperficie, precioHora }
// Registra una cancha activa: aparece en la grilla de disponibilidad con sus franjas libres. Un precio en cero se acepta.
export const crear = async (req, res) => {
  const { error, datos } = validarCancha(req.body, { completo: true })
  if (error) return res.status(400).json(error)

  try {
    const r = await crearCancha(datos)
    if (r.resultado === 'NOMBRE_REPETIDO') return res.status(409).json(NOMBRE_REPETIDO)
    return res.status(201).json({ mensaje: 'Cancha registrada correctamente', cancha: r.cancha })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ mensaje: 'No se pudo registrar la cancha' })
  }
}

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NO_ENCONTRADA = { mensaje: 'Cancha no encontrada' }

// GET /api/canchas/:id  → la cancha con sus reservas futuras (precarga el formulario y arma el «Resumen del cambio»)
export const obtener = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return res.status(404).json(NO_ENCONTRADA)
  try {
    const cancha = await obtenerCanchaConReservas(id)
    return cancha ? res.status(200).json({ cancha }) : res.status(404).json(NO_ENCONTRADA)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo obtener la cancha' })
  }
}

// PATCH /api/canchas/:id  { nombre?, tipoSuperficie?, precioHora? }
// El deporte y el estado no se modifican por acá (si vienen en el cuerpo se ignoran). El precio nuevo rige para las reservas que se
// creen desde ahora: las que ya existen conservan su precio.
export const editar = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return res.status(404).json(NO_ENCONTRADA)
  const { error, datos } = validarCancha(req.body, { completo: false })
  if (error) return res.status(400).json(error)

  try {
    const r = await actualizarCancha(id, datos)
    if (r.resultado === 'NO_ENCONTRADA') return res.status(404).json(NO_ENCONTRADA)
    if (r.resultado === 'NOMBRE_REPETIDO') return res.status(409).json(NOMBRE_REPETIDO)
    return res.status(200).json({
      mensaje: 'Cancha actualizada. El nuevo precio rige para las reservas que se creen desde ahora',
      cancha: r.cancha,
      precioAnterior: r.precioAnterior,
      reservasFuturas: r.cancha.reservasFuturas,
    })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ mensaje: 'No se pudo actualizar la cancha' })
  }
}
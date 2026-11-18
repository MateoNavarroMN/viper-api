import { crearCancha, disponibilidadDelDia, listarTodasLasCanchas } from './modelo.canchas.js'
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
import { disponibilidadDelDia } from './modelo.canchas.js'

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
    return res.status(200).json(await disponibilidadDelDia(disciplina, fecha))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo obtener la disponibilidad de las canchas' })
  }
}
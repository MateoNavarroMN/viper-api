import { MENSAJE_FRANJA_OCUPADA } from '../reservas/modelo.reservas.js'
import { programarPartido } from './modelo.partidos.js'

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// 'AAAA-MM-DDTHH:MM' (también con espacio en lugar de la T) → { fecha, horaInicio }, o null si no es un instante real
const leerInicio = (valor) => {
  const partes = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})$/.exec(typeof valor === 'string' ? valor : '')
  if (!partes) return null
  const [, fecha, hora, minutos] = partes
  const calendario = new Date(`${fecha}T00:00:00Z`)
  if (Number.isNaN(calendario.getTime()) || calendario.toISOString().slice(0, 10) !== fecha) return null
  if (Number(hora) > 23 || Number(minutos) > 59) return null
  return { fecha, horaInicio: `${hora}:${minutos}` }
}

// PUT /api/partidos/:id/programacion Cuerpo: { canchaId, inicio: 'AAAA-MM-DDTHH:MM' }
// Programa el partido o, si ya tenía cancha y horario, lo reprograma: la franja anterior queda libre.
export const programacion = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return res.status(404).json({ mensaje: 'Partido no encontrado' })

  const { canchaId, inicio } = req.body ?? {}
  if (typeof canchaId !== 'string' || !REGEX_UUID.test(canchaId)) {
    return res.status(400).json({ mensaje: 'Elegí una cancha', campo: 'canchaId' })
  }
  const franja = leerInicio(inicio)
  if (!franja) return res.status(400).json({ mensaje: 'El inicio debe tener el formato AAAA-MM-DDTHH:MM', campo: 'inicio' })

  try {
    const r = await programarPartido(id, { canchaId, ...franja })
    switch (r.resultado) {
      case 'NO_ENCONTRADO':
        return res.status(404).json({ mensaje: 'Partido no encontrado' })
      case 'NO_PROGRAMABLE':
        return res.status(409).json({ mensaje: r.motivo })
      case 'CANCHA_INVALIDA':
        return res.status(400).json({ mensaje: 'La cancha no existe o no es de la disciplina del torneo', campo: 'canchaId' })
      case 'FRANJA_NO_DISPONIBLE':
        return res.status(409).json({ mensaje: 'Franja no disponible', sugerencia: r.sugerencia })
      case 'PARTICIPANTE_OCUPADO':
        return res.status(409).json({ mensaje: 'Un participante ya juega en esa franja', sugerencia: r.sugerencia })
      case 'FRANJA_OCUPADA':
        return res.status(409).json({ mensaje: MENSAJE_FRANJA_OCUPADA })
      default:
        return res.status(200).json({ mensaje: 'Partido programado', partido: r.partido })
    }
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo programar el partido' })
  }
}
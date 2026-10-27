import { guardarOrdenManual } from './modelo.zonas.torneos.js'

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// PUT /api/zonas/:id/orden-manual  (CU 3.9 · 3a, Organizador y Administrador)
// Cuerpo: { orden: [inscripcionId, ...] } con los que siguen empatados, del mejor al peor.
// Resuelve el empate, vuelve a calcular la tabla y, si la zona queda sin empates, la cierra.
export const ordenManual = async (req, res) => {
  if (!REGEX_UUID.test(req.params.id)) return res.status(404).json({ mensaje: 'Zona no encontrada' })

  const { orden } = req.body ?? {}
  if (!Array.isArray(orden) || orden.length < 2 || orden.some((id) => typeof id !== 'string' || !REGEX_UUID.test(id))) {
    return res.status(400).json({ mensaje: 'Indicá el orden de al menos dos inscripciones', campo: 'orden' })
  }
  if (new Set(orden).size !== orden.length) {
    return res.status(400).json({ mensaje: 'Una inscripción aparece más de una vez', campo: 'orden' })
  }

  try {
    const { resultado, ...datos } = await guardarOrdenManual(req.params.id, orden)
    if (resultado === 'NO_ENCONTRADO') return res.status(404).json({ mensaje: 'Zona no encontrada' })
    if (resultado === 'ESTADO_INVALIDO') return res.status(409).json({ mensaje: 'El torneo no está en curso', estado: datos.estado })
    if (resultado === 'FASE_INVALIDA') {
      return res.status(409).json({ mensaje: 'La fase eliminatoria ya fue generada: regenerala para cambiar un desempate', faseActual: datos.faseActual })
    }
    if (resultado === 'ZONA_INCOMPLETA') {
      return res.status(409).json({ mensaje: 'La zona todavía tiene partidos pendientes', partidosPendientes: datos.partidosPendientes })
    }
    if (resultado === 'SIN_EMPATES') return res.status(409).json({ mensaje: 'La zona no tiene empates por resolver' })
    if (resultado === 'NO_SON_DE_LA_ZONA') {
      return res.status(400).json({ mensaje: 'Hay inscripciones que no son de la zona', campo: 'orden' })
    }
    if (resultado === 'NO_ESTAN_EMPATADOS') {
      return res.status(400).json({ mensaje: 'Solo se ordenan los participantes que siguen empatados', campo: 'orden' })
    }
    if (resultado === 'GRUPO_INCOMPLETO') {
      return res.status(400).json({ mensaje: 'Incluí a todos los participantes de cada grupo empatado', campo: 'orden', empates: datos.empates })
    }
    return res.status(200).json({
      mensaje: datos.zona.cerrada ? 'Empate resuelto: la zona quedó cerrada' : 'Orden guardado: la zona todavía tiene empates por resolver',
      zona: datos.zona,
      puntosOtorgados: datos.puntosOtorgados,
      todasLasZonasCerradas: datos.todasLasZonasCerradas,
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo guardar el orden de la zona' })
  }
}
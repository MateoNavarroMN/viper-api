import { validarMarcador } from './validador.marcador.partidos.js'
import { corregirResultado, registrarResultado } from './modelo.resultado.partidos.js'

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Valida el cuerpo y el marcador antes de tocar la base. Devuelve { sets, ganador } o responde el error y devuelve null.
const leerMarcador = (req, res) => {
  const { sets } = req.body ?? {}
  if (!Array.isArray(sets)) {
    res.status(400).json({ mensaje: 'Cargá el resultado de los sets', campo: 'sets' })
    return null
  }

  const marcador = validarMarcador(sets)
  if (!marcador.valido) {
    const conSet = marcador.errores.find((e) => e.set !== null)
    res.status(400).json({
      mensaje: conSet ? `Marcador inválido (set ${conSet.set})` : 'Marcador inválido',
      campo: 'sets',
      errores: marcador.errores,
    })
    return null
  }
  return { sets: sets.map((s) => ({ local: s.local, visitante: s.visitante })), ganador: marcador.ganador }
}

// POST /api/partidos/:id/resultado  (CU 3.6 · pasos 5 a 9, Organizador y Administrador)
// Cuerpo: { sets: [{ local, visitante }] } con los games de cada set, en orden (un super tie-break cuenta como un set más).
// Guarda el resultado, el ganador, la tabla de la zona o el avance en el cuadro, y los puntos.
export const resultado = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return res.status(404).json({ mensaje: 'Partido no encontrado' })

  const marcador = leerMarcador(req, res)
  if (!marcador) return

  try {
    const r = await registrarResultado(id, marcador.sets, marcador.ganador)
    if (r.resultado === 'NO_ENCONTRADO') return res.status(404).json({ mensaje: 'Partido no encontrado' })
    if (r.resultado === 'NO_ADMITE') return res.status(409).json({ mensaje: 'El partido no admite carga de resultado' })
    const { resultado: _, ...datos } = r
    return res.status(200).json({ mensaje: 'Resultado guardado', ...datos })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo guardar el resultado' })
  }
}

// PUT /api/partidos/:id/resultado  (CU 3.6 · flujo alternativo 6a, Organizador y Administrador)
// Mismo cuerpo que el POST. Corrige un resultado ya cargado: 409 con el motivo si el ganador ya jugó su partido
// siguiente, si en una zona ya se generó la fase eliminatoria, si el partido terminó por W.O. o si el torneo ya finalizó
// (salvo la final).
export const corregir = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return res.status(404).json({ mensaje: 'Partido no encontrado' })

  const marcador = leerMarcador(req, res)
  if (!marcador) return

  try {
    const r = await corregirResultado(id, marcador.sets, marcador.ganador)
    if (r.resultado === 'NO_ENCONTRADO') return res.status(404).json({ mensaje: 'Partido no encontrado' })
    if (r.resultado === 'NO_ADMITE') return res.status(409).json({ mensaje: `No se puede corregir el resultado: ${r.motivo}`, motivo: r.motivo })
    const { resultado: _, ...datos } = r
    return res.status(200).json({ mensaje: 'Resultado corregido', ...datos })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo corregir el resultado' })
  }
}
import { validarMarcador } from './validador.marcador.partidos.js'
import { registrarResultado } from './modelo.resultado.partidos.js'

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/partidos/:id/resultado  (CU 3.6 · pasos 5 a 9, Organizador y Administrador)
// Cuerpo: { sets: [{ local, visitante }] } con los games de cada set, en orden (un super tie-break cuenta como un set más).
// Guarda el resultado, el ganador, la tabla de la zona o el avance en el cuadro, y los puntos.
export const resultado = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return res.status(404).json({ mensaje: 'Partido no encontrado' })

  const { sets } = req.body ?? {}
  if (!Array.isArray(sets)) return res.status(400).json({ mensaje: 'Cargá el resultado de los sets', campo: 'sets' })

  const marcador = validarMarcador(sets)
  if (!marcador.valido) {
    const conSet = marcador.errores.find((e) => e.set !== null)
    return res.status(400).json({
      mensaje: conSet ? `Marcador inválido (set ${conSet.set})` : 'Marcador inválido',
      campo: 'sets',
      errores: marcador.errores,
    })
  }

  try {
    const r = await registrarResultado(id, sets.map((s) => ({ local: s.local, visitante: s.visitante })), marcador.ganador)
    if (r.resultado === 'NO_ENCONTRADO') return res.status(404).json({ mensaje: 'Partido no encontrado' })
    if (r.resultado === 'NO_ADMITE') return res.status(409).json({ mensaje: 'El partido no admite carga de resultado' })
    const { resultado: _, ...datos } = r
    return res.status(200).json({ mensaje: 'Resultado guardado', ...datos })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo guardar el resultado' })
  }
}
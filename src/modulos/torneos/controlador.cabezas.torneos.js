import { guardarCabezasDeSerie, obtenerCabezasDeSerie } from './modelo.cabezas.torneos.js'

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const noEncontrado = (res) => res.status(404).json({ mensaje: 'Torneo no encontrado' })

// Respuestas de error comunes al GET y al PUT (CU 3.3 · 2a y estado del torneo)
const errorDeEtapa = (res, datos) => {
  if (datos.resultado === 'NO_ENCONTRADO') return noEncontrado(res)
  if (datos.resultado === 'ESTADO_INVALIDO') {
    return res.status(409).json({
      mensaje: 'Las cabezas de serie se configuran con las inscripciones abiertas o cerradas',
      estado: datos.estado,
    })
  }
  if (datos.resultado === 'INSUFICIENTES') {
    return res.status(409).json({
      mensaje: 'Inscriptos insuficientes',
      pagadas: datos.pagadas,
      minimoInscriptos: datos.minimoInscriptos,
    })
  }
  return null
}

// GET /api/torneos/:id/cabezas-de-serie  (CU 3.3 · pasos 1 y 2, Organizador y Administrador)
export const obtener = async (req, res) => {
  if (!REGEX_UUID.test(req.params.id)) return noEncontrado(res)
  try {
    const { resultado, ...datos } = await obtenerCabezasDeSerie(req.params.id)
    return errorDeEtapa(res, { resultado, ...datos }) ?? res.status(200).json(datos)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudieron obtener las cabezas de serie' })
  }
}

// PUT /api/torneos/:id/cabezas-de-serie  con { inscripcionIds: [...] }  (CU 3.3 · pasos 4 a 7)
// Reemplaza la selección: las inscripciones de la lista quedan como cabezas de serie y las demás no.
export const guardar = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return noEncontrado(res)

  const { inscripcionIds } = req.body ?? {}
  const formatoValido =
    Array.isArray(inscripcionIds) &&
    inscripcionIds.every((x) => typeof x === 'string' && REGEX_UUID.test(x)) &&
    new Set(inscripcionIds).size === inscripcionIds.length
  if (!formatoValido) {
    return res.status(400).json({ mensaje: 'Enviá la lista de inscripciones, sin repetir', campo: 'inscripcionIds' })
  }

  try {
    const { resultado, ...datos } = await guardarCabezasDeSerie(id, inscripcionIds)
    const error = errorDeEtapa(res, { resultado, ...datos })
    if (error) return error
    if (resultado === 'INSCRIPCION_INVALIDA') {
      return res.status(400).json({
        mensaje: 'Solo pueden ser cabeza de serie las inscripciones activas y pagadas de este torneo',
        campo: 'inscripcionIds',
      })
    }
    if (resultado === 'DEMASIADAS') {
      return res.status(400).json({
        mensaje: `Demasiadas cabezas de serie (el máximo es ${datos.maximoPermitido})`,
        campo: 'inscripcionIds',
        maximoPermitido: datos.maximoPermitido,
      })
    }
    return res.status(200).json({ mensaje: 'Cabezas de serie guardadas', ...datos })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudieron guardar las cabezas de serie' })
  }
}
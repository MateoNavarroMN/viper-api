import { accionesPermitidas } from './acciones.torneos.js'
import { archivarTorneo, obtenerResumen } from './modelo.archivo.torneos.js'

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const noEncontrado = (res) => res.status(404).json({ mensaje: 'Torneo no encontrado' })

const conTorneo = (accion, mensajeError) => async (req, res) => {
  if (!REGEX_UUID.test(req.params.id)) return noEncontrado(res)
  try {
    return await accion(req, res)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: mensajeError })
  }
}

// GET /api/torneos/:id/resumen  (CU 3.8 · pasos 2 y 3, solo Administrador)
// Campeón, cuadro final, resultados y puntos del torneo. Sirve con el torneo finalizado y también ya archivado.
export const resumen = conTorneo(async (req, res) => {
  const { resultado, ...datos } = await obtenerResumen(req.params.id)
  if (resultado === 'NO_ENCONTRADO') return noEncontrado(res)
  if (resultado === 'NO_FINALIZADO') return res.status(409).json({ mensaje: 'El torneo todavía no finalizó', estado: datos.estado })
  return res.status(200).json({ ...datos, torneo: { ...datos.torneo, accionesPermitidas: accionesPermitidas(datos.torneo, req.usuario.rol) } })
}, 'No se pudo obtener el resumen del torneo')

// POST /api/torneos/:id/archivar  (CU 3.8 · pasos 5 a 7, solo Administrador: el Organizador no archiva)
export const archivar = conTorneo(async (req, res) => {
  const { resultado, ...datos } = await archivarTorneo(req.params.id)
  if (resultado === 'NO_ENCONTRADO') return noEncontrado(res)
  if (resultado === 'YA_ARCHIVADO') return res.status(409).json({ mensaje: 'El torneo ya está archivado', estado: 'ARCHIVADO' })
  if (resultado === 'NO_FINALIZADO') {
    return res.status(409).json({ mensaje: 'Solo se pueden archivar torneos finalizados', estado: datos.estado })
  }
  return res.status(200).json({
    mensaje: 'Torneo archivado correctamente',
    torneo: { ...datos.torneo, accionesPermitidas: accionesPermitidas(datos.torneo, req.usuario.rol) },
  })
}, 'No se pudo archivar el torneo')
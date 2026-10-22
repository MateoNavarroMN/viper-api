import { generarCuadro, obtenerCuadro, previewCuadro, regenerarCuadro } from './modelo.cuadro.torneos.js'

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const noEncontrado = (res) => res.status(404).json({ mensaje: 'Torneo no encontrado' })

// Mensajes de los motivos por los que no se puede generar (CU 3.4 · 2a y estado del torneo)
const errorDeGeneracion = (res, datos) => {
  const { resultado } = datos
  if (resultado === 'NO_ENCONTRADO') return noEncontrado(res)
  if (resultado === 'ESTADO_INVALIDO') {
    return res.status(409).json({ mensaje: 'El cuadro se genera con las inscripciones cerradas', estado: datos.estado })
  }
  if (resultado === 'INSUFICIENTES') {
    return res.status(409).json({ mensaje: 'Inscriptos insuficientes', pagadas: datos.pagadas, minimoInscriptos: datos.minimoInscriptos })
  }
  if (resultado === 'CUADRO_MUY_GRANDE') {
    return res.status(409).json({
      mensaje: `El cuadro de eliminación directa admite hasta ${datos.maximoParticipantes} participantes`,
      pagadas: datos.pagadas,
      maximoParticipantes: datos.maximoParticipantes,
    })
  }
  if (resultado === 'DEMASIADAS_CABEZAS') {
    return res.status(409).json({
      mensaje: `Demasiadas cabezas de serie (el máximo es ${datos.maximoPermitido})`,
      cabezas: datos.cabezas,
      maximoPermitido: datos.maximoPermitido,
    })
  }
  return null
}

const conTorneo = (accion, mensajeError) => async (req, res) => {
  if (!REGEX_UUID.test(req.params.id)) return noEncontrado(res)
  try {
    return await accion(req, res)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: mensajeError })
  }
}

// GET /api/torneos/:id/generar-cuadro/preview  (CU 3.4 · paso 1, Organizador y Administrador)
// Siempre responde 200 con `puedeGenerar`; si es false, `bloqueo` dice por qué (por ejemplo, inscriptos insuficientes).
export const preview = conTorneo(async (req, res) => {
  const { resultado, ...datos } = await previewCuadro(req.params.id)
  return errorDeGeneracion(res, { resultado, ...datos }) ?? res.status(200).json(datos)
}, 'No se pudo obtener el resumen del cuadro')

// POST /api/torneos/:id/generar-cuadro  (CU 3.4 · pasos 2 a 6)
export const generar = conTorneo(async (req, res) => {
  const { resultado, ...datos } = await generarCuadro(req.params.id)
  return errorDeGeneracion(res, { resultado, ...datos }) ?? res.status(200).json({
    mensaje: datos.partidosSinProgramar.length > 0
      ? 'Cuadro generado: hay partidos sin programar para reprogramar a mano'
      : 'Cuadro generado',
    torneo: datos.torneo,
    partidos: datos.partidos,
    partidosSinProgramar: datos.partidosSinProgramar,
  })
}, 'No se pudo generar el cuadro')

// GET /api/torneos/:id/cuadro  (cualquier usuario autenticado: el jugador también ve el cuadro)
export const cuadro = conTorneo(async (req, res) => {
  const { resultado, ...datos } = await obtenerCuadro(req.params.id)
  if (resultado === 'NO_ENCONTRADO') return noEncontrado(res)
  if (resultado === 'SIN_CUADRO') return res.status(409).json({ mensaje: 'El torneo todavía no tiene cuadro', estado: datos.estado })
  return res.status(200).json(datos)
}, 'No se pudo obtener el cuadro')

// POST /api/torneos/:id/regenerar-cuadro  (CU 3.4 · 6a)
export const regenerar = conTorneo(async (req, res) => {
  const { resultado, ...datos } = await regenerarCuadro(req.params.id)
  if (resultado === 'NO_ENCONTRADO') return noEncontrado(res)
  if (resultado === 'ESTADO_INVALIDO') {
    return res.status(409).json({ mensaje: 'El torneo no tiene un cuadro para regenerar', estado: datos.estado })
  }
  if (resultado === 'CON_RESULTADOS') return res.status(409).json({ mensaje: 'El cuadro ya tiene resultados' })
  return res.status(200).json({ mensaje: 'Cuadro eliminado: ya podés generarlo de nuevo', torneo: datos.torneo, reservasCanceladas: datos.reservasCanceladas })
}, 'No se pudo regenerar el cuadro')
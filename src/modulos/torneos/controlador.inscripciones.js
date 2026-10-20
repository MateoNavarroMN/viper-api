import { accionesPermitidas } from './acciones.torneos.js'
import { inscribirEnTorneo } from './modelo.inscribir.torneos.js'
import { anularInscripcionesVencidas, listarInscripcionesParaGestion } from './modelo.inscripciones.js'
import { buscarTorneoPorId } from './modelo.torneos.js'
import { listarInscripcionesDeJugador } from '../perfil/modelo.actividad.js'

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MEDIOS_DE_PAGO = ['EN_LINEA', 'RECEPCION']

const noEncontrado = (res) => res.status(404).json({ mensaje: 'Torneo no encontrado' })
const datoInvalido = (res, mensaje, campo) => res.status(400).json({ mensaje, campo })

// Mensajes de cada flujo alternativo
const YA_INSCRIPTO = {
  JUGADOR: 'Ya estás inscripto en este torneo',
  COMPANERO: 'Tu compañero ya está inscripto en este torneo',
}
const categoriaIncompatible = ({ quien, categoriaRequerida }) =>
  quien === 'COMPANERO'
    ? `Categoría incompatible: tu compañero no es de la categoría ${categoriaRequerida}, que es la que pide el torneo`
    : `Categoría incompatible: el torneo es para la categoría ${categoriaRequerida}`

// POST /api/torneos/:id/inscripciones
// Cuerpo: { companeroJugadorId?, medioPago: 'EN_LINEA' | 'RECEPCION' }. En Pádel el compañero es obligatorio; en Tenis no va.
export const inscribir = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return noEncontrado(res)

  const { companeroJugadorId, medioPago } = req.body ?? {}
  if (!MEDIOS_DE_PAGO.includes(medioPago)) return datoInvalido(res, 'Elegí cómo vas a pagar: en línea o en recepción', 'medioPago')
  if (companeroJugadorId !== undefined && companeroJugadorId !== null && !REGEX_UUID.test(String(companeroJugadorId))) {
    return datoInvalido(res, 'Compañero no válido', 'companeroJugadorId')
  }

  // Precondición 2: perfil de jugador cargado
  const jugadorId = req.usuario.jugador_id
  if (!jugadorId) return res.status(403).json({ mensaje: 'Tu cuenta no tiene perfil de jugador' })
  if (companeroJugadorId && companeroJugadorId === jugadorId) return datoInvalido(res, 'Compañero no válido', 'companeroJugadorId')

  try {
    const resultado = await inscribirEnTorneo({ torneoId: id, jugadorId, companeroJugadorId: companeroJugadorId || null })

    switch (resultado.resultado) {
      case 'NO_ENCONTRADO':
        return noEncontrado(res)
      case 'NO_ABIERTO':
        // Un torneo PLANIFICADO el jugador no lo puede ver: responde igual que si no existiera
        if (resultado.estado === 'PLANIFICADO') return noEncontrado(res)
        return res.status(409).json({ mensaje: 'Las inscripciones de este torneo no están abiertas', estado: resultado.estado })
      case 'SIN_COMPANERO':
        return datoInvalido(res, 'En Pádel tenés que elegir un compañero', 'companeroJugadorId')
      case 'CON_COMPANERO':
        return datoInvalido(res, 'En Tenis la inscripción es individual: no lleva compañero', 'companeroJugadorId')
      case 'COMPANERO_INVALIDO':
        return datoInvalido(res, 'Compañero no válido', 'companeroJugadorId')
      case 'CUPO_COMPLETO':
        return res.status(409).json({ mensaje: 'Cupo completo' })
      case 'YA_INSCRIPTO':
        return res.status(409).json({ mensaje: YA_INSCRIPTO[resultado.quien], quien: resultado.quien })
      case 'CATEGORIA_INCOMPATIBLE':
        return res.status(409).json({
          mensaje: categoriaIncompatible(resultado),
          quien: resultado.quien,
          categoriaRequerida: resultado.categoriaRequerida,
          categoriaJugador: resultado.categoriaJugador,
        })
      default: {
        const { inscripcion, torneo } = resultado
        return res.status(201).json({
          mensaje: 'Inscripción registrada',
          inscripcion,
          torneo: { ...torneo, accionesPermitidas: accionesPermitidas(torneo, req.usuario.rol) },
          // Pago en línea fuera de este alcance: la inscripción queda PENDIENTE como si fuera en recepción
          pagoEnLinea: medioPago === 'EN_LINEA' ? { disponible: false, mensaje: 'El pago en línea todavía no está disponible: pagá en recepción antes del vencimiento' } : undefined,
        })
      }
    }
  } catch (error) {
    // Dos pedidos del mismo jugador a la vez: la base frena el segundo (índices únicos y trigger)
    if (error.code === '23505') return res.status(409).json({ mensaje: YA_INSCRIPTO.JUGADOR, quien: 'JUGADOR' })
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo registrar la inscripción' })
  }
}

const ESTADOS_INSCRIPCION = ['ACTIVA', 'ANULADA']

// Persona de una inscripción para el listado de gestión (con DNI, para identificarla en recepción)
const persona = (id, nombre, apellido, dni) => (id ? { id, nombre, apellido, dni } : null)

// GET /api/torneos/:id/inscripciones?estado=ACTIVA|ANULADA  (CU 3.2 · 7a, Organizador, Recepcionista y Administrador)
// Antes de listar se anulan las pendientes vencidas, así el cupo y el estado salen al día.
export const listarDelTorneo = async (req, res) => {
  const { id } = req.params
  const { estado } = req.query
  if (!REGEX_UUID.test(id)) return noEncontrado(res)
  if (estado !== undefined && !ESTADOS_INSCRIPCION.includes(estado)) {
    return datoInvalido(res, 'Parámetro inválido: el estado no existe', 'estado')
  }

  try {
    await anularInscripcionesVencidas(id)
    const torneo = await buscarTorneoPorId(id)
    // Un torneo PLANIFICADO todavía no tiene inscripciones: responde igual que uno que no existe
    if (!torneo || torneo.estado === 'PLANIFICADO') return noEncontrado(res)

    const filas = await listarInscripcionesParaGestion(id, estado ?? null)
    const inscripciones = filas.map((f) => ({
      id: f.id,
      estado: f.estado,
      estadoPago: f.estadoPago,
      fechaInscripcion: f.fechaInscripcion,
      venceEn: f.venceEn,
      fechaPago: f.fechaPago,
      cabezaDeSerie: f.cabezaDeSerie,
      titular: persona(f.titularJugadorId, f.titularNombre, f.titularApellido, f.titularDni),
      companero: persona(f.companeroJugadorId, f.companeroNombre, f.companeroApellido, f.companeroDni),
    }))
    const { nombre, estado: estadoTorneo, cupoMaximo, inscriptos, cupoDisponible } = torneo
    return res.status(200).json({
      torneo: { id, nombre, estado: estadoTorneo, cupoMaximo, inscriptos, cupoDisponible },
      inscripciones,
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo obtener el listado de inscripciones' })
  }
}

// GET /api/mis-inscripciones  (CU 3.2 · paso 10, solo JUGADOR)
// Todas las del jugador, como titular o compañero, las más recientes primero. Incluye las ANULADAS.
export const listarMias = async (req, res) => {
  if (!req.usuario.jugador_id) return res.status(403).json({ mensaje: 'Tu cuenta no tiene perfil de jugador' })
  try {
    await anularInscripcionesVencidas()
    const inscripciones = await listarInscripcionesDeJugador(req.usuario.jugador_id, null)
    return res.status(200).json({ inscripciones })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudieron obtener tus inscripciones' })
  }
}
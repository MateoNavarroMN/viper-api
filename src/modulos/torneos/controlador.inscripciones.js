import { accionesPermitidas } from './acciones.torneos.js'
import { inscribirEnTorneo } from './modelo.inscribir.torneos.js'

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
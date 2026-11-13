import { ANTICIPACION_CANCELACION_HORAS } from './modelo.reservas.js'

// Qué se puede hacer con una reserva (CU 2.5). Es la única función que decide: el detalle la muestra y cancelar, modificar,
// reasignar y cobrar la vuelven a consultar antes de actuar, así la pantalla y la API nunca discrepan.
//
//   accionesPermitidas({ tipo, estado, segundosParaInicio }, rol)
//     → { cancelar, modificarHorario, reasignarCancha, registrarCobro }, cada una { permitido: true } o { permitido: false, motivo }
//
// `rol` es el de quien consulta. El Administrador cuenta como Recepcionista. `segundosParaInicio` es negativo si el turno ya empezó.
const SEGUNDOS_DE_PLAZO = ANTICIPACION_CANCELACION_HORAS * 3600
const SI = { permitido: true }
const no = (motivo) => ({ permitido: false, motivo })

export const accionesPermitidas = ({ tipo, estado, segundosParaInicio }, rol) => {
  const esJugador = rol === 'JUGADOR'

  // Lo que frena a todos: las reservas de un torneo se manejan desde el torneo y las canceladas o vencidas ya no se tocan
  const cerrada = () => {
    if (tipo === 'TORNEO') return 'Se gestiona desde el torneo'
    if (estado === 'CANCELADA') return 'La reserva está cancelada'
    if (estado === 'EXPIRADA') return 'La reserva expiró por falta de pago'
    return null
  }
  const yaEmpezo = () => (segundosParaInicio <= 0 ? 'El turno ya comenzó' : null)
  // El Jugador llega hasta 3 horas antes del turno; Recepción y Administrador, hasta que empiece
  const fueraDePlazo = (verbo) =>
    esJugador && segundosParaInicio < SEGUNDOS_DE_PLAZO
      ? `Solo se puede ${verbo} hasta ${ANTICIPACION_CANCELACION_HORAS} horas antes del turno. Comunicate con recepción.`
      : null
  const decidir = (...motivos) => {
    const motivo = motivos.find(Boolean)
    return motivo ? no(motivo) : SI
  }

  return {
    cancelar: decidir(cerrada(), yaEmpezo(), fueraDePlazo('cancelar')),
    modificarHorario: decidir(cerrada(), yaEmpezo(), fueraDePlazo('modificar')),
    reasignarCancha: decidir(cerrada(), yaEmpezo(), esJugador && 'Solo recepción puede cambiar la cancha'),
    registrarCobro: decidir(
      cerrada(),
      esJugador && 'Solo recepción registra el cobro',
      estado !== 'PENDIENTE' && 'La reserva no tiene un cobro pendiente',
    ),
  }
}

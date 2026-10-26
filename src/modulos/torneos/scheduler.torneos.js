// Scheduler de partidos: asignación voraz de cancha y horario.
// Función pura: no toca la base; recibe todo por parámetro y devuelve la propuesta.

export const DURACION_MIN = 90
export const DESCANSO_MIN = 60
export const HORARIO = { desde: '08:00', hasta: '23:00' }
const PASO_MIN = 30

const aMinutos = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

const aHora = (min) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Día 'YYYY-MM-DD' -> número de día (sin zona horaria, así no hay corrimientos).
const aDia = (fecha) => {
  const [a, m, d] = fecha.split('-').map(Number)
  return Date.UTC(a, m - 1, d) / 86400000
}

const aFecha = (dia) => new Date(dia * 86400000).toISOString().slice(0, 10)

// Cuándo puede empezar el partido que sigue: al terminar el anterior ({ fecha, hora }) más el descanso mínimo
export const despuesDelDescanso = ({ fecha, hora }) => {
  const total = aMinutos(hora) + DESCANSO_MIN
  return { fecha: aFecha(aDia(fecha) + Math.floor(total / 1440)), hora: aHora(total % 1440) }
}

// Instante absoluto en minutos para comparar franjas de distintos días.
const instante = (fecha, hhmm) => aDia(fecha) * 1440 + aMinutos(hhmm)

const solapan = (iniA, finA, iniB, finB) => iniA < finB && iniB < finA

/**
 * partidos: [{ id, ronda, posicion, participantes: [id...], dependeDe?: [partidoId...] }]
 *   - participantes: ids de quienes juegan (vacío si todavía no se conocen).
 *   - dependeDe: partidos que deben terminar (más el descanso) antes de este.
 *   - los byes no se programan: filtralos antes de llamar.
 * canchas: [{ id }] ya filtradas por disciplina.
 * ocupadas: [{ canchaId, fecha, horaInicio, horaFin }] (alquileres, otros partidos).
 * agendaPrevia: { [participanteId]: [{ fecha, horaInicio, horaFin }] } partidos que esos participantes ya tienen.
 * desde, hasta: 'YYYY-MM-DD', inclusivos.
 * Devuelve { asignados: [{ partidoId, canchaId, fecha, horaInicio, horaFin }],
 *            sinAsignar: [{ partidoId, motivo }] }.
 */
export function programar(partidos, opciones) {
  const {
    canchas,
    ocupadas = [],
    agendaPrevia = {},
    desde,
    hasta,
    horario = HORARIO,
    duracionMin = DURACION_MIN,
    descansoMin = DESCANSO_MIN,
  } = opciones

  const apertura = aMinutos(horario.desde)
  const cierre = aMinutos(horario.hasta)
  if (!(duracionMin > 0) || cierre - apertura < duracionMin) {
    throw new Error('El horario no alcanza para un partido')
  }
  const primerDia = aDia(desde)
  const ultimoDia = aDia(hasta)
  if (ultimoDia < primerDia) throw new Error('El período es inválido')

  const ocupadasCancha = new Map(canchas.map((c) => [c.id, []]))
  for (const o of ocupadas) {
    if (!ocupadasCancha.has(o.canchaId)) continue
    ocupadasCancha.get(o.canchaId).push([instante(o.fecha, o.horaInicio), instante(o.fecha, o.horaFin)])
  }

  const agendaJugador = new Map()
  for (const [participante, partidosPrevios] of Object.entries(agendaPrevia)) {
    agendaJugador.set(participante, partidosPrevios.map((o) => [instante(o.fecha, o.horaInicio), instante(o.fecha, o.horaFin)]))
  }
  const finDePartido = new Map()
  const asignados = []
  const sinAsignar = []

  const ordenados = [...partidos].sort(
    (a, b) => a.ronda - b.ronda || (a.posicion ?? 0) - (b.posicion ?? 0),
  )

  for (const partido of ordenados) {
    const dependencias = partido.dependeDe ?? []
    if (dependencias.some((id) => !finDePartido.has(id))) {
      sinAsignar.push({ partidoId: partido.id, motivo: 'DEPENDENCIA_SIN_ASIGNAR' })
      continue
    }
    const noAntesDe = Math.max(
      partido.noAntesDe ? instante(partido.noAntesDe.fecha, partido.noAntesDe.hora) : -Infinity,
      ...dependencias.map((id) => finDePartido.get(id) + descansoMin),
    )

    let elegido = null
    buscar: for (let dia = primerDia; dia <= ultimoDia; dia++) {
      const base = dia * 1440
      for (let inicio = apertura; inicio + duracionMin <= cierre; inicio += PASO_MIN) {
        const ini = base + inicio
        const fin = ini + duracionMin
        if (ini < noAntesDe) continue

        const jugadorLibre = partido.participantes.every((p) =>
          (agendaJugador.get(p) ?? []).every(
            ([i, f]) => !solapan(ini, fin, i - descansoMin, f + descansoMin),
          ),
        )
        if (!jugadorLibre) continue

        for (const cancha of canchas) {
          if (ocupadasCancha.get(cancha.id).every(([i, f]) => !solapan(ini, fin, i, f))) {
            elegido = { cancha, dia, inicio, ini, fin }
            break buscar
          }
        }
      }
    }

    if (!elegido) {
      sinAsignar.push({ partidoId: partido.id, motivo: 'SIN_LUGAR' })
      continue
    }

    ocupadasCancha.get(elegido.cancha.id).push([elegido.ini, elegido.fin])
    for (const p of partido.participantes) {
      if (!agendaJugador.has(p)) agendaJugador.set(p, [])
      agendaJugador.get(p).push([elegido.ini, elegido.fin])
    }
    finDePartido.set(partido.id, elegido.fin)
    asignados.push({
      partidoId: partido.id,
      canchaId: elegido.cancha.id,
      fecha: aFecha(elegido.dia),
      horaInicio: aHora(elegido.inicio),
      horaFin: aHora(elegido.inicio + duracionMin),
    })
  }

  return { asignados, sinAsignar }
}
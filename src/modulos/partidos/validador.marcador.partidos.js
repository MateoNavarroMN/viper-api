// Validador de marcador (CU 3.6 · paso 5). Función pura: no importa nada ni toca la base, así este mismo archivo
// se copia tal cual al front (viper-web) y las dos puntas validan con las mismas reglas.
//
// sets: [{ local, visitante }] con los games de cada set, en orden (el primero es el set 1).
// config: { mejorDe: 3 | 5, superTiebreak: boolean }. Por defecto, al mejor de 3 sets y sin super tie-break.
//   Con `superTiebreak` el set decisivo (el 3º al mejor de 3) no se juega a games: es un super tie-break a 10 puntos
//   con 2 de diferencia, y se carga como un set más (10-7, 12-10…).
// Devuelve { valido, ganador: 'LOCAL' | 'VISITANTE' | null, setsGanados: { local, visitante }, errores: [{ set, motivo }] }
//   - `set` es el número de set (desde 1) o null si el error es del partido entero.
//   - `ganador` solo viene si el marcador es válido; `setsGanados` cuenta los sets bien cargados, así el front
//     puede mostrar cómo va el partido mientras se completa.

export const CONFIG_POR_DEFECTO = { mejorDe: 3, superTiebreak: false }

const esJuegos = (n) => Number.isInteger(n) && n >= 0

// Set común: 6-0 a 6-4, 7-5 o 7-6. Devuelve el motivo del error, o null si el set es válido.
const motivoSetComun = (a, b) => {
  const mayor = Math.max(a, b)
  const menor = Math.min(a, b)
  if (a === b) return 'Un set no puede terminar empatado'
  if (mayor < 6) return 'El set no está terminado: el ganador tiene que llegar a 6 games'
  if (mayor === 6) return menor <= 4 ? null : 'Con 6-5 el set sigue: se define 7-5 o 7-6'
  if (mayor === 7) return menor >= 5 ? null : 'Con 6 games y 2 de diferencia el set ya estaba terminado: no se puede llegar a 7'
  return 'Un set no puede pasar de 7 games'
}

// Super tie-break: a 10 puntos y con 2 de diferencia (10-8, 11-9, 12-10…)
const motivoSuperTiebreak = (a, b) => {
  const mayor = Math.max(a, b)
  const menor = Math.min(a, b)
  if (a === b) return 'El super tie-break no puede terminar empatado'
  if (mayor < 10) return 'El super tie-break se juega a 10 puntos'
  if (mayor - menor < 2) return 'El super tie-break se gana con 2 puntos de diferencia'
  if (mayor > 10 && mayor - menor > 2) return 'Pasando los 10 puntos, el super tie-break termina con 2 de diferencia (11-9, 12-10…)'
  return null
}

export function validarMarcador(sets, config = {}) {
  const { mejorDe, superTiebreak } = { ...CONFIG_POR_DEFECTO, ...config }
  if (mejorDe !== 3 && mejorDe !== 5) throw new Error('mejorDe tiene que ser 3 o 5')
  const paraGanar = (mejorDe + 1) / 2

  const errores = []
  const setsGanados = { local: 0, visitante: 0 }
  const resultado = () => {
    const valido = errores.length === 0
    const ganador = valido ? (setsGanados.local > setsGanados.visitante ? 'LOCAL' : 'VISITANTE') : null
    return { valido, ganador, setsGanados, errores }
  }

  if (!Array.isArray(sets) || sets.length === 0) {
    errores.push({ set: null, motivo: 'Falta cargar el resultado de los sets' })
    return resultado()
  }

  sets.forEach((s, i) => {
    const numero = i + 1
    if (numero > mejorDe) {
      errores.push({ set: numero, motivo: `Un partido al mejor de ${mejorDe} sets tiene como máximo ${mejorDe} sets` })
      return
    }
    if (setsGanados.local === paraGanar || setsGanados.visitante === paraGanar) {
      errores.push({ set: numero, motivo: 'El partido ya estaba definido: este set sobra' })
      return
    }
    if (!esJuegos(s?.local) || !esJuegos(s?.visitante)) {
      errores.push({ set: numero, motivo: 'Los games tienen que ser números enteros, 0 o más' })
      return
    }

    const decisivoSuper = superTiebreak && numero === mejorDe
    const motivo = decisivoSuper ? motivoSuperTiebreak(s.local, s.visitante) : motivoSetComun(s.local, s.visitante)
    if (motivo) {
      errores.push({ set: numero, motivo })
      return
    }
    setsGanados[s.local > s.visitante ? 'local' : 'visitante']++
  })

  // Si los sets cargados están bien pero nadie llegó a ganar, el partido está incompleto
  if (errores.length === 0 && setsGanados.local < paraGanar && setsGanados.visitante < paraGanar) {
    errores.push({ set: null, motivo: `El partido no está definido: hace falta que alguien gane ${paraGanar} sets` })
  }
  return resultado()
}
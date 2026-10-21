// Cuadro de eliminación directa (CU 3.4 · paso 3). Funciones puras: no tocan la base ni leen nada de afuera,
// así se pueden probar solas y reutilizar (M3-BE-14 las usa para el cuadro del torneo y CU 3.9 para la fase
// eliminatoria que sale de las zonas).
//
// Forma del resultado (cada partido se corresponde con una fila de la tabla `partido`):
//   { tamano, participantes, byes, rondas: [{ ronda, instancia, partidos: [{
//       ronda, posicion, instancia,
//       local, visitante,            // id del participante, o null si todavía no se sabe (o es el bye)
//       esBye, ganador,              // en un bye, `ganador` ya es el participante que avanza
//       siguiente: { ronda, posicion, ranura: 'LOCAL' | 'VISITANTE' } | null   // adónde va el ganador
//   }] }] }

const INSTANCIAS = ['FINAL', 'SEMIFINAL', 'CUARTOS', 'OCTAVOS', 'DIECISEISAVOS']

// 5 → 8, 8 → 8, 13 → 16
export const siguientePotenciaDe2 = (n) => {
  let tamano = 1
  while (tamano < n) tamano *= 2
  return tamano
}

// Orden estándar de las posiciones de un cuadro: a cada lugar le corresponde el número de semilla que va ahí.
// Para 8: [1, 8, 4, 5, 3, 6, 2, 7]. Lugares contiguos de a dos forman un partido de primera ronda (1-8, 4-5, 3-6, 2-7),
// la 1 y la 2 quedan en mitades opuestas (solo se cruzan en la final) y las cuatro primeras en cuartos distintos.
export const posicionesEstandar = (tamano) => {
  let orden = [1]
  while (orden.length < tamano) {
    const total = orden.length * 2
    orden = orden.flatMap((semilla) => [semilla, total + 1 - semilla])
  }
  return orden
}

// Nombre de la ronda según cuántas faltan para la final (la base solo tiene hasta DIECISEISAVOS, o sea 32 lugares)
const instanciaDe = (rondasTotales, ronda) => INSTANCIAS[rondasTotales - ronda] ?? null

// Mezcla una copia del arreglo (Fisher-Yates). `aleatorio` devuelve un número en [0, 1) y se puede inyectar para probar.
const mezclar = (lista, aleatorio) => {
  const copia = [...lista]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

// Arma todas las rondas a partir de los lugares de la primera ronda (arreglo de largo potencia de 2 con el id del
// participante o `null` si es un bye). Encadena cada partido con el siguiente y hace avanzar a quien tiene bye.
// Es la parte que reutiliza CU 3.9 con los clasificados de las zonas.
export const encadenarRondas = (lugares) => {
  const tamano = lugares.length
  const rondasTotales = Math.log2(tamano)
  if (!Number.isInteger(rondasTotales) || rondasTotales < 1) throw new Error('El cuadro necesita una cantidad de lugares potencia de 2')

  const rondas = []
  for (let ronda = 1; ronda <= rondasTotales; ronda++) {
    const cantidad = tamano / 2 ** ronda
    const partidos = Array.from({ length: cantidad }, (_, i) => ({
      ronda,
      posicion: i + 1,
      instancia: instanciaDe(rondasTotales, ronda),
      local: null,
      visitante: null,
      esBye: false,
      ganador: null,
      siguiente: ronda < rondasTotales ? { ronda: ronda + 1, posicion: Math.ceil((i + 1) / 2), ranura: i % 2 === 0 ? 'LOCAL' : 'VISITANTE' } : null,
    }))
    rondas.push({ ronda, instancia: instanciaDe(rondasTotales, ronda), partidos })
  }

  // Primera ronda: dos lugares contiguos por partido. Con un bye, el participante queda de local y avanza solo.
  rondas[0].partidos.forEach((partido, i) => {
    const [a, b] = [lugares[2 * i], lugares[2 * i + 1]]
    if (a !== null && b !== null) {
      partido.local = a
      partido.visitante = b
    } else {
      partido.local = a ?? b
      partido.esBye = true
      partido.ganador = partido.local
    }
  })

  // El que tiene bye ocupa su lugar en la segunda ronda
  for (const partido of rondas[0].partidos) {
    if (!partido.esBye || !partido.siguiente) continue
    const destino = rondas[1].partidos[partido.siguiente.posicion - 1]
    destino[partido.siguiente.ranura === 'LOCAL' ? 'local' : 'visitante'] = partido.ganador
  }

  return rondas
}

// participantes: [{ id, cabezaDeSerie }] ya ordenados por ranking (como los entrega GET /torneos/:id/cabezas-de-serie).
// Las cabezas de serie toman las semillas 1, 2, 3… en ese orden; el resto se sortea en los lugares que quedan.
// Los byes (tamaño − participantes) los reciben primero las semillas más altas, o sea las cabezas de serie por orden,
// y si sobran, quienes salieron sorteados con las semillas siguientes. Nunca hay un bye contra otro bye.
export const generarEliminacion = (participantes, { aleatorio = Math.random } = {}) => {
  const n = participantes.length
  if (n < 2) throw new Error('Hacen falta al menos 2 participantes')
  if (new Set(participantes.map((p) => p.id)).size !== n) throw new Error('Hay participantes repetidos')

  const tamano = siguientePotenciaDe2(n)
  const cabezas = participantes.filter((p) => p.cabezaDeSerie)
  const resto = mezclar(participantes.filter((p) => !p.cabezaDeSerie), aleatorio)

  // Semilla 1..n → participante; las semillas n+1..tamano no existen: son los byes
  const porSemilla = [...cabezas, ...resto].map((p) => p.id)
  const lugares = posicionesEstandar(tamano).map((semilla) => porSemilla[semilla - 1] ?? null)

  return {
    tamano,
    participantes: n,
    byes: tamano - n,
    rondas: encadenarRondas(lugares),
  }
}
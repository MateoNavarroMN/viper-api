// Fase eliminatoria de un torneo con zonas (CU 3.9 · pasos 3 a 5). Función pura: no toca la base ni lee nada de afuera,
// así se prueba sola. M3-BE-22 la usa con las tablas de posiciones ya cerradas (las que guarda M3-BE-17 en
// `posicion_zona`) y después guarda los partidos y programa la primera ronda.
//
// zonas: [{ id, posiciones: [{ inscripcionId, posicion, partidosGanados, setsGanados, setsPerdidos, gamesGanados, gamesPerdidos }] }]
//   - `posicion` es la de la tabla de la zona (1 = primero). Tiene que estar resuelta: los empates se desempatan antes (3a).
//   - Las estadísticas son opcionales: solo sirven para ordenar entre sí a los primeros de zona (la semilla 1 es el mejor).
// clasificanPorZona: cuántos pasan de cada zona (1 o 2 en la práctica).
//
// Devuelve { tamano, participantes, byes, clasificados, conflictos, rondas }:
//   - rondas: la misma forma que `generarEliminacion` (M3-BE-09), con el id de la inscripción de cada participante.
//   - clasificados: [{ inscripcionId, zonaId, posicion, semilla }] en orden de semilla.
//   - conflictos: cruces de primera ronda entre dos de la misma zona que no se pudieron evitar (casi siempre vacío).

import { encadenarRondas, posicionesEstandar, siguientePotenciaDe2 } from './algoritmo.eliminacion.torneos.js'

// Cuántos cruces de primera ronda juntan a dos de la misma zona (los byes no cuentan: no hay rival)
const cruzadosDeLaMismaZona = (lugares) => {
  const cruces = []
  for (let i = 0; i < lugares.length; i += 2) {
    const [a, b] = [lugares[i], lugares[i + 1]]
    if (a && b && a.zona === b.zona) cruces.push(i / 2)
  }
  return cruces
}

// Compara dos costos en orden: gana el que tiene menos en el primer valor distinto
const esMenor = (a, b) => {
  const k = a.findIndex((valor, i) => valor !== b[i])
  return k !== -1 && a[k] < b[k]
}

// Deshace los cruces de la misma zona cambiando de lugar a participantes que juegan partido de primera ronda (nunca a quien
// tiene bye, así los byes siguen siendo de las mejores semillas). Elige el cambio que más cruces arregla y, entre esos, el que
// menos mueve a la gente: primero dentro de la misma posición de zona (un 2° por otro 2°) y, si no alcanza, el más cercano.
const evitarCrucesDeLaMismaZona = (lugares) => {
  let cruces = cruzadosDeLaMismaZona(lugares)
  while (cruces.length > 0) {
    let mejor = null
    for (const partido of cruces) {
      // De los dos del partido se mueve el de peor semilla
      const mover = lugares[2 * partido].semilla > lugares[2 * partido + 1].semilla ? 2 * partido : 2 * partido + 1
      for (let otro = 0; otro < lugares.length; otro++) {
        if (otro >> 1 === partido || !lugares[otro] || !lugares[otro ^ 1]) continue
        const prueba = [...lugares]
        ;[prueba[mover], prueba[otro]] = [prueba[otro], prueba[mover]]
        const restantes = cruzadosDeLaMismaZona(prueba).length
        if (restantes >= cruces.length) continue
        const costo = [restantes, Math.abs(lugares[mover].tier - lugares[otro].tier), Math.abs(lugares[mover].semilla - lugares[otro].semilla)]
        if (!mejor || esMenor(costo, mejor.costo)) mejor = { prueba, costo }
      }
    }
    if (!mejor) break
    lugares = mejor.prueba
    cruces = cruzadosDeLaMismaZona(lugares)
  }
  return lugares
}

export const armarEliminatoriaDesdeZonas = (zonas, clasificanPorZona) => {
  if (!Array.isArray(zonas) || zonas.length === 0) throw new Error('Hacen falta zonas')
  if (!Number.isInteger(clasificanPorZona) || clasificanPorZona < 1) throw new Error('Tienen que clasificar al menos 1 por zona')

  // 1. Los que pasan de cada zona, con su posición dentro de la zona
  const clasificados = []
  zonas.forEach((zona, indice) => {
    const tabla = zona.posiciones ?? []
    if (tabla.some((p) => !Number.isInteger(p.posicion))) throw new Error(`La tabla de la zona ${zona.id ?? indice + 1} no está cerrada`)
    ;[...tabla]
      .sort((a, b) => a.posicion - b.posicion)
      .slice(0, clasificanPorZona)
      .forEach((p, tier) => clasificados.push({
        id: p.inscripcionId,
        zona: indice,
        zonaId: zona.id ?? null,
        tier,
        posicion: p.posicion,
        ganados: p.partidosGanados ?? 0,
        dif: [(p.setsGanados ?? 0) - (p.setsPerdidos ?? 0), (p.gamesGanados ?? 0) - (p.gamesPerdidos ?? 0)],
      }))
  })
  const n = clasificados.length
  if (n < 2) throw new Error('Hacen falta al menos 2 clasificados')
  if (new Set(clasificados.map((c) => c.id)).size !== n) throw new Error('Hay clasificados repetidos')

  // 2. Semillas: primero todos los primeros de zona (el mejor, 1), después todos los segundos, etc. A igualdad, la zona de más arriba.
  clasificados
    .sort((a, b) => a.tier - b.tier || b.ganados - a.ganados || b.dif[0] - a.dif[0] || b.dif[1] - a.dif[1] || a.zona - b.zona)
    .forEach((c, i) => { c.semilla = i + 1 })

  // 3. Lugares del cuadro: la semilla k ocupa su lugar estándar; las que sobran son byes de las mejores semillas
  const tamano = siguientePotenciaDe2(n)
  const lugares = evitarCrucesDeLaMismaZona(posicionesEstandar(tamano).map((semilla) => clasificados[semilla - 1] ?? null))

  const conflictos = cruzadosDeLaMismaZona(lugares).map((i) => ({
    posicion: i + 1,
    zonaId: lugares[2 * i].zonaId,
    local: lugares[2 * i].id,
    visitante: lugares[2 * i + 1].id,
  }))

  return {
    tamano,
    participantes: n,
    byes: tamano - n,
    clasificados: clasificados.map((c) => ({ inscripcionId: c.id, zonaId: c.zonaId, posicion: c.posicion, semilla: c.semilla })),
    conflictos,
    rondas: encadenarRondas(lugares.map((c) => c?.id ?? null)),
  }
}
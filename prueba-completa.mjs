import { generarEliminacion, posicionesEstandar, encadenarRondas } from './src/modulos/torneos/algoritmo.eliminacion.torneos.js'
let fallos = 0, casos = 0
const falla = (m) => { fallos++; if (fallos < 15) console.log('FALLA', m) }
// RNG determinista
let semilla = 12345; const rng = () => (semilla = (semilla * 1664525 + 1013904223) % 4294967296) / 4294967296
const meet = (i, j) => { let r = 1; while (Math.floor(i / 2 ** r) !== Math.floor(j / 2 ** r)) r++; return r } // ronda en que se cruzan los lugares i y j
for (let n = 2; n <= 64; n++) {
  const maxCab = Math.max(0, Math.floor(siguiente(n) / 4))
  for (const k of new Set([0, 1, 2, 3, 4, Math.min(maxCab, 8), maxCab].filter((x) => x <= n))) {
    for (let rep = 0; rep < 20; rep++) {
      casos++
      const parts = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, cabezaDeSerie: i < k }))
      const c = generarEliminacion(parts, { aleatorio: rng })
      const N = c.tamano, R = Math.log2(N)
      const r1 = c.rondas[0].partidos
      if (c.rondas.length !== R || r1.length !== N / 2) falla(`${n}: forma`)
      // todos una vez en la primera ronda
      const vistos = r1.flatMap((p) => [p.local, p.visitante]).filter(Boolean)
      if (vistos.length !== n || new Set(vistos).size !== n) falla(`${n}: participantes en ronda 1`)
      // byes
      const byes = r1.filter((p) => p.esBye)
      if (byes.length !== N - n || c.byes !== N - n) falla(`${n}: cantidad de byes`)
      for (const p of r1) {
        if (!p.local && !p.visitante) falla(`${n}: bye contra bye`)
        if (p.esBye && (p.visitante !== null || p.ganador !== p.local)) falla(`${n}: bye mal formado`)
        if (!p.esBye && (!p.local || !p.visitante || p.ganador)) falla(`${n}: partido normal mal formado`)
      }
      // encadenado: cada partido de ronda r+1 recibe exactamente 2 alimentadores, uno LOCAL y otro VISITANTE
      for (let r = 0; r < R - 1; r++) {
        const recibidos = {}
        for (const p of c.rondas[r].partidos) { const s = p.siguiente; const k2 = `${s.posicion}`; (recibidos[k2] ??= []).push(s.ranura) }
        for (const [pos, ranuras] of Object.entries(recibidos)) if (ranuras.length !== 2 || new Set(ranuras).size !== 2) falla(`${n}: encadenado ronda ${r + 1} pos ${pos}`)
        if (Object.keys(recibidos).length !== c.rondas[r + 1].partidos.length) falla(`${n}: destinos`)
      }
      if (c.rondas[R - 1].partidos[0].siguiente !== null || c.rondas[R - 1].partidos[0].instancia !== 'FINAL') falla(`${n}: final`)
      // el que tiene bye ya está en la ronda 2
      if (R > 1) for (const p of byes) { const d = c.rondas[1].partidos[p.siguiente.posicion - 1]; if (d[p.siguiente.ranura === 'LOCAL' ? 'local' : 'visitante'] !== p.ganador) falla(`${n}: bye no avanzó`) }
      // posiciones de las cabezas
      const lugar = (id) => { const i = r1.findIndex((p) => p.local === id || p.visitante === id); return 2 * i + (r1[i].visitante === id ? 1 : 0) }
      const lug = Array.from({ length: Math.min(k, 4) }, (_, i) => lugar(`p${i + 1}`))
      if (k >= 2 && n >= 4 && R >= 2 && meet(lug[0], lug[1]) !== R) falla(`${n} k=${k}: 1 y 2 se cruzan antes de la final`)
      for (let a = 0; a < lug.length; a++) for (let b = a + 1; b < lug.length; b++) if (R >= 2 && meet(lug[a], lug[b]) < R - 1) falla(`${n} k=${k}: semillas ${a + 1} y ${b + 1} se cruzan antes de semifinales`)
      // byes primero a las cabezas
      for (let s = 1; s <= Math.min(k, N - n); s++) { const p = r1.find((x) => x.local === `p${s}`); if (!p.esBye) falla(`${n} k=${k}: la cabeza ${s} no tiene bye`) }
      if (k > N - n) { /* las cabezas sin bye jamás se enfrentan entre sí si son ≤ 2 */ }
    }
  }
}
function siguiente(n) { let t = 1; while (t < n) t *= 2; return t }
console.log(`${casos} cuadros generados, ${fallos} fallas`)
console.log('posiciones 8:', posicionesEstandar(8).join(','), '| 16:', posicionesEstandar(16).join(','))
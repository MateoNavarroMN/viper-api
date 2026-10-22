import { generarZonas, tamanosDeZonas, fixtureTodosContraTodos } from './src/modulos/torneos/algoritmo.zonas.torneos.js'
let fallos = 0, casos = 0, desbalanceMax = 0
const falla = (m) => { fallos++; if (fallos < 15) console.log('FALLA', m) }
let semilla = 99; const rng = () => (semilla = (semilla * 1664525 + 1013904223) % 4294967296) / 4294967296
for (let n = 6; n <= 40; n++) {
  const zs = Math.ceil(n / 4)
  for (const k of new Set([0, 1, 2, Math.floor(zs / 2), zs])) {
    for (let rep = 0; rep < 15; rep++) {
      casos++
      const parts = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, cabezaDeSerie: i < k }))
      const { zonas } = generarZonas(parts, { aleatorio: rng })
      if (zonas.length !== zs) falla(`${n}: cantidad de zonas`)
      const tam = zonas.map((z) => z.participantes.length)
      if (tam.some((t) => t < 3 || t > 4)) falla(`${n}: tamaño fuera de 3..4 ${tam}`)
      if (Math.max(...tam) - Math.min(...tam) > 1) falla(`${n}: reparto desparejo ${tam}`)
      if (tam.reduce((a, b) => a + b, 0) !== n) falla(`${n}: suma`)
      const todos = zonas.flatMap((z) => z.participantes)
      if (new Set(todos).size !== n) falla(`${n}: participante repetido o faltante`)
      // cabezas en zonas distintas
      zonas.forEach((z) => { if (z.participantes.filter((id) => parts.find((p) => p.id === id).cabezaDeSerie).length > 1) falla(`${n} k=${k}: dos cabezas en ${z.nombre}`) })
      for (let i = 0; i < k; i++) if (!zonas[i].participantes.includes(`p${i + 1}`)) falla(`${n}: la cabeza ${i + 1} no está en su zona`)
      // fixture
      zonas.forEach((z) => {
        const s = z.participantes.length
        const pares = new Set()
        const porRonda = {}
        const lados = {}
        for (const p of z.partidos) {
          const clave = [p.local, p.visitante].sort().join('|')
          if (pares.has(clave)) falla(`${n} ${z.nombre}: par repetido`)
          pares.add(clave)
          if (!z.participantes.includes(p.local) || !z.participantes.includes(p.visitante) || p.local === p.visitante) falla(`${n}: partido inválido`)
          ;(porRonda[p.ronda] ??= []).push(p)
          lados[p.local] = (lados[p.local] ?? 0) + 1; lados[p.visitante] = (lados[p.visitante] ?? 0) - 1
        }
        if (pares.size !== s * (s - 1) / 2 || z.partidos.length !== pares.size) falla(`${n} ${z.nombre}: cantidad de partidos`)
        const rondas = Object.keys(porRonda).length
        if (rondas !== (s % 2 === 0 ? s - 1 : s)) falla(`${n} ${z.nombre}: cantidad de fechas ${rondas}`)
        for (const [r, ps] of Object.entries(porRonda)) {
          const jug = ps.flatMap((p) => [p.local, p.visitante])
          if (new Set(jug).size !== jug.length) falla(`${n} ${z.nombre}: alguien juega dos veces en la fecha ${r}`)
          ps.forEach((p, i) => { if (p.posicion !== i + 1) falla(`${n}: posiciones de la fecha`) })
        }
        desbalanceMax = Math.max(desbalanceMax, ...Object.values(lados).map(Math.abs)); if (Math.max(...Object.values(lados).map(Math.abs)) > 1) falla(`${n} ${z.nombre}: local/visitante desparejo`)
      })
    }
  }
}
console.log(`${casos} torneos generados, ${fallos} fallas, desbalance máximo de local/visitante: ${desbalanceMax}`)
console.log('tamaños:', [6, 7, 8, 9, 10, 11, 12, 13, 16, 32].map((n) => `${n}→${tamanosDeZonas(n).join('+')}`).join('  '))
for (const n of [5, 3]) { try { tamanosDeZonas(n) } catch (e) { console.log(`${n} → error: ${e.message}`) } }
import { generarZonas } from './src/modulos/torneos/algoritmo.zonas.torneos.js'
let s = 3; const rng = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296
const mostrar = (n, k) => {
  const parts = Array.from({ length: n }, (_, i) => ({ id: (i < k ? 'S' : 'J') + (i + 1), cabezaDeSerie: i < k }))
  const { zonas } = generarZonas(parts, { aleatorio: rng })
  console.log(`\n${n} participantes, ${k} cabezas → ${zonas.map((z) => z.participantes.length).join('+')}`)
  for (const z of zonas) {
    console.log(`  ${z.nombre}: ${z.participantes.join(', ')}`)
    const rondas = [...new Set(z.partidos.map((p) => p.ronda))]
    console.log('    ' + rondas.map((r) => `F${r}: ` + z.partidos.filter((p) => p.ronda === r).map((p) => `${p.local}-${p.visitante}`).join(' / ')).join('   '))
  }
}
for (const [n, k] of [[6, 0], [7, 2], [10, 3], [13, 4]]) mostrar(n, k)
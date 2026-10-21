import { generarEliminacion } from './src/modulos/torneos/algoritmo.eliminacion.torneos.js'
let s = 7; const rng = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296
const mostrar = (n, k) => {
  const parts = Array.from({ length: n }, (_, i) => ({ id: (i < k ? 'S' : 'J') + (i + 1), cabezaDeSerie: i < k }))
  const c = generarEliminacion(parts, { aleatorio: rng })
  console.log(`\n${n} participantes, ${k} cabezas → cuadro de ${c.tamano}, ${c.byes} byes`)
  for (const r of c.rondas) console.log(`  ${r.instancia.padEnd(8)}`, r.partidos.map((p) => `${p.local ?? '·'} ${p.esBye ? '(bye)' : 'vs ' + (p.visitante ?? '·')}`).join('   |   '))
}
for (const [n, k] of [[4, 0], [4, 2], [5, 0], [5, 2], [8, 2], [8, 4], [13, 0], [13, 4], [16, 4]]) mostrar(n, k)
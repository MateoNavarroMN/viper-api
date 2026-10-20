import ModuleInfoPage from '../components/ModuleInfoPage'

const pasos = [
  { titulo: 'Registra los partidos', desc: 'Cada partido oficial del club suma al historial de cada jugador.' },
  { titulo: 'Puntos al instante', desc: 'Un motor de reglas calcula y actualiza los puntos al terminar cada partido.' },
  { titulo: 'Categorías al día', desc: 'La categoría de cada jugador se ajusta automáticamente según su posición en el ranking.' },
]

export default function RankingInfo() {
  return (
    <ModuleInfoPage
      titulo="Ranking"
      resaltado="Dinámico."
      descripcion="Motor de reglas que actualiza en tiempo real los puntos y la categoría de cada jugador tras cada partido."
      pasos={pasos}
    />
  )
}

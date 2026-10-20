import ModuleInfoPage from '../components/ModuleInfoPage'

const pasos = [
  { titulo: 'Configura tus canchas', desc: 'Carga las canchas de tenis y pádel del club y consulta su disponibilidad en una grilla en tiempo real.' },
  { titulo: 'Recibe reservas', desc: 'Socios y jugadores eligen su turno. El sistema evita solapamientos automáticamente.' },
  { titulo: 'Confirma y administra', desc: 'Cada reserva queda confirmada y visible para el club, sin planillas ni llamadas cruzadas.' },
]

export default function ReservasInfo() {
  return (
    <ModuleInfoPage
      titulo="Gestión de"
      resaltado="Reservas."
      descripcion="Motor de reservas con grilla en tiempo real que evita solapamientos en las canchas de tenis y pádel de tu club."
      pasos={pasos}
    />
  )
}

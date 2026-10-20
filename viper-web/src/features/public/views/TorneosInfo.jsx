import ModuleInfoPage from '../components/ModuleInfoPage'

const pasos = [
  { titulo: 'Abre la inscripción', desc: 'Publica el torneo de tu club y recibe inscripciones desde la plataforma, de jugadores del club o independientes.' },
  { titulo: 'Genera los cruces', desc: 'El sistema genera las llaves de competencia (brackets) y asigna los horarios de forma automática.' },
  { titulo: 'Sigue el torneo', desc: 'Los resultados actualizan el torneo y el ranking hasta la final, sin carga manual.' },
]

export default function TorneosInfo() {
  return (
    <ModuleInfoPage
      titulo="Logística de"
      resaltado="Torneos."
      descripcion="Tu club organiza torneos con llaves de competencia (brackets) y horarios generados de forma automática."
      pasos={pasos}
    />
  )
}

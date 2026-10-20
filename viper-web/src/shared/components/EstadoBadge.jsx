import Badge from './Badge'
import { ESTADOS } from '../utils/estados'

// Badge de un estado del sistema. tipo: 'torneo' | 'inscripcion' | 'pago' | 'partido'
//   <EstadoBadge tipo="torneo" estado="INSCRIPCIONES_ABIERTAS" />
export default function EstadoBadge({ tipo, estado }) {
  const { texto, variante } = ESTADOS[tipo]?.[estado] ?? { texto: estado, variante: 'neutro' }
  return <Badge variante={variante}>{texto}</Badge>
}
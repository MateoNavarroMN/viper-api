// Texto y color de cada estado (Anexo B del plan). Si aparece un estado nuevo, se agrega acá.
export const ESTADOS = {
  torneo: {
    PLANIFICADO: { texto: 'Planificado', variante: 'neutro' },
    INSCRIPCIONES_ABIERTAS: { texto: 'Inscripciones abiertas', variante: 'exito' },
    INSCRIPCIONES_CERRADAS: { texto: 'Inscripciones cerradas', variante: 'advertencia' },
    EN_CURSO: { texto: 'En curso', variante: 'info' },
    FINALIZADO: { texto: 'Finalizado', variante: 'violeta' },
    ARCHIVADO: { texto: 'Archivado', variante: 'neutro' },
    CANCELADO: { texto: 'Cancelado', variante: 'error' },
  },
  inscripcion: {
    ACTIVA: { texto: 'Activa', variante: 'exito' },
    ANULADA: { texto: 'Anulada', variante: 'error' },
  },
  pago: {
    PENDIENTE: { texto: 'Pago pendiente', variante: 'advertencia' },
    PAGADO: { texto: 'Pagado', variante: 'exito' },
  },
  partido: {
    PENDIENTE: { texto: 'Pendiente', variante: 'neutro' },
    PROGRAMADO: { texto: 'Programado', variante: 'info' },
    FINALIZADO: { texto: 'Finalizado', variante: 'exito' },
    WO: { texto: 'W.O.', variante: 'advertencia' },
  },
}
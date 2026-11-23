// Nombres que se ven en los informes (Excel y PDF) y en los nombres de los archivos.
export const ETIQUETA_RUBRO = {
  TIENDA: 'Tienda',
  RESERVA: 'Reserva',
  INSCRIPCION: 'Inscripción',
  CUOTA: 'Cuota',
  PROVEEDOR: 'Proveedor',
  SERVICIOS: 'Servicios',
  OTRO: 'Otro',
}

export const ETIQUETA_MEDIO = { EFECTIVO: 'Efectivo', TRANSFERENCIA: 'Transferencia', MERCADO_PAGO: 'Mercado Pago' }

export const ETIQUETA_TIPO = { INGRESO: 'Ingreso', EGRESO: 'Egreso' }

// '2026-11-01' → '01/11/2026'
export const fechaEscrita = (fecha) => fecha.split('-').reverse().join('/')

// Texto del filtro de rubro: «Todos los rubros» o el nombre del rubro
export const rubroEscrito = (rubro) => (rubro ? ETIQUETA_RUBRO[rubro] : 'Todos los rubros')
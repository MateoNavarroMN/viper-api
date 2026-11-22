import { comunicadosVigentes, situacionDeSocios, torneosVigentes } from './modelo.vigentes.dashboard.js'

// Cada bloque del panel es un endpoint propio (solo Administrador): si uno falla, el resto del panel sigue funcionando.
const bloque = (leer, mensajeDeError) => async (req, res) => {
  try {
    return res.status(200).json(await leer())
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: mensajeDeError })
  }
}

// GET /api/dashboard/torneos
// Torneos vigentes (planificados, con inscripciones abiertas o cerradas y en curso) con su cupo ocupado y las inscripciones con pago pendiente.
// Sin torneos vigentes: `sinTorneos: true` y lista vacía.
export const torneos = bloque(torneosVigentes, 'No se pudieron obtener los torneos')

// GET /api/dashboard/socios
// Socios activos, cuántos están al día y cuántos adeudan, cuotas vencidas y monto adeudado. Sin socios activos: todo en cero.
export const socios = bloque(situacionDeSocios, 'No se pudo obtener la situación de los socios')

// GET /api/dashboard/comunicados
// Comunicados publicados y vigentes en la cartelera (los 5 más recientes y el total).
export const comunicados = bloque(comunicadosVigentes, 'No se pudieron obtener los comunicados')
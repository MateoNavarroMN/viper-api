import { RESERVAS_POR_PAGINA, listarReservasDeCliente } from './modelo.mis.reservas.js'

const VISTAS = ['proximas', 'historial']

// GET /api/mis-reservas?vista=proximas|historial&pagina=1  (solo JUGADOR)
// Las reservas del propio Jugador (las que pidió y las de sus alquileres fijos), de a 10 por página.
//   { vista, pagina, porPagina, total, totalPaginas, reservas: [{ id, cancha, fecha, horaInicio, horaFin, tipo, estado,
//     precioAplicado, expiracionPago, contrato, acciones }] }
export const listarMias = async (req, res) => {
  const vista = req.query.vista ?? 'proximas'
  if (!VISTAS.includes(vista)) {
    return res.status(400).json({ mensaje: 'La vista tiene que ser «proximas» o «historial»', campo: 'vista' })
  }
  const pagina = req.query.pagina === undefined ? 1 : Number(req.query.pagina)
  if (!Number.isInteger(pagina) || pagina < 1) {
    return res.status(400).json({ mensaje: 'La página tiene que ser un número entero desde 1', campo: 'pagina' })
  }

  try {
    const { total, reservas } = await listarReservasDeCliente(req.usuario.id, { vista, pagina })
    return res.status(200).json({
      vista,
      pagina,
      porPagina: RESERVAS_POR_PAGINA,
      total,
      totalPaginas: Math.max(1, Math.ceil(total / RESERVAS_POR_PAGINA)),
      reservas,
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudieron obtener tus reservas' })
  }
}
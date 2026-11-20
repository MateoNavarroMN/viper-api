import { buscarOrigenesPendientes } from './modelo.origenes.caja.js'

const CONCEPTOS = ['RESERVA', 'INSCRIPCION', 'CUOTA']
const BUSQUEDA_MINIMA = 2
const BUSQUEDA_MAXIMA = 100

const invalido = (res, mensaje, campo) => res.status(400).json({ mensaje: `Parámetro inválido: ${mensaje}`, campo })

// GET /api/caja/origenes-pendientes?q=&concepto=RESERVA|INSCRIPCION|CUOTA  (Recepcionista y Administrador)
// Busca al cliente por nombre, apellido o DNI y devuelve sus reservas, inscripciones y cuotas pendientes de cobro:
// { clientes: [{ id, nombre, apellido, dni, origenes: [{ tipo, id, descripcion, monto, venceEn, vencida }] }], hayMas }.
// Sin coincidencias, o si el cliente no debe nada, es una lista vacía (200), no un error.
export const origenesPendientes = async (req, res) => {
  const { q, concepto } = req.query
  if (typeof q !== 'string' || q.trim().length < BUSQUEDA_MINIMA) return invalido(res, `escribí al menos ${BUSQUEDA_MINIMA} caracteres para buscar al cliente`, 'q')
  if (q.trim().length > BUSQUEDA_MAXIMA) return invalido(res, `la búsqueda admite hasta ${BUSQUEDA_MAXIMA} caracteres`, 'q')
  if (concepto !== undefined && !CONCEPTOS.includes(concepto)) return invalido(res, `el concepto debe ser ${CONCEPTOS.join(', ')}`, 'concepto')

  try {
    return res.status(200).json(await buscarOrigenesPendientes({ q: q.trim(), concepto }))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudieron obtener los pendientes de cobro' })
  }
}
import { altaSocio } from './modelo.alta.socios.js'

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Cómo responde cada error de categoría de `asignarCategoria`
export const ERRORES_CATEGORIA = {
  CATEGORIA_INEXISTENTE: [400, 'La categoría no existe'],
  CATEGORIA_OTRA_DISCIPLINA: [400, 'La categoría no corresponde a la disciplina'],
  CATEGORIA_INFERIOR_CON_PUNTOS: [409, 'El jugador ya tiene puntos de torneos que lo ubican en una categoría superior'],
}

// POST /api/socios  (CU 4.1 · pasos 8 a 11, Recepcionista y Administrador)
// Body: { jugadorId, categorias: { TENIS, PADEL }, reactivar? }
// 201 si crea el socio; 200 si reactiva a uno dado de baja (con `reactivar: true`).
export const crear = async (req, res) => {
  const { jugadorId, categorias, reactivar } = req.body ?? {}

  // 9a · datos inválidos
  if (typeof jugadorId !== 'string' || !REGEX_UUID.test(jugadorId)) {
    return res.status(400).json({ mensaje: 'Datos inválidos: elegí un jugador', campo: 'jugadorId' })
  }
  for (const disciplina of ['TENIS', 'PADEL']) {
    const id = categorias?.[disciplina]
    if (typeof id !== 'string' || !REGEX_UUID.test(id)) {
      return res.status(400).json({ mensaje: `Datos inválidos: elegí la categoría de ${disciplina === 'TENIS' ? 'Tenis' : 'Pádel'}`, campo: `categorias.${disciplina}` })
    }
  }

  try {
    const r = await altaSocio({ jugadorId, categorias, reactivar: reactivar === true })

    if (r.resultado === 'JUGADOR_NO_ENCONTRADO') return res.status(404).json({ mensaje: 'Jugador no encontrado', campo: 'jugadorId' })
    if (r.resultado === 'YA_ES_SOCIO') return res.status(409).json({ mensaje: 'Esa persona ya es socia del club' }) // 9b
    if (r.resultado === 'SOCIO_EN_BAJA') { // 9c
      return res.status(409).json({ mensaje: 'El jugador figura como socio dado de baja', codigo: 'SOCIO_EN_BAJA', socioId: r.socioId })
    }
    if (r.resultado === 'CATEGORIA') {
      const [estado, mensaje] = ERRORES_CATEGORIA[r.codigo] ?? [500, 'No se pudo asignar la categoría']
      return res.status(estado).json({ mensaje, campo: `categorias.${r.disciplina}` })
    }
    if (r.resultado === 'REACTIVADO') return res.status(200).json({ mensaje: 'Socio reactivado', socio: r.socio })
    return res.status(201).json({ mensaje: 'Socio registrado', socio: r.socio })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo registrar al socio' })
  }
}
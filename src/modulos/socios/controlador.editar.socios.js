import { validarCambiosPerfil } from '../perfil/validaciones.perfil.js'
import { ERRORES_CATEGORIA } from './controlador.alta.socios.js'
import { editarSocio } from './modelo.editar.socios.js'
import { buscarSocioDetalle } from './modelo.consulta.socios.js'

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// PATCH /api/socios/:id  (CU 4.1 · A1, Recepcionista y Administrador)
// Body: { nombre?, apellido?, telefono?, categorias?: { TENIS?, PADEL? } }
// El DNI, el correo y el estado se ignoran: el DNI y el correo los cambia el Administrador desde Usuarios, y el estado
// solo cambia con la baja (POST /socios/:id/baja) y el alta con `reactivar`.
export const editar = async (req, res) => {
  const { id } = req.params
  if (!REGEX_UUID.test(id)) return res.status(404).json({ mensaje: 'Socio no encontrado' })

  const { nombre, apellido, telefono, categorias } = req.body ?? {}

  // A1 · datos inválidos
  const invalido = validarCambiosPerfil({ nombre, apellido, telefono })
  if (invalido) return res.status(400).json({ mensaje: `Datos inválidos: ${invalido.detalle}`, campo: invalido.campo })

  if (categorias !== undefined && (typeof categorias !== 'object' || categorias === null || Array.isArray(categorias))) {
    return res.status(400).json({ mensaje: 'Datos inválidos: las categorías no son válidas', campo: 'categorias' })
  }
  for (const disciplina of ['TENIS', 'PADEL']) {
    const valor = categorias?.[disciplina]
    if (valor !== undefined && (typeof valor !== 'string' || !REGEX_UUID.test(valor))) {
      return res.status(400).json({ mensaje: 'Datos inválidos: la categoría no es válida', campo: `categorias.${disciplina}` })
    }
  }

  try {
    const cambios = {
      nombre: nombre?.trim(),
      apellido: apellido?.trim(),
      // Vacío o null borra el teléfono
      telefono: telefono === undefined ? undefined : (telefono?.trim() || null),
      categorias,
    }
    const r = await editarSocio(id, cambios)

    if (r.resultado === 'NO_ENCONTRADO') return res.status(404).json({ mensaje: 'Socio no encontrado' })
    if (r.resultado === 'CATEGORIA') {
      const [estado, mensaje] = ERRORES_CATEGORIA[r.codigo] ?? [500, 'No se pudo asignar la categoría']
      return res.status(estado).json({ mensaje, campo: `categorias.${r.disciplina}` })
    }
    return res.status(200).json({ mensaje: 'Socio actualizado', socio: await buscarSocioDetalle(id) })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo actualizar al socio' })
  }
}
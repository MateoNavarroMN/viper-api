import { buscarPerfil } from '../usuarios/modelo.usuarios.js'
import { actualizarPerfil } from './modelo.perfil.js'
import { validarCambiosPerfil } from './validaciones.perfil.js'

// GET /api/perfil  (CU 1.3)
// `autenticar` ya cargó los datos del usuario (con su DNI si es jugador) en req.usuario.
export const obtenerPerfil = (req, res) => {
  res.status(200).json({ usuario: req.usuario })
}

// PATCH /api/perfil  (CU 1.3)
// Solo se pueden cambiar nombre, apellido y teléfono. Cualquier otro campo del body
// (email, dni, rol, estado...) se ignora: se leen los tres campos por nombre y nada más.
export const editarPerfil = async (req, res) => {
  const { nombre, apellido, telefono } = req.body ?? {}

  if (nombre === undefined && apellido === undefined && telefono === undefined) {
    return res.status(400).json({ mensaje: 'Datos inválidos: no se envió ningún dato para modificar' })
  }

  // 6a · datos inválidos
  const error = validarCambiosPerfil({ nombre, apellido, telefono })
  if (error) {
    return res.status(400).json({ mensaje: `Datos inválidos: ${error.detalle}`, campo: error.campo })
  }

  try {
    // Lo que no viene en el pedido se conserva tal cual
    const actual = req.usuario
    await actualizarPerfil(actual.id, {
      nombre: nombre === undefined ? actual.nombre : nombre.trim(),
      apellido: apellido === undefined ? actual.apellido : apellido.trim(),
      telefono: telefono === undefined ? actual.telefono : telefono ? telefono.trim() : null,
    })
    return res.status(200).json({
      mensaje: 'Perfil actualizado correctamente',
      usuario: await buscarPerfil(actual.id),
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo actualizar el perfil' })
  }
}
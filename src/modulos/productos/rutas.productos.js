import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { crear, darDeBaja, editar, listar, reactivar } from './controlador.productos.js'
import { recibirImagen } from './imagen.productos.js'

const router = Router()

// Se monta en /api/productos (ver app.js). Catálogo de la tienda: solo el Administrador.
router.get('/', autenticar, autorizar('ADMINISTRADOR'), listar)
// recibirImagen va después de autenticar: no se procesa un archivo de quien no tiene permiso
router.post('/', autenticar, autorizar('ADMINISTRADOR'), recibirImagen, crear)
router.patch('/:id', autenticar, autorizar('ADMINISTRADOR'), recibirImagen, editar)
router.post('/:id/baja', autenticar, autorizar('ADMINISTRADOR'), darDeBaja)
router.post('/:id/reactivar', autenticar, autorizar('ADMINISTRADOR'), reactivar)

export default router
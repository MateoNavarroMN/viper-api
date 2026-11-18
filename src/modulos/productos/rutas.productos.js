import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { crear, listar } from './controlador.productos.js'
import { recibirImagen } from './imagen.productos.js'

const router = Router()

// Se monta en /api/productos (ver app.js). Catálogo de la tienda: solo el Administrador.
router.get('/', autenticar, autorizar('ADMINISTRADOR'), listar)
// recibirImagen va después de autenticar: no se procesa un archivo de quien no tiene permiso
router.post('/', autenticar, autorizar('ADMINISTRADOR'), recibirImagen, crear)

export default router
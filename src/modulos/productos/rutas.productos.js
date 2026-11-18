import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { crear, listar } from './controlador.productos.js'

const router = Router()

// Se monta en /api/productos (ver app.js). Catálogo de la tienda: solo el Administrador.
router.get('/', autenticar, autorizar('ADMINISTRADOR'), listar)
router.post('/', autenticar, autorizar('ADMINISTRADOR'), crear)

export default router
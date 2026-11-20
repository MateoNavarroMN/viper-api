import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { productos } from './controlador.pos.js'

const router = Router()

// Se monta en /api/pos (ver app.js). Recepcionista y Administrador (el Administrador hereda el permiso del Recepcionista).
router.get('/productos', autenticar, autorizar('RECEPCIONISTA'), productos)

export default router
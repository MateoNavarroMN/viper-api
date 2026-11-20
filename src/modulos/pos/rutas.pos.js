import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { productos, registrarVentaPos } from './controlador.pos.js'

const router = Router()

// Se monta en /api/pos (ver app.js). Recepcionista y Administrador (el Administrador hereda el permiso del Recepcionista).
router.get('/productos', autenticar, autorizar('RECEPCIONISTA'), productos)
router.post('/ventas', autenticar, autorizar('RECEPCIONISTA'), registrarVentaPos)

export default router
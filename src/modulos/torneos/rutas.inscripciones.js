import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { confirmar } from './controlador.pago.inscripciones.js'

const router = Router()

// Se monta en /api/inscripciones (ver app.js). El Administrador pasa por los permisos que incluye.
router.post('/:id/confirmar-pago', autenticar, autorizar('RECEPCIONISTA'), confirmar)

export default router
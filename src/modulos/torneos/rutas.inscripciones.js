import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { torneoModificable } from '../../middlewares/torneo.middleware.js'
import { confirmar } from './controlador.pago.inscripciones.js'

const router = Router()

// Se monta en /api/inscripciones (ver app.js). Cobra la Recepción; el Organizador solo ve los inscriptos. El Administrador pasa por los permisos que incluye.
router.post('/:id/confirmar-pago', autenticar, autorizar('RECEPCIONISTA'), torneoModificable('inscripcion'), confirmar)

export default router
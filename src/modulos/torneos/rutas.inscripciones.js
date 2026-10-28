import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { torneoModificable } from '../../middlewares/torneo.middleware.js'
import { anular, detalle } from './controlador.detalle.inscripciones.js'
import { confirmar } from './controlador.pago.inscripciones.js'

const router = Router()

// Se monta en /api/inscripciones (ver app.js). Cobra y anula la Recepción; el Organizador solo ve los inscriptos. El Administrador pasa por los permisos que incluye.
router.get('/:id', autenticar, autorizar('ORGANIZADOR', 'RECEPCIONISTA'), detalle)
router.post('/:id/anular', autenticar, autorizar('RECEPCIONISTA'), torneoModificable('inscripcion'), anular)
router.post('/:id/confirmar-pago', autenticar, autorizar('RECEPCIONISTA'), torneoModificable('inscripcion'), confirmar)

export default router
import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { cancelar, crear, listar, obtener, renovar, responder } from './controlador.reservas.fijas.js'

const router = Router()

// Se monta en /api/reservas-fijas (ver app.js). El Administrador entra con los permisos de Recepción.
router.post('/', autenticar, autorizar('RECEPCIONISTA'), crear)
router.get('/', autenticar, autorizar('RECEPCIONISTA'), listar)
router.get('/:id', autenticar, autorizar('RECEPCIONISTA'), obtener)
router.post('/:id/cancelar', autenticar, autorizar('RECEPCIONISTA'), cancelar)
router.post('/:id/renovar', autenticar, autorizar('RECEPCIONISTA'), renovar)
router.post('/:id/respuesta', autenticar, autorizar('JUGADOR'), responder)

export default router
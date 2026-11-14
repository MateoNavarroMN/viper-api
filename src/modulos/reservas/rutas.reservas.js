import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { crear, obtener } from './controlador.reservas.js'

const router = Router()

// Se monta en /api/reservas (ver app.js). El Administrador entra con los permisos de Recepción.
router.post('/', autenticar, autorizar('JUGADOR'), crear)
router.get('/:id', autenticar, autorizar('JUGADOR', 'RECEPCIONISTA'), obtener)

export default router


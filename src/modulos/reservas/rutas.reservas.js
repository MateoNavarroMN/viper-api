import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { crear, crearDirecta, obtener } from './controlador.reservas.js'

const router = Router()

// Se monta en /api/reservas (ver app.js). El Administrador entra con los permisos de Recepción.
router.post('/', autenticar, autorizar('JUGADOR'), crear)
router.post('/directa', autenticar, autorizar('RECEPCIONISTA'), crearDirecta)
router.get('/:id', autenticar, autorizar('JUGADOR', 'RECEPCIONISTA'), obtener)

export default router
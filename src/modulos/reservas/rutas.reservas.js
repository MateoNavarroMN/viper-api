import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { cancelar, cobrar, crear, crearDirecta, modificarHorarioReserva, obtener } from './controlador.reservas.js'

const router = Router()

// Se monta en /api/reservas (ver app.js). El Administrador entra con los permisos de Recepción.
router.post('/', autenticar, autorizar('JUGADOR'), crear)
router.post('/directa', autenticar, autorizar('RECEPCIONISTA'), crearDirecta)
router.post('/:id/cobro', autenticar, autorizar('RECEPCIONISTA'), cobrar)
router.post('/:id/cancelar', autenticar, autorizar('JUGADOR', 'RECEPCIONISTA'), cancelar)
router.patch('/:id/horario', autenticar, autorizar('JUGADOR', 'RECEPCIONISTA'), modificarHorarioReserva)
router.get('/:id', autenticar, autorizar('JUGADOR', 'RECEPCIONISTA'), obtener)

export default router
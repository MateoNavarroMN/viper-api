import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { crear, listar, obtener } from './controlador.reservas.fijas.js'

const router = Router()

// Se monta en /api/reservas-fijas (ver app.js). El Administrador entra con los permisos de Recepción.
router.post('/', autenticar, autorizar('RECEPCIONISTA'), crear)
router.get('/', autenticar, autorizar('RECEPCIONISTA'), listar)
router.get('/:id', autenticar, autorizar('RECEPCIONISTA'), obtener)

export default router
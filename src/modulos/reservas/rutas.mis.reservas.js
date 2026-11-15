import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { listarMias } from './controlador.mis.reservas.js'

const router = Router()

// Se monta en /api/mis-reservas (ver app.js): GET /api/mis-reservas, solo JUGADOR
router.get('/', autenticar, autorizar('JUGADOR'), listarMias)

export default router
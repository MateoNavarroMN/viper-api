import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { listarMias } from './controlador.inscripciones.js'

const router = Router()

// Se monta en /api/mis-inscripciones (ver app.js): GET /api/mis-inscripciones, solo JUGADOR
router.get('/', autenticar, autorizar('JUGADOR'), listarMias)

export default router
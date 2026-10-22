import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { disponibilidad } from './controlador.canchas.js'

const router = Router()

// Se monta en /api/canchas (ver app.js)
router.get('/disponibilidad', autenticar, autorizar('RECEPCIONISTA', 'ORGANIZADOR'), disponibilidad)

export default router
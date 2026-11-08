import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { misCuotas } from './controlador.mis.cuotas.js'

const router = Router()

// Se monta en /api/mis-cuotas (ver app.js): GET /api/mis-cuotas, solo JUGADOR
router.get('/', autenticar, autorizar('JUGADOR'), misCuotas)

export default router
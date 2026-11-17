import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { misContratos } from './controlador.reservas.fijas.js'

const router = Router()

// Se monta en /api/mis-contratos (ver app.js): GET /api/mis-contratos, solo JUGADOR
router.get('/', autenticar, autorizar('JUGADOR'), misContratos)

export default router
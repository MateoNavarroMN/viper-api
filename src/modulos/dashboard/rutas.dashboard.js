import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { balance } from './controlador.balance.dashboard.js'

const router = Router()

// Se monta en /api/dashboard (ver app.js). Panel de control: solo el Administrador.
router.use(autenticar, autorizar('ADMINISTRADOR'))
router.get('/balance', balance)

export default router
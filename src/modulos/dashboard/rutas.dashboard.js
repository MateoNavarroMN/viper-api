import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { balance } from './controlador.balance.dashboard.js'
import { caja, canchas } from './controlador.operativo.dashboard.js'

const router = Router()

// Se monta en /api/dashboard (ver app.js). Panel de control: solo el Administrador. Cada bloque es un endpoint propio, así que si
// uno falla el resto del panel sigue funcionando.
router.use(autenticar, autorizar('ADMINISTRADOR'))
router.get('/balance', balance)
router.get('/caja', caja)
router.get('/canchas', canchas)

export default router
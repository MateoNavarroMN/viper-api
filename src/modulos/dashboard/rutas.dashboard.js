import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { balance } from './controlador.balance.dashboard.js'
import { caja, canchas } from './controlador.operativo.dashboard.js'
import { tienda } from './controlador.tienda.dashboard.js'
import { comunicados, socios, torneos } from './controlador.vigentes.dashboard.js'

const router = Router()

// Se monta en /api/dashboard (ver app.js). Panel de control: solo el Administrador. Cada bloque es un endpoint propio, así que si
// uno falla el resto del panel sigue funcionando.
router.use(autenticar, autorizar('ADMINISTRADOR'))
router.get('/balance', balance)
router.get('/caja', caja)
router.get('/canchas', canchas)
router.get('/torneos', torneos)
router.get('/socios', socios)
router.get('/comunicados', comunicados)
router.get('/tienda', tienda)

export default router
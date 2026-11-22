import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { alertaPorTipo, alertas, gestionar, movimientosDelRubro } from './controlador.alertas.dashboard.js'
import { balance } from './controlador.balance.dashboard.js'
import { caja, canchas } from './controlador.operativo.dashboard.js'
import { tienda } from './controlador.tienda.dashboard.js'
import { comunicados, socios, torneos } from './controlador.vigentes.dashboard.js'

// Panel de control del Administrador (CU 6.1): cada bloque es un endpoint propio, así uno que falle no tira el resto.
const router = Router()
router.use(autenticar, autorizar('ADMINISTRADOR'))

router.get('/balance', balance)
router.get('/caja', caja)
router.get('/canchas', canchas)
router.get('/torneos', torneos)
router.get('/socios', socios)
router.get('/comunicados', comunicados)
router.get('/tienda', tienda)
router.get('/alertas', alertas)
router.get('/alertas/:tipo', alertaPorTipo)
router.post('/devoluciones/:id/gestionar', gestionar)
router.get('/rubros/:rubro/movimientos', movimientosDelRubro)

export default router
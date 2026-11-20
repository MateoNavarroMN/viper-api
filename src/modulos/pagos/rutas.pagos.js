import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { iniciar } from './controlador.pagos.js'

const router = Router()

// Se monta en /api/pagos (ver app.js). El Jugador paga lo suyo; Recepción y Administrador pueden iniciar el pago de cualquier cliente.
router.post('/mercadopago', autenticar, autorizar('JUGADOR', 'RECEPCIONISTA'), iniciar)

export default router
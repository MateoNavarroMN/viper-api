import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { iniciar } from './controlador.pagos.js'
import { recibir } from './controlador.webhook.pagos.js'
import { cancelar, consultar } from './controlador.estado.pagos.js'

const router = Router()

// Se monta en /api/pagos (ver app.js).
// Iniciar un pago: el Jugador paga lo suyo; Recepción y Administrador pueden iniciar el pago de cualquier cliente.
router.post('/mercadopago', autenticar, autorizar('JUGADOR', 'RECEPCIONISTA'), iniciar)
// Aviso de Mercado Pago: público (sin sesión), se protege con la firma
router.post('/mercadopago/webhook', recibir)

// Estado y cancelación de un pago: el dueño del pago, Recepción y Administrador (el controlador revisa de quién es)
router.get('/:transaccionId', autenticar, autorizar('JUGADOR', 'RECEPCIONISTA'), consultar)
router.post('/:transaccionId/cancelar', autenticar, autorizar('JUGADOR', 'RECEPCIONISTA'), cancelar)

export default router
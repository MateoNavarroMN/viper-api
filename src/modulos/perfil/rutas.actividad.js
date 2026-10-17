import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { obtenerActividad } from './controlador.actividad.js'

const router = Router()

// Se monta en /api/perfil/actividad (ver app.js): GET /api/perfil/actividad, solo JUGADOR
router.get('/', autenticar, autorizar('JUGADOR'), obtenerActividad)

export default router
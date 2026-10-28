import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { calendario } from './controlador.calendario.js'

const router = Router()

// Se monta en /api/calendario (ver app.js). El Administrador pasa por la jerarquía de roles.
router.get('/', autenticar, autorizar('RECEPCIONISTA', 'ORGANIZADOR'), calendario)

export default router
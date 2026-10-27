import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { ordenManual } from './controlador.zonas.torneos.js'

const router = Router()

// Se monta en /api/zonas (ver app.js).
router.put('/:id/orden-manual', autenticar, autorizar('ORGANIZADOR'), ordenManual)

export default router
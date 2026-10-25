import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { programacion } from './controlador.partidos.js'
import { resultado } from './controlador.resultado.partidos.js'

const router = Router()

// Se monta en /api/partidos (ver app.js).
router.put('/:id/programacion', autenticar, autorizar('ORGANIZADOR'), programacion)
router.post('/:id/resultado', autenticar, autorizar('ORGANIZADOR'), resultado)

export default router
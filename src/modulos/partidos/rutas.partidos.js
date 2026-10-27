import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { torneoModificable } from '../../middlewares/torneo.middleware.js'
import { programacion } from './controlador.partidos.js'
import { corregir, resultado } from './controlador.resultado.partidos.js'
import { wo } from './controlador.wo.partidos.js'

const router = Router()

// Se monta en /api/partidos (ver app.js).
router.put('/:id/programacion', autenticar, autorizar('ORGANIZADOR'), torneoModificable('partido'), programacion)
router.post('/:id/resultado', autenticar, autorizar('ORGANIZADOR'), torneoModificable('partido'), resultado)
router.put('/:id/resultado', autenticar, autorizar('ORGANIZADOR'), torneoModificable('partido'), corregir)
router.post('/:id/wo', autenticar, autorizar('ORGANIZADOR'), torneoModificable('partido'), wo)

export default router
import { Router } from 'express'
import { autenticar } from '../../middlewares/autenticacion.middleware.js'
import { detalle, listar } from './controlador.ranking.js'

const router = Router()

router.get('/:disciplina', autenticar, listar)
router.get('/:disciplina/jugadores/:jugadorId', autenticar, detalle)

export default router
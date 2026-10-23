import { Router } from 'express'
import { autenticar } from '../../middlewares/autenticacion.middleware.js'
import { listar } from './controlador.ranking.js'

const router = Router()

router.get('/:disciplina', autenticar, listar)

export default router
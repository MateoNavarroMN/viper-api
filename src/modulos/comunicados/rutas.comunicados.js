import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { crear, listar, obtener } from './controlador.comunicados.js'

const router = Router()

// Se monta en /api/comunicados (ver app.js). Solo el Administrador redacta, publica y retira comunicados.
router.get('/', autenticar, autorizar('ADMINISTRADOR'), listar)
router.get('/:id', autenticar, autorizar('ADMINISTRADOR'), obtener)
router.post('/', autenticar, autorizar('ADMINISTRADOR'), crear)

export default router
import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { crear, editar, listar, obtener, publicar, retirar } from './controlador.comunicados.js'

const router = Router()

// Se monta en /api/comunicados (ver app.js). Solo el Administrador redacta, publica y retira comunicados.
router.get('/', autenticar, autorizar('ADMINISTRADOR'), listar)
router.get('/:id', autenticar, autorizar('ADMINISTRADOR'), obtener)
router.post('/', autenticar, autorizar('ADMINISTRADOR'), crear)
router.put('/:id', autenticar, autorizar('ADMINISTRADOR'), editar)
router.post('/:id/publicar', autenticar, autorizar('ADMINISTRADOR'), publicar)
router.post('/:id/retirar', autenticar, autorizar('ADMINISTRADOR'), retirar)

export default router
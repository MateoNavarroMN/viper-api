import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { crear } from './controlador.alta.socios.js'
import { listar, obtener } from './controlador.consulta.socios.js'
import { editar } from './controlador.editar.socios.js'
import { darDeBaja } from './controlador.baja.socios.js'

const router = Router()

// Se monta en /api/socios (ver app.js). Recepcionista y Administrador (el Administrador hereda los permisos de Recepcionista).
router.get('/', autenticar, autorizar('RECEPCIONISTA'), listar)
router.get('/:id', autenticar, autorizar('RECEPCIONISTA'), obtener)
router.post('/', autenticar, autorizar('RECEPCIONISTA'), crear)
router.patch('/:id', autenticar, autorizar('RECEPCIONISTA'), editar)
router.post('/:id/baja', autenticar, autorizar('RECEPCIONISTA'), darDeBaja)

export default router
import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { generar, previsualizar } from './controlador.generacion.cuotas.js'

const router = Router()

// Se monta en /api/cuotas (ver app.js). Recepcionista y Administrador (el Administrador hereda los permisos de Recepcionista).
router.get('/generar/preview', autenticar, autorizar('RECEPCIONISTA'), previsualizar)
router.post('/generar', autenticar, autorizar('RECEPCIONISTA'), generar)

export default router
import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { excel, pdf, vistaPrevia } from './controlador.reportes.js'

// Reportes financieros (CU 6.2): solo el Administrador.
const router = Router()
router.use(autenticar, autorizar('ADMINISTRADOR'))

router.get('/vista-previa', vistaPrevia)
router.get('/excel', excel)
router.get('/pdf', pdf)

export default router
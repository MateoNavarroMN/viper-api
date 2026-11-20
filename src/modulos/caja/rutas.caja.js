import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { estado } from './controlador.caja.js'
import { detalle, listar } from './controlador.movimientos.caja.js'

const router = Router()

// Se monta en /api/caja (ver app.js). Recepcionista y Administrador (el Administrador hereda el permiso del Recepcionista).
router.get('/estado', autenticar, autorizar('RECEPCIONISTA'), estado)
router.get('/movimientos', autenticar, autorizar('RECEPCIONISTA'), listar)
router.get('/movimientos/:id', autenticar, autorizar('RECEPCIONISTA'), detalle)

export default router
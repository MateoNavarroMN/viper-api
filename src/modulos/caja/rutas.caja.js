import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { estado } from './controlador.caja.js'
import { detalle, listar } from './controlador.movimientos.caja.js'
import { origenesPendientes } from './controlador.origenes.caja.js'
import { registrar } from './controlador.registro.caja.js'

const router = Router()

// Se monta en /api/caja (ver app.js). Recepcionista y Administrador (el Administrador hereda el permiso del Recepcionista).
router.get('/estado', autenticar, autorizar('RECEPCIONISTA'), estado)
router.get('/movimientos', autenticar, autorizar('RECEPCIONISTA'), listar)
router.get('/movimientos/:id', autenticar, autorizar('RECEPCIONISTA'), detalle)
router.post('/movimientos', autenticar, autorizar('RECEPCIONISTA'), registrar)
router.get('/origenes-pendientes', autenticar, autorizar('RECEPCIONISTA'), origenesPendientes)

export default router
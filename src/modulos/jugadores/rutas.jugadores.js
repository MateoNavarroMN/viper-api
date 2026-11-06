import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { buscar, consultar } from './controlador.jugadores.js'

const router = Router()

// Se monta en /api/jugadores (ver app.js)
router.get('/buscar', autenticar, autorizar('JUGADOR'), buscar)
// Búsqueda del personal (CU 4.1, turno directo, alquiler fijo): Recepcionista y Administrador
router.get('/consulta', autenticar, autorizar('RECEPCIONISTA'), consultar)

export default router
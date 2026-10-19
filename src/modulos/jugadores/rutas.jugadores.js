import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { buscar } from './controlador.jugadores.js'

const router = Router()

// Se monta en /api/jugadores (ver app.js)
router.get('/buscar', autenticar, autorizar('JUGADOR'), buscar)

export default router
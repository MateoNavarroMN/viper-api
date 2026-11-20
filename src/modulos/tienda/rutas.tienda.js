import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { catalogo, detalle } from './controlador.tienda.js'

const router = Router()

// Se monta en /api/tienda (ver app.js). Solo consulta (GET) y solo para el Jugador: desde la API no se compra ni se alquila nada.
router.get('/catalogo', autenticar, autorizar('JUGADOR'), catalogo)
router.get('/catalogo/:id', autenticar, autorizar('JUGADOR'), detalle)

export default router
import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { cartelera, comunicado } from './controlador.portal.js'

const router = Router()

// Se monta en /api/portal (ver app.js). Solo JUGADOR: cada bloque del portal es un endpoint propio.
router.use(autenticar, autorizar('JUGADOR'))
router.get('/comunicados', cartelera)
router.get('/comunicados/:id', comunicado)

export default router
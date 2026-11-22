import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { comunicado, cartelera, cuotas, partidos, ranking, torneos } from './controlador.portal.js'

const router = Router()

// Se monta en /api/portal (ver app.js). Solo JUGADOR: cada bloque del portal es un endpoint propio.
router.use(autenticar, autorizar('JUGADOR'))
router.get('/comunicados', cartelera)
router.get('/comunicados/:id', comunicado)
router.get('/ranking', ranking)
router.get('/partidos', partidos)
router.get('/torneos', torneos)
router.get('/cuotas', cuotas)

export default router
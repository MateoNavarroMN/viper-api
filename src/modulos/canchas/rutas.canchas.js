import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { crear, disponibilidad, editar, listar, obtener } from './controlador.canchas.js'

const router = Router()

// Se monta en /api/canchas (ver app.js)
router.get('/disponibilidad', autenticar, autorizar('JUGADOR', 'RECEPCIONISTA', 'ORGANIZADOR'), disponibilidad)
router.get('/:id', autenticar, autorizar('ADMINISTRADOR'), obtener)
router.patch('/:id', autenticar, autorizar('ADMINISTRADOR'), editar)

// Canchas y tarifas: solo el Administrador. Las rutas con :id van después de /disponibilidad para no pisarla.
router.get('/', autenticar, autorizar('ADMINISTRADOR'), listar)

router.post('/', autenticar, autorizar('ADMINISTRADOR'), crear)

export default router
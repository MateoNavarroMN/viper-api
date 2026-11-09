import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { listar, modificar } from './controlador.reglas.puntuacion.js'

const router = Router()

// Se monta en /api/reglas-puntuacion (ver app.js). Solo Organizador y Administrador.
router.get('/', autenticar, autorizar('ORGANIZADOR'), listar)
router.put('/:disciplina/:instancia', autenticar, autorizar('ORGANIZADOR'), modificar)

export default router
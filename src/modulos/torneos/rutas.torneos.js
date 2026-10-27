import { Router } from 'express'
import { autenticar, autorizar } from '../../middlewares/autenticacion.middleware.js'
import { torneoModificable } from '../../middlewares/torneo.middleware.js'
import { crear, editar, listar, obtener } from './controlador.torneos.js'
import { abrir, cancelar, cerrar, previewCierre } from './controlador.estados.torneos.js'
import { inscribir, listarDelTorneo } from './controlador.inscripciones.js'
import { guardar as guardarCabezas, obtener as obtenerCabezas } from './controlador.cabezas.torneos.js'
import { ampliarFin, cuadro, generar, preview as previewCuadro, regenerar } from './controlador.cuadro.torneos.js'
import { archivar, resumen } from './controlador.archivo.torneos.js'
import { generar as generarEliminatoria, regenerar as regenerarEliminatoria } from './controlador.eliminatoria.torneos.js'

const router = Router()

router.use(autenticar)

router.get('/', listar)
router.get('/:id', obtener)
// El Administrador también pasa: incluye los permisos del Organizador (RF-02)
router.post('/', autorizar('ORGANIZADOR'), crear)
router.put('/:id', autorizar('ORGANIZADOR'), torneoModificable('torneo'), editar)

// Cambios de estado (CU 3.1 · A2, A3 y A4)
router.post('/:id/abrir-inscripciones', autorizar('ORGANIZADOR'), torneoModificable('torneo'), abrir)
router.get('/:id/cerrar-inscripciones/preview', autorizar('ORGANIZADOR'), previewCierre)
router.post('/:id/cerrar-inscripciones', autorizar('ORGANIZADOR'), torneoModificable('torneo'), cerrar)
router.get('/:id/inscripciones', autorizar('RECEPCIONISTA', 'ORGANIZADOR'), listarDelTorneo)
router.post('/:id/cancelar', autorizar('ORGANIZADOR'), torneoModificable('torneo'), cancelar)

// Cabezas de serie (CU 3.3)
router.get('/:id/cabezas-de-serie', autorizar('ORGANIZADOR'), obtenerCabezas)
router.put('/:id/cabezas-de-serie', autorizar('ORGANIZADOR'), torneoModificable('torneo'), guardarCabezas)

// Cuadro (CU 3.4). Ver el cuadro lo puede cualquier usuario; generarlo y regenerarlo, el Organizador.
router.get('/:id/generar-cuadro/preview', autorizar('ORGANIZADOR'), previewCuadro)
router.post('/:id/generar-cuadro', autorizar('ORGANIZADOR'), torneoModificable('torneo'), generar)
router.get('/:id/cuadro', cuadro)
router.post('/:id/regenerar-cuadro', autorizar('ORGANIZADOR'), torneoModificable('torneo'), regenerar)
router.put('/:id/fecha-fin', autorizar('ORGANIZADOR'), torneoModificable('torneo'), ampliarFin)

// Fase eliminatoria de un torneo con zonas (CU 3.9)
router.post('/:id/fase-eliminatoria', autorizar('ORGANIZADOR'), torneoModificable('torneo'), generarEliminatoria)
router.post('/:id/fase-eliminatoria/regenerar', autorizar('ORGANIZADOR'), torneoModificable('torneo'), regenerarEliminatoria)

// Resumen y archivo (CU 3.8). Solo el Administrador: el Organizador no pasa. Un torneo archivado sigue consultable.
router.get('/:id/resumen', autorizar('ADMINISTRADOR'), resumen)
router.post('/:id/archivar', autorizar('ADMINISTRADOR'), archivar)

// Inscripción. Solo JUGADOR: el Administrador no hereda este permiso.
router.post('/:id/inscripciones', autorizar('JUGADOR'), torneoModificable('torneo'), inscribir)

export default router
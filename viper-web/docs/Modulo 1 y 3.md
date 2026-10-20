# Viper · Plan de implementación Módulo 1 y Módulo 3

**Alcance:** Módulo 1 (Autenticación y Roles: CU 1.1 a 1.4) y Módulo 3 (Logística de Torneos: CU 3.1 a 3.9), funcionando de punta a punta en `viper-api` (Node + Express + PostgreSQL/Supabase) y `viper-web` (React 19 + Vite + Tailwind v4).
**Contexto:** proyecto académico con tiempo limitado, para un solo club (La Rochelle Tennis Club). El plan contiene solo desarrollo funcional: backend, frontend, integración y un deploy básico.
**Plazo:** 3 semanas (3 sprints de 1 semana).

| Sprint | Fechas (a ajustar) | Objetivo |
|---|---|---|
| Semana 1 | 12/10 → 16/10 | Base de ambos repos, Módulo 1 completo, ABM y estados de torneos (CU 3.1) y deploy básico |
| Semana 2 | 19/10 → 23/10 | Inscripciones, cabezas de serie, generación de cuadros, scheduler y reservas de cancha (CU 3.2 a 3.5) |
| Semana 3 | 26/10 → 30/10 | Resultados y ranking, W.O., fase eliminatoria, archivo (CU 3.6 a 3.9) e integración final |

---

## 1. Cómo trabajar en paralelo

1. **La lista de endpoints es el acuerdo.** El Anexo A lista todas las rutas, quién puede usarlas y a qué CU corresponden. Front y back la usan como referencia; si un endpoint cambia, se actualiza la tabla y se avisa al otro lado.
2. **El backend prueba sus endpoints a mano** con Postman, Thunder Client o similar, sin esperar al front.
3. **El frontend consume directamente la API** en desarrollo (`VITE_API_URL` apuntando a la API local o a la desplegada). Mientras un endpoint no está listo, se avanza con la maqueta de la pantalla y se conecta cuando llega.
4. **Integración manual por bloques:** al terminar cada bloque de CU hay una tarea `INT` donde se recorre el flujo completo contra la API real y se corrigen diferencias.

### Formato de error

Simple y directo: el controller valida y responde con `res.status(400).json({ mensaje: 'Ya existe una cuenta con ese correo' })`. Si el error es de un campo puntual se agrega `campo` para que el front lo marque en rojo: `{ mensaje: '...', campo: 'email' }`. Los textos entre «» que figuran en los criterios de aceptación son el `mensaje` a devolver (puede redactarse distinto).

Códigos HTTP: `400` validación · `401` no autenticado / credenciales inválidas · `403` rol sin permiso · `404` no existe · `409` conflicto de negocio (duplicado, estado inválido, concurrencia) · `423` cuenta en espera.

### Definición de Hecho (aplica a todas las tareas, no se repite en cada una)

**Backend**
- La ruta coincide con el Anexo A y responde el código HTTP y el `mensaje` de cada flujo alternativo del CU.
- Probado a mano (caso feliz y flujos alternativos).
- Protegido con `autenticar` y `autorizar(roles)` cuando corresponde.
- Las validaciones se hacen a mano en el controller (`if (!email) return res.status(400).json({ mensaje: '...' })`). Nunca devuelve `password_hash`.

**Frontend**
- Funciona contra la API real.
- Responsive probado a 360 px y 1280 px (RNF-04).
- Usa solo `useState`/`useEffect` y `fetch` (vía el cliente simple de INF-07). Estados de carga, vacío y error contemplados. Errores de campo resaltados en rojo (patrón de todos los CU).
- Usa solo tokens y patrones de `design.md` (si hace falta uno nuevo, primero se agrega a `design.md`).

---

## 2. Resumen de tareas

| ID | Título | Área | CU | Sprint | Depende de |
|---|---|---|---|---|---|
| INF-01 | Estructura base de la API (MVC, errores, validación) | Backend | — | S1 | — |
| INF-02 | Conexión a Postgres de Supabase y scripts SQL | Backend | — | S1 | INF-01 |
| INF-07 | Estructura de la app privada y cliente fetch simple | Frontend | — | S1 | — |
| INF-09 | Componentes UI base según design.md | Frontend | — | S1 | — |
| INF-11 | Deploy básico (Render + Vercel) | Infra | — | S1 | INF-01, INF-02, INF-07 |
| M1-BE-01 | Tablas de usuarios, jugadores y sesiones | Backend | 1.1, 1.2 | S1 | INF-02 |
| M1-BE-02 | Autorregistro de jugador | Backend | 1.1 | S1 | M1-BE-01 |
| M1-BE-03 | Login con JWT, sesiones e intentos fallidos | Backend | 1.2 | S1 | M1-BE-01 |
| M1-BE-04 | Middlewares autenticar/autorizar y GET /auth/me | Backend | 1.2 | S1 | M1-BE-03 |
| M1-BE-05 | Cerrar sesión | Backend | 1.2 | S1 | M1-BE-04 |
| M1-BE-06 | Alta de cuenta de personal por el Administrador | Backend | 1.1 | S1 | M1-BE-02, M1-BE-04 |
| M1-BE-07 | Ver y editar perfil propio | Backend | 1.3 | S1 | M1-BE-04 |
| M1-BE-08 | Cambiar contraseña | Backend | 1.3 | S1 | M1-BE-04 |
| M1-BE-09 | Mi actividad del jugador | Backend | 1.3 | S2 | M1-BE-04, M3-BE-04 |
| M1-BE-10 | Listado, búsqueda y detalle de usuarios | Backend | 1.4 | S1 | M1-BE-04 |
| M1-BE-11 | Cambiar rol de un usuario | Backend | 1.4 | S1 | M1-BE-10 |
| M1-BE-12 | Bloquear y activar usuario | Backend | 1.4 | S1 | M1-BE-10 |
| M1-BE-13 | Modificar correo o DNI de un usuario | Backend | 1.4 | S1 | M1-BE-10 |
| M1-FE-01 | Pantalla de registro | Frontend | 1.1 | S1 | INF-07, INF-09, M1-BE-02 |
| M1-FE-02 | Estado de autenticación y manejo de sesión | Frontend | 1.2 | S1 | INF-07, M1-BE-03, M1-BE-04 |
| M1-FE-03 | Pantalla de inicio de sesión | Frontend | 1.2 | S1 | M1-FE-02, INF-09 |
| M1-FE-04 | Layout privado, menú por rol y rutas protegidas | Frontend | 1.2 | S1 | M1-FE-02, INF-09 |
| M1-FE-05 | Pantalla Mi Perfil y edición de datos | Frontend | 1.3 | S1 | M1-FE-04 |
| M1-FE-06 | Cambiar contraseña | Frontend | 1.3 | S1 | M1-FE-05 |
| M1-FE-07 | Sección Mi actividad | Frontend | 1.3 | S2 | M1-FE-05 |
| M1-FE-08 | Listado de usuarios | Frontend | 1.4 | S1 | M1-FE-04 |
| M1-FE-09 | Detalle de usuario y cambio de rol | Frontend | 1.4 | S1 | M1-FE-08 |
| M1-FE-10 | Bloquear/activar y editar correo o DNI | Frontend | 1.4 | S1 | M1-FE-09 |
| M1-FE-11 | Alta de cuenta de personal | Frontend | 1.1 | S1 | M1-FE-08, M1-FE-01 |
| M1-INT-01 | Integración y prueba de punta a punta del Módulo 1 | Integración | 1.1–1.4 | S1/S2 | todas las tareas M1-BE y M1-FE |
| M3-BE-01 | Tablas de torneos | Backend | 3.1–3.9 | S1 | INF-02, M1-BE-01 |
| M3-BE-02 | ABM de torneos | Backend | 3.1 | S1 | M3-BE-01, M1-BE-04 |
| M3-BE-03 | Máquina de estados del torneo | Backend | 3.1 | S1 | M3-BE-02 |
| M3-BE-04 | Inscripción a torneo con validaciones | Backend | 3.2 | S2 | M3-BE-03, M3-BE-05 |
| M3-BE-05 | Buscar compañero por DNI | Backend | 3.2 | S2 | M1-BE-01 |
| M3-BE-06 | Listados de inscripciones y vencimiento | Backend | 3.2 | S2 | M3-BE-04 |
| M3-BE-07 | Registrar pago en efectivo de inscripción | Backend | 3.2 | S2 | M3-BE-06 |
| M3-BE-08 | Configurar cabezas de serie | Backend | 3.3 | S2 | M3-BE-07, M3-BE-15 |
| M3-BE-09 | Algoritmo de cuadro de eliminación directa | Backend | 3.4 | S2 | INF-01 |
| M3-BE-10 | Algoritmo de zonas y fixture todos contra todos | Backend | 3.4 | S2 | INF-01 |
| M3-BE-11 | Scheduler de partidos | Backend | 3.4, 3.5 | S2 | INF-01 |
| M3-BE-12 | Canchas y reservas de tipo Torneo con anti-solapamiento | Backend | 3.5 | S2 | INF-02 |
| M3-BE-13 | Disponibilidad y reprogramación manual de partidos | Backend | 3.5 | S2 | M3-BE-12, M3-BE-11 |
| M3-BE-14 | Generar, consultar y regenerar el cuadro | Backend | 3.4 | S2 | M3-BE-08, M3-BE-09, M3-BE-10, M3-BE-11, M3-BE-12 |
| M3-BE-15 | Base de ranking: categorías, reglas y movimientos de puntos | Backend | 3.6 | S2/S3 | M3-BE-01 |
| M3-BE-16 | Validador de marcador | Backend | 3.6 | S2 | INF-01 |
| M3-BE-17 | Cálculo de tabla de posiciones de zona | Backend | 3.6 | S2 | INF-01 |
| M3-BE-18 | Registrar resultado de partido | Backend | 3.6 | S3 | M3-BE-14, M3-BE-15, M3-BE-16, M3-BE-17 |
| M3-BE-19 | Corregir resultado ya cargado | Backend | 3.6 | S3 | M3-BE-18 |
| M3-BE-20 | Registrar baja y W.O. | Backend | 3.7 | S3 | M3-BE-18 |
| M3-BE-21 | Armado de eliminatoria desde zonas | Backend | 3.9 | S3 | M3-BE-09, M3-BE-17 |
| M3-BE-22 | Generar y regenerar fase eliminatoria | Backend | 3.9 | S3 | M3-BE-21, M3-BE-14 |
| M3-BE-23 | Resumen y archivo de torneo, bloqueo de edición | Backend | 3.8 | S3 | M3-BE-18 |
| M3-FE-01 | Listado de torneos (gestión) | Frontend | 3.1 | S1 | M1-FE-04, M3-BE-02 |
| M3-FE-02 | Formulario crear/editar torneo | Frontend | 3.1 | S1 | M3-FE-01 |
| M3-FE-03 | Ficha del torneo (gestión) con acciones de estado | Frontend | 3.1 | S1 | M3-FE-01 |
| M3-FE-04 | Torneos disponibles y ficha pública | Frontend | 3.2 | S2 | M1-FE-04, M3-BE-02 |
| M3-FE-05 | Formulario de inscripción | Frontend | 3.2 | S2 | M3-FE-04 |
| M3-FE-06 | Mis inscripciones | Frontend | 3.2 | S2 | M3-FE-05 |
| M3-FE-07 | Inscriptos del torneo y registro de pago | Frontend | 3.2 | S2 | M3-FE-03 |
| M3-FE-08 | Configurar cabezas de serie | Frontend | 3.3 | S2 | M3-FE-03 |
| M3-FE-09 | Confirmar generación de cuadro | Frontend | 3.4 | S2 | M3-FE-03 |
| M3-FE-10 | Componente visual de cuadro (bracket) | Frontend | 3.4, 3.9 | S2 | INF-09, M3-BE-14 |
| M3-FE-11 | Componente visual de zonas | Frontend | 3.4 | S2 | INF-09, M3-BE-14 |
| M3-FE-12 | Conflictos de programación y regenerar cuadro | Frontend | 3.4 | S2 | M3-FE-09, M3-FE-13 |
| M3-FE-13 | Programar/reprogramar partido sobre la grilla | Frontend | 3.5 | S2 | INF-09, M3-BE-13 |
| M3-FE-14 | Cronograma de partidos del torneo | Frontend | 3.4, 3.5 | S2 | M3-BE-14 |
| M3-FE-15 | Cargar resultado de partido | Frontend | 3.6 | S2 | M3-FE-10, M3-FE-11 |
| M3-FE-16 | Confirmación de resultado y corrección | Frontend | 3.6 | S3 | M3-FE-15 |
| M3-FE-17 | Ranking por disciplina | Frontend | 3.6 | S3 | M3-BE-15 |
| M3-FE-18 | Registrar baja / W.O. | Frontend | 3.7 | S3 | M3-FE-10, M3-FE-11 |
| M3-FE-19 | Generar fase eliminatoria | Frontend | 3.9 | S3 | M3-FE-10, M3-FE-11 |
| M3-FE-20 | Archivar torneo e históricos | Frontend | 3.8 | S3 | M3-FE-01, M3-FE-10 |
| M3-INT-01 | Integración CU 3.1 y 3.2 | Integración | 3.1, 3.2 | S2 | M3-BE-02 a 07, M3-FE-01 a 07 |
| M3-INT-02 | Integración CU 3.3, 3.4 y 3.5 | Integración | 3.3–3.5 | S3 | M3-BE-08 a 14, M3-FE-08 a 14 |
| M3-INT-03 | Integración CU 3.6 a 3.9 | Integración | 3.6–3.9 | S3 | M3-BE-15 a 23, M3-FE-15 a 20 |

| Área |
|---|
| Backend |
| Frontend |
| Integración |
| Infra (deploy básico) |

| Sprint |
|---|
| Semana 1 |
| Semana 2 |
| Semana 3 |

La Semana 3 queda más liviana a propósito: es el margen para corregir lo que aparezca en la integración final.

---

## Anexo A · Endpoints de la API

Es la lista que front y back usan como acuerdo. Todas las rutas bajo `/api` (por ejemplo `POST /api/auth/login`); la única excepción es `GET /health`, que va en la raíz. "Público" = sin token. Si un endpoint cambia, se actualiza esta tabla.

**Módulo 1**

| Método | Ruta | Rol | CU |
|---|---|---|---|
| POST | `/auth/registro` | Público | 1.1 |
| POST | `/auth/login` | Público | 1.2 |
| POST | `/auth/logout` | Autenticado | 1.2 A2 |
| GET | `/auth/me` | Autenticado | 1.2 |
| GET / PATCH | `/perfil` | Autenticado | 1.3 |
| PATCH | `/perfil/password` | Autenticado | 1.3 A1 |
| GET | `/perfil/actividad` | Jugador | 1.3 A2 |
| GET | `/usuarios` | Administrador | 1.4 |
| GET | `/usuarios/:id` | Administrador | 1.4 |
| POST | `/usuarios/personal` | Administrador | 1.1 A1 |
| PATCH | `/usuarios/:id/rol` | Administrador | 1.4 |
| POST | `/usuarios/:id/bloquear` · `/activar` | Administrador | 1.4 A1, A2 |
| PATCH | `/usuarios/:id/contacto` | Administrador | 1.4 A3 |

**Módulo 3**

| Método | Ruta | Rol | CU |
|---|---|---|---|
| GET | `/torneos` · `/torneos/:id` | Autenticado | 3.1, 3.2 |
| POST / PUT | `/torneos` · `/torneos/:id` | Organizador | 3.1 |
| POST | `/torneos/:id/abrir-inscripciones` | Organizador | 3.1 A2 |
| GET / POST | `/torneos/:id/cerrar-inscripciones[/preview]` | Organizador | 3.1 A3 |
| POST | `/torneos/:id/cancelar` | Organizador | 3.1 A4 |
| GET | `/jugadores/buscar?dni=` | Jugador | 3.2 |
| POST | `/torneos/:id/inscripciones` | Jugador | 3.2 |
| GET | `/torneos/:id/inscripciones` | Organizador, Recepcionista | 3.2 |
| GET | `/mis-inscripciones` | Jugador | 3.2 |
| POST | `/inscripciones/:id/confirmar-pago` | Recepcionista | 3.2 7a |
| GET / PUT | `/torneos/:id/cabezas-de-serie` | Organizador | 3.3 |
| GET | `/torneos/:id/generar-cuadro/preview` | Organizador | 3.4 |
| POST | `/torneos/:id/generar-cuadro` · `/regenerar-cuadro` | Organizador | 3.4 |
| GET | `/torneos/:id/cuadro` | Autenticado | 3.4, 3.9 |
| GET | `/torneos/:id/cronograma` | Autenticado | 3.4, 3.5 |
| GET | `/canchas/disponibilidad?disciplina=&fecha=` | Organizador | 3.5 |
| PUT | `/partidos/:id/programacion` | Organizador | 3.5 |
| POST / PUT | `/partidos/:id/resultado` | Organizador | 3.6 |
| POST | `/partidos/:id/wo` | Organizador | 3.7 |
| GET | `/ranking/:disciplina` | Autenticado | 3.6 |
| POST | `/torneos/:id/fase-eliminatoria[/regenerar]` | Organizador | 3.9 |
| PUT | `/zonas/:id/orden-manual` | Organizador | 3.9 3a |
| GET | `/torneos/:id/resumen` | Administrador | 3.8 |
| POST | `/torneos/:id/archivar` | Administrador | 3.8 |

## Anexo B · Estados y transiciones

- **Usuario.estado:** `ACTIVO`, `BLOQUEADO` · **Usuario.rol:** `ADMINISTRADOR`, `RECEPCIONISTA`, `ORGANIZADOR`, `JUGADOR`
- **Sesion.estado:** `ACTIVA`, `CERRADA`
- **Torneo.estado:** `PLANIFICADO` → `INSCRIPCIONES_ABIERTAS` → `INSCRIPCIONES_CERRADAS` → `EN_CURSO` → `FINALIZADO` → `ARCHIVADO`. `CANCELADO` desde cualquiera de los cuatro primeros. `EN_CURSO` → `INSCRIPCIONES_CERRADAS` solo por regeneración (CU 3.4 6a).
- **Torneo.faseActual:** `null`, `ZONAS`, `ELIMINATORIA`
- **Inscripcion.estado:** `ACTIVA`, `ANULADA` · **Inscripcion.estadoPago:** `PENDIENTE`, `PAGADO`
- **Partido.estado:** `PENDIENTE` (faltan rivales) → `PROGRAMADO` → `FINALIZADO` o `WO`
- **Reserva.tipo:** `ORDINARIA`, `FIJA`, `TORNEO` · **Reserva.estado:** `PENDIENTE`, `CONFIRMADA`, `CANCELADA`

## Anexo C · Matriz de permisos y panel de inicio

| Sección | Jugador | Recepcionista | Organizador | Administrador |
|---|---|---|---|---|
| Mi Perfil | ✔ (+ Mi actividad) | ✔ | ✔ | ✔ |
| Torneos (portal), inscripción, Mis inscripciones | ✔ | — | — | — |
| Ranking | ✔ | ✔ | ✔ | ✔ |
| Gestión de torneos (ABM, estados, cuadros, resultados, W.O.) | — | — | ✔ | ✔ |
| Inscriptos y registro de pago en efectivo | — | ✔ | ver | ✔ |
| Archivar torneos | — | — | — | ✔ |
| Usuarios y roles | — | — | — | ✔ |
| **Panel tras login** | `/portal/torneos` | `/gestion/inscripciones` | `/gestion/torneos` | `/admin/usuarios` |

## Anexo D · Decisiones y supuestos

1. **Un solo club (single-tenant).** El sistema se construye solo para La Rochelle Tennis Club. Las tablas no llevan `club_id`; el modelo multi-club queda como expansión futura fuera de este alcance.
2. **Autenticación propia** (bcrypt + JWT + tabla de sesiones), no Supabase Auth, porque el informe pide sesiones revocables, intentos fallidos y bloqueo de 15 minutos.
3. **Acceso a datos con `pg` y SQL crudo** sobre la base de Supabase, sin ORM ni migraciones versionadas: las tablas se crean ejecutando scripts SQL en el panel de Supabase. Validaciones a mano en los controllers y errores como `{ mensaje }`. En el frontend, solo estado nativo de React y `fetch`.
4. **Mercado Pago queda fuera** de estas 3 semanas: el pago de inscripciones se registra en efectivo desde recepción y `confirmarPago()` queda listo para el webhook futuro.
5. **Reglas deportivas por defecto:** mejor de 3 sets (tercero opcionalmente super tie-break a 10), partido de 90 min, horario de 08:00 a 23:00, descanso mínimo de 60 min, vencimiento de inscripción a las 48 h.
6. **Desempate de zonas:** partidos ganados → resultado entre sí → diferencia de sets → diferencia de games → resolución manual. Falta el reglamento real del club.
7. **Categoría compatible** = misma categoría del torneo (en Pádel, ambos integrantes). Valores de puntos por concepto y rangos de categoría se cargan como seed de ejemplo hasta tener los del club.

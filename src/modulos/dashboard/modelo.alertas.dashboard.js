import { pool } from '../../config/conexion.bd.js'
import { fechasAbiertas } from '../caja/modelo.cierre.caja.js'
import { expirarVencidas } from '../reservas/modelo.reservas.js'
import { anularInscripcionesVencidas } from '../torneos/modelo.inscripciones.js'
import { SQL_CUOTA_VENCIDA } from '../cuotas/modelo.cuotas.js'

// Bloque «Alertas» del panel de control (CU 6.1): lo que requiere atención del Administrador. Es solo lectura, salvo
// `gestionarDevolucion`, que marca como gestionada una devolución de un pago en línea.
// Cada alerta lleva su `destino`: la pantalla de gestión del front donde se resuelve.

const ZONA = "'America/Argentina/Cordoba'"

export const HORAS_POR_VENCER = 6        // una reserva o inscripción PENDIENTE está «por vencer» si su plazo termina dentro de estas horas
export const DIAS_CAJA_DESCUADRADA = 7   // se avisa de las cajas descuadradas de la última semana
export const MAXIMO_ELEMENTOS = 100      // tope de elementos del detalle de una alerta

const pesos = (monto) => Math.round(Number(monto) * 100) / 100
const dinero = (monto) => `$${pesos(monto).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
const diaYMes = (texto) => texto.split('-').reverse().join('/')   // «2026-11-20» → «20/11/2026»

// Cada tipo de alerta: su título, la pantalla donde se atiende y cómo se leen sus elementos.
// `leer(limite, db)` devuelve { cantidad, elementos }; cada elemento es { id, titulo, detalle, destino }.
const TIPOS = {
  CAJA_SIN_CERRAR: {
    titulo: 'Cajas de jornadas anteriores sin cerrar',
    destino: '/gestion/caja',
    leer: async (limite, db) => {
      const fechas = await fechasAbiertas(db)
      return {
        cantidad: fechas.length,
        elementos: fechas.slice(0, limite).map((f) => ({
          id: f.fecha,
          titulo: `Jornada del ${diaYMes(f.fecha)} sin cerrar`,
          detalle: `${f.movimientos} ${f.movimientos === 1 ? 'movimiento' : 'movimientos'} · efectivo calculado ${dinero(f.efectivoCalculado)}`,
          destino: '/gestion/caja',
        })),
      }
    },
  },

  CAJA_DESCUADRADA: {
    titulo: 'Cajas cerradas con diferencia',
    destino: '/gestion/caja',
    leer: async (limite, db) => {
      const { rows } = await db.query(
        `select c.fecha::text as fecha, c.diferencia, u.nombre || ' ' || u.apellido as responsable, count(*) over()::int as total
           from cierre_caja c join usuario u on u.id = c.responsable_usuario_id
          where c.estado = 'DESCUADRADO' and c.fecha >= (current_date - $1::int) and c.fecha < current_date + 1
          order by c.fecha desc
          limit $2`,
        [DIAS_CAJA_DESCUADRADA, limite]
      )
      return {
        cantidad: rows[0]?.total ?? 0,
        elementos: rows.map((f) => {
          const diferencia = pesos(f.diferencia)
          return {
            id: f.fecha,
            titulo: `Caja del ${diaYMes(f.fecha)} descuadrada`,
            detalle: `${diferencia < 0 ? 'Faltan' : 'Sobran'} ${dinero(Math.abs(diferencia))} · cerrada por ${f.responsable}`,
            destino: '/gestion/caja',
          }
        }),
      }
    },
  },

  RESERVAS_POR_VENCER: {
    titulo: 'Reservas pendientes de pago por vencer',
    destino: '/gestion/reservas',
    leer: async (limite, db) => {
      await expirarVencidas(db)
      const { rows } = await db.query(
        `select r.id, c.nombre as cancha, to_char(r.fecha, 'DD/MM/YYYY') as fecha, to_char(r.hora_inicio, 'HH24:MI') as inicio,
                coalesce(u.nombre || ' ' || u.apellido, r.nombre_contacto, 'Sin cliente') as cliente,
                to_char(r.expiracion_pago at time zone ${ZONA}, 'DD/MM HH24:MI') as vence, r.precio_aplicado as monto,
                count(*) over()::int as total
           from reserva r
           join cancha c on c.id = r.cancha_id
           left join usuario u on u.id = r.cliente_usuario_id
          where r.estado = 'PENDIENTE' and r.expiracion_pago is not null
            and r.expiracion_pago >= now() and r.expiracion_pago < now() + make_interval(hours => $1)
          order by r.expiracion_pago, r.id
          limit $2`,
        [HORAS_POR_VENCER, limite]
      )
      return {
        cantidad: rows[0]?.total ?? 0,
        elementos: rows.map((f) => ({
          id: f.id,
          titulo: `${f.cancha} · ${f.fecha} a las ${f.inicio} · ${f.cliente}`,
          detalle: `${dinero(f.monto)} · vence el ${f.vence}`,
          destino: '/gestion/reservas',
        })),
      }
    },
  },

  INSCRIPCIONES_POR_VENCER: {
    titulo: 'Inscripciones pendientes de pago por vencer',
    destino: '/gestion/inscripciones',
    leer: async (limite, db) => {
      await anularInscripcionesVencidas(null, db)
      const { rows } = await db.query(
        `select i.id, t.nombre as torneo, ut.nombre || ' ' || ut.apellido as titular, uc.nombre || ' ' || uc.apellido as companero,
                to_char(i.vence_en at time zone ${ZONA}, 'DD/MM HH24:MI') as vence, t.precio_inscripcion as monto,
                count(*) over()::int as total
           from inscripcion i
           join torneo t on t.id = i.torneo_id
           join jugador jt on jt.id = i.titular_jugador_id join usuario ut on ut.id = jt.usuario_id
           left join jugador jc on jc.id = i.companero_jugador_id left join usuario uc on uc.id = jc.usuario_id
          where i.estado = 'ACTIVA' and i.estado_pago = 'PENDIENTE' and i.vence_en is not null
            and i.vence_en >= now() and i.vence_en < now() + make_interval(hours => $1)
          order by i.vence_en, i.id
          limit $2`,
        [HORAS_POR_VENCER, limite]
      )
      return {
        cantidad: rows[0]?.total ?? 0,
        elementos: rows.map((f) => ({
          id: f.id,
          titulo: `${f.torneo} · ${f.titular}${f.companero ? ` / ${f.companero}` : ''}`,
          detalle: `${dinero(f.monto)} · vence el ${f.vence}`,
          destino: `/gestion/inscripciones/${f.id}`,
        })),
      }
    },
  },

  SOCIOS_CON_CUOTAS_VENCIDAS: {
    titulo: 'Socios con cuotas vencidas',
    destino: '/gestion/socios?pestana=cuotas',
    leer: async (limite, db) => {
      const { rows } = await db.query(
        `select s.id, u.nombre || ' ' || u.apellido as socio, count(*)::int as cuotas, sum(q.monto) as monto,
                min(q.fecha_vencimiento)::text as "masAntigua", count(*) over()::int as total
           from cuota_mensual q
           join socio s on s.id = q.socio_id
           join jugador j on j.id = s.jugador_id join usuario u on u.id = j.usuario_id
          where s.estado = 'ACTIVO' and ${SQL_CUOTA_VENCIDA}
          group by s.id, u.nombre, u.apellido
          order by min(q.fecha_vencimiento), u.apellido, u.nombre
          limit $1`,
        [limite]
      )
      return {
        cantidad: rows[0]?.total ?? 0,
        elementos: rows.map((f) => ({
          id: f.id,
          titulo: f.socio,
          detalle: `${f.cuotas} ${f.cuotas === 1 ? 'cuota vencida' : 'cuotas vencidas'} · ${dinero(f.monto)} · la más antigua venció el ${diaYMes(f.masAntigua)}`,
          destino: '/gestion/socios?pestana=cuotas',
        })),
      }
    },
  },

  PRODUCTOS_SIN_STOCK: {
    titulo: 'Productos sin stock',
    destino: '/gestion/tienda',
    leer: async (limite, db) => {
      const { rows } = await db.query(
        `select id, nombre, categoria, count(*) over()::int as total
           from producto where activo and stock_actual = 0
          order by nombre, id
          limit $1`,
        [limite]
      )
      return {
        cantidad: rows[0]?.total ?? 0,
        elementos: rows.map((f) => ({ id: f.id, titulo: f.nombre, detalle: `${f.categoria} · sin unidades`, destino: '/gestion/tienda' })),
      }
    },
  },

  DEVOLUCIONES_PENDIENTES: {
    titulo: 'Pagos en línea para devolver',
    destino: '/gestion/caja',
    leer: async (limite, db) => {
      const { rows } = await db.query(
        `select t.id, t.concepto, t.descripcion, t.monto, to_char(t.fecha_hora at time zone ${ZONA}, 'DD/MM/YYYY HH24:MI') as fecha,
                cl.nombre || ' ' || cl.apellido as cliente, count(*) over()::int as total
           from transaccion_caja t
           left join usuario cl on cl.id = t.cliente_usuario_id
          where t.requiere_devolucion and not t.devolucion_gestionada and t.estado = 'APROBADO'
          order by t.fecha_hora, t.id
          limit $1`,
        [limite]
      )
      return {
        cantidad: rows[0]?.total ?? 0,
        elementos: rows.map((f) => ({
          id: f.id,
          titulo: `${dinero(f.monto)} · ${f.cliente ?? 'Sin cliente'}`,
          detalle: `${f.fecha}${f.descripcion ? ` · ${f.descripcion}` : ''}`,
          destino: '/gestion/caja',
        })),
      }
    },
  },
}

export const TIPOS_DE_ALERTA = Object.keys(TIPOS)

// Todas las alertas con elementos pendientes. Devuelve { sinAlertas, mensaje, total, alertas: [{ tipo, titulo, cantidad, destino }] }
// Sin nada que atender: lista vacía, `sinAlertas: true` y un mensaje para mostrar en el panel.
export const alertasDelPanel = async (db = pool) => {
  const alertas = []
  for (const [tipo, definicion] of Object.entries(TIPOS)) {
    const { cantidad } = await definicion.leer(1, db)
    if (cantidad > 0) alertas.push({ tipo, titulo: definicion.titulo, cantidad, destino: definicion.destino })
  }
  return {
    sinAlertas: alertas.length === 0,
    mensaje: alertas.length === 0 ? 'No hay alertas: todo está al día' : null,
    total: alertas.reduce((suma, a) => suma + a.cantidad, 0),
    alertas,
  }
}

// Los elementos de una alerta, con la pantalla de gestión donde se atienden. null si el tipo no existe.
// Devuelve { tipo, titulo, destino, cantidad, elementos, hayMas }  (hasta 100 elementos; `hayMas` avisa si hay más)
export const detalleDeAlerta = async (tipo, db = pool) => {
  const definicion = Object.hasOwn(TIPOS, tipo) ? TIPOS[tipo] : null
  if (!definicion) return null
  const { cantidad, elementos } = await definicion.leer(MAXIMO_ELEMENTOS, db)
  return { tipo, titulo: definicion.titulo, destino: definicion.destino, cantidad, elementos, hayMas: cantidad > elementos.length }
}

// Marca como gestionada la devolución de un pago en línea (el Administrador ya devolvió el dinero por fuera del sistema).
// Devuelve 'OK' · 'NO_EXISTE' · 'NO_REQUIERE' (el pago no tenía devolución pendiente) · 'YA_GESTIONADA'
export const gestionarDevolucion = async (id, db = pool) => {
  const { rows } = await db.query(
    `update transaccion_caja set devolucion_gestionada = true
      where id = $1 and requiere_devolucion and not devolucion_gestionada returning id`,
    [id]
  )
  if (rows[0]) return 'OK'
  const { rows: previa } = await db.query(`select requiere_devolucion, devolucion_gestionada from transaccion_caja where id = $1`, [id])
  if (!previa[0]) return 'NO_EXISTE'
  return previa[0].requiere_devolucion ? 'YA_GESTIONADA' : 'NO_REQUIERE'
}
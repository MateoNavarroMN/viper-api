import { pool } from '../../config/conexion.bd.js'

// Servicio de reportes (CU 6.1 y 6.2). Lo usan el dashboard, la vista previa y la exportación: así los tres muestran siempre
// los mismos números. Solo cuentan los movimientos APROBADO; los anulados, rechazados y pendientes no suman.

const ZONA = "'America/Argentina/Cordoba'"

export const RUBROS = ['TIENDA', 'RESERVA', 'INSCRIPCION', 'CUOTA', 'PROVEEDOR', 'SERVICIOS', 'OTRO']
export const MEDIOS_DE_PAGO = ['EFECTIVO', 'TRANSFERENCIA', 'MERCADO_PAGO']
export const DIAS_MAXIMOS = 366

// Pesos con dos decimales sin errores de punto flotante (se suma en centavos)
const centavos = (monto) => Math.round(Number(monto) * 100)
const pesos = (cent) => cent / 100

const sumarDias = (fecha, dias) => new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * 86400000).toISOString().slice(0, 10)

// Cada día del rango, de `desde` a `hasta` inclusive
const diasDelRango = (desde, hasta) => {
  const dias = []
  for (let dia = desde; dia <= hasta; dia = sumarDias(dia, 1)) dias.push(dia)
  return dias
}

// Primer y último día del mes en curso (hora del club): es el rango por defecto del panel.
export const mesActual = async (db = pool) => {
  const { rows } = await db.query(
    `select to_char(date_trunc('month', current_date), 'YYYY-MM-DD') as desde,
            to_char(date_trunc('month', current_date) + interval '1 month' - interval '1 day', 'YYYY-MM-DD') as hasta`
  )
  return rows[0]
}

// Balance del período [desde, hasta] (fechas AAAA-MM-DD, día del club en Córdoba), opcionalmente de un solo rubro.
// Devuelve:
//   { desde, hasta, rubro, sinMovimientos, cantidadMovimientos,
//     totalIngresos, totalEgresos, saldo,
//     porRubro:  [{ rubro, ingresos, egresos, cantidad }]          (los 7 rubros, o solo el filtrado; en cero si no tuvieron)
//     porMedio:  [{ medio, ingresos, egresos }]                    (Efectivo, Transferencia y Mercado Pago)
//     evolucion: [{ fecha, ingresos, egresos, saldo }] }           (un renglón por día, con los días sin movimientos en cero)
// Un período sin movimientos devuelve ceros, no un error. Los controles de fechas y rubro los hace quien llama.
export const generarBalance = async (desde, hasta, rubro = null, db = pool) => {
  const { rows } = await db.query(
    `select (t.fecha_hora at time zone ${ZONA})::date::text as dia, t.concepto, t.metodo_pago as medio,
            t.tipo_movimiento as tipo, count(*)::int as cantidad, sum(t.monto) as total
       from transaccion_caja t
      where t.estado = 'APROBADO'
        and t.fecha_hora >= $1::date::timestamp at time zone ${ZONA}
        and t.fecha_hora < ($2::date + 1)::timestamp at time zone ${ZONA}
        and ($3::text is null or t.concepto::text = $3)
      group by 1, 2, 3, 4`,
    [desde, hasta, rubro]
  )

  const rubros = new Map((rubro ? [rubro] : RUBROS).map((r) => [r, { rubro: r, ingresos: 0, egresos: 0, cantidad: 0 }]))
  const medios = new Map(MEDIOS_DE_PAGO.map((m) => [m, { medio: m, ingresos: 0, egresos: 0 }]))
  const dias = new Map(diasDelRango(desde, hasta).map((d) => [d, { fecha: d, ingresos: 0, egresos: 0 }]))
  let ingresos = 0
  let egresos = 0
  let cantidad = 0

  for (const f of rows) {
    const importe = centavos(f.total)
    const campo = f.tipo === 'INGRESO' ? 'ingresos' : 'egresos'
    cantidad += f.cantidad
    if (f.tipo === 'INGRESO') ingresos += importe
    else egresos += importe
    const r = rubros.get(f.concepto)
    r[campo] += importe
    r.cantidad += f.cantidad
    medios.get(f.medio)[campo] += importe
    dias.get(f.dia)[campo] += importe
  }

  return {
    desde,
    hasta,
    rubro,
    sinMovimientos: cantidad === 0,
    cantidadMovimientos: cantidad,
    totalIngresos: pesos(ingresos),
    totalEgresos: pesos(egresos),
    saldo: pesos(ingresos - egresos),
    porRubro: [...rubros.values()].map((r) => ({ ...r, ingresos: pesos(r.ingresos), egresos: pesos(r.egresos) })),
    porMedio: [...medios.values()].map((m) => ({ ...m, ingresos: pesos(m.ingresos), egresos: pesos(m.egresos) })),
    evolucion: [...dias.values()].map((d) => ({ ...d, ingresos: pesos(d.ingresos), egresos: pesos(d.egresos), saldo: pesos(d.ingresos - d.egresos) })),
  }
}

// Controles de los filtros del panel. Devuelve { error } con el mensaje y el campo, o { desde, hasta, rubro } listos para usar.
export const validarFiltros = async ({ desde, hasta, rubro }, esFechaValida, db = pool) => {
  for (const [campo, valor] of [['desde', desde], ['hasta', hasta]]) {
    if (valor !== undefined && !esFechaValida(valor)) {
      return { error: { mensaje: `Parámetro inválido: la fecha ${campo} debe tener el formato AAAA-MM-DD`, campo } }
    }
  }
  if (rubro !== undefined && rubro !== '' && !RUBROS.includes(rubro)) {
    return { error: { mensaje: 'Parámetro inválido: el rubro no existe', campo: 'rubro' } }
  }
  const mes = await mesActual(db)
  const rango = { desde: desde ?? mes.desde, hasta: hasta ?? mes.hasta }
  if (rango.desde > rango.hasta) {
    return { error: { mensaje: 'La fecha desde no puede ser posterior a la fecha hasta', campo: 'desde' } }
  }
  if (diasDelRango(rango.desde, rango.hasta).length > DIAS_MAXIMOS) {
    return { error: { mensaje: `El período no puede superar los ${DIAS_MAXIMOS} días`, campo: 'hasta' } }
  }
  return { ...rango, rubro: rubro || null }
}
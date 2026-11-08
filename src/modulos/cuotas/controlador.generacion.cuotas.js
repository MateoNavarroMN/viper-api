import { contarConCuota, contarSociosActivos, generarCuotasDelMes } from './modelo.generacion.cuotas.js'

// Acepta un número o un texto numérico («11»); cualquier otra cosa es NaN
const aNumero = (valor) => {
  if (typeof valor === 'number') return valor
  if (typeof valor === 'string' && valor.trim() !== '') return Number(valor)
  return Number.NaN
}

const invalido = (res, detalle, campo) => res.status(400).json({ mensaje: `Datos inválidos: ${detalle}`, campo })

const dos = (n) => String(n).padStart(2, '0')

// Valida mes y año. Devuelve { mes, anio } o { error: [detalle, campo] }.
const leerPeriodo = ({ mes, anio }) => {
  const m = aNumero(mes)
  const a = aNumero(anio)
  if (!Number.isInteger(m) || m < 1 || m > 12) return { error: ['el mes tiene que estar entre 1 y 12', 'mes'] }
  if (!Number.isInteger(a) || a < 2020 || a > 2100) return { error: ['el año tiene que estar entre 2020 y 2100', 'anio'] }
  return { mes: m, anio: a }
}

// GET /api/cuotas/generar/preview?mes=&anio=  (CU 4.2 · paso 4, Recepcionista y Administrador)
// Sin mes ni año devuelve solo { sociosActivos }. Con los dos suma cuántos ya tienen la cuota de ese período y cuántas se generarían.
export const previsualizar = async (req, res) => {
  const { mes, anio } = req.query
  const conPeriodo = mes !== undefined || anio !== undefined
  let periodo = null
  if (conPeriodo) {
    if (mes === undefined) return invalido(res, 'falta el mes', 'mes')
    if (anio === undefined) return invalido(res, 'falta el año', 'anio')
    periodo = leerPeriodo({ mes, anio })
    if (periodo.error) return invalido(res, ...periodo.error)
  }

  try {
    const sociosActivos = await contarSociosActivos()
    if (!periodo) return res.status(200).json({ sociosActivos })
    const conCuota = await contarConCuota(periodo.mes, periodo.anio)
    return res.status(200).json({ sociosActivos, conCuota, aGenerar: sociosActivos - conCuota })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo consultar la generación de cuotas' })
  }
}

// POST /api/cuotas/generar  (CU 4.2 · pasos 5 a 10, Recepcionista y Administrador)
// Body: { mes, anio, monto, fechaVencimiento: 'YYYY-MM-DD' }
// 201 con { generadas, yaExistentes }. Genera solo las cuotas que faltan (8a).
export const generar = async (req, res) => {
  const body = req.body ?? {}

  // 7a · datos inválidos
  const periodo = leerPeriodo(body)
  if (periodo.error) return invalido(res, ...periodo.error)

  const monto = aNumero(body.monto)
  if (!Number.isFinite(monto) || monto <= 0) return invalido(res, 'el monto tiene que ser mayor a cero', 'monto')
  if (Math.abs(monto * 100 - Math.round(monto * 100)) > 1e-6) return invalido(res, 'el monto puede tener hasta dos decimales', 'monto')
  if (monto >= 10 ** 10) return invalido(res, 'el monto es demasiado grande', 'monto')

  // La fecha tiene que existir de verdad (no 2027-02-30) y ser posterior al inicio del mes
  const { fechaVencimiento } = body
  const partes = typeof fechaVencimiento === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaVencimiento) : null
  const existe = partes && new Date(Date.UTC(+partes[1], +partes[2] - 1, +partes[3])).toISOString().slice(0, 10) === fechaVencimiento
  if (!existe) return invalido(res, 'la fecha de vencimiento no es válida', 'fechaVencimiento')
  if (fechaVencimiento <= `${periodo.anio}-${dos(periodo.mes)}-01`) {
    return invalido(res, 'el vencimiento tiene que ser posterior al inicio del mes', 'fechaVencimiento')
  }

  try {
    const r = await generarCuotasDelMes({ ...periodo, monto, fechaVencimiento })

    if (r.resultado === 'SIN_SOCIOS') return res.status(409).json({ mensaje: 'No hay socios activos a quienes generar cuotas' }) // 4a
    if (r.resultado === 'YA_GENERADAS') return res.status(409).json({ mensaje: 'Las cuotas de ese período ya fueron generadas' }) // 8a
    return res.status(201).json({
      mensaje: 'Cuotas generadas',
      generadas: r.generadas,
      yaExistentes: r.yaExistentes,
      sociosActivos: r.sociosActivos,
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudieron generar las cuotas' })
  }
}
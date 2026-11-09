import { listarHistorialRegla, listarInstancias, listarReglasVigentes, modificarPuntosOtorgados } from './modelo.reglas.puntuacion.js'

const DISCIPLINAS = ['TENIS', 'PADEL']
const MAXIMO_PUNTOS = 1000000

const invalido = (res, detalle, campo) => res.status(400).json({ mensaje: `Datos inválidos: ${detalle}`, campo })

const leerDisciplina = (valor) => String(valor ?? '').toUpperCase()

// Acepta un número o un texto numérico («50»); cualquier otra cosa es NaN
const aNumero = (valor) => {
  if (typeof valor === 'number') return valor
  if (typeof valor === 'string' && valor.trim() !== '') return Number(valor)
  return Number.NaN
}

// GET /api/reglas-puntuacion?disciplina=TENIS  (CU 4.3 · paso 3, Organizador y Administrador)
// Responde { disciplina, reglas: [{ instancia, puntos, vigenteDesde }] }: la regla que rige hoy de cada instancia,
// en orden (participación, victoria en zona, clasificado de zona, octavos … campeón).
export const listar = async (req, res) => {
  const disciplina = leerDisciplina(req.query.disciplina)
  if (!DISCIPLINAS.includes(disciplina)) return invalido(res, 'la disciplina debe ser TENIS o PADEL', 'disciplina')

  try {
    return res.status(200).json({ disciplina, reglas: await listarReglasVigentes(disciplina) })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudieron obtener las reglas de puntuación' })
  }
}

// PUT /api/reglas-puntuacion/:disciplina/:instancia  (CU 4.3 · pasos 4 a 7, Organizador y Administrador)
// Body: { puntos }. Agrega una regla nueva con vigencia desde hoy; si ya había una de hoy, la reemplaza (8a).
// 200 con { mensaje, regla, anterior, reemplazada }. No recalcula nada: los puntos ya otorgados no cambian.
export const modificar = async (req, res) => {
  const disciplina = leerDisciplina(req.params.disciplina)
  if (!DISCIPLINAS.includes(disciplina)) return invalido(res, 'la disciplina debe ser TENIS o PADEL', 'disciplina')

  const instancia = String(req.params.instancia ?? '').toUpperCase()

  // 7a · los puntos tienen que ser un entero de 0 en adelante
  const puntos = aNumero((req.body ?? {}).puntos)
  if (Number.isNaN(puntos)) return invalido(res, 'ingresá los puntos', 'puntos')
  if (!Number.isInteger(puntos)) return invalido(res, 'los puntos tienen que ser un número entero', 'puntos')
  if (puntos < 0) return invalido(res, 'los puntos no pueden ser negativos', 'puntos')
  if (puntos > MAXIMO_PUNTOS) return invalido(res, 'los puntos son demasiados', 'puntos')

  try {
    if (!(await listarInstancias()).includes(instancia)) return invalido(res, 'la instancia no existe', 'instancia')

    const r = await modificarPuntosOtorgados(disciplina, instancia, puntos)
    // 7b · mismo valor que el vigente: no hay nada que guardar
    if (r.resultado === 'SIN_CAMBIOS') return res.status(409).json({ mensaje: 'No hay cambios para guardar' })

    return res.status(200).json({
      mensaje: 'Regla actualizada',
      regla: { disciplina, ...r.regla },
      anterior: r.anterior,
      reemplazada: r.reemplazada,
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo modificar la regla de puntuación' })
  }
}

// GET /api/reglas-puntuacion/:disciplina/:instancia/historial  (CU 4.3 · A1, Organizador y Administrador)
// Responde { disciplina, instancia, historial: [{ puntos, vigenteDesde, vigente }] }, de la regla más nueva a la más vieja.
// Es de solo lectura. La regla que rige hoy viene con `vigente: true`.
export const historial = async (req, res) => {
  const disciplina = leerDisciplina(req.params.disciplina)
  if (!DISCIPLINAS.includes(disciplina)) {
    return res.status(400).json({ mensaje: 'Disciplina o instancia no válida', campo: 'disciplina' })
  }

  const instancia = String(req.params.instancia ?? '').toUpperCase()
  try {
    if (!(await listarInstancias()).includes(instancia)) {
      return res.status(400).json({ mensaje: 'Disciplina o instancia no válida', campo: 'instancia' })
    }
    return res.status(200).json({ disciplina, instancia, historial: await listarHistorialRegla(disciplina, instancia) })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ mensaje: 'No se pudo obtener el historial de la regla' })
  }
}
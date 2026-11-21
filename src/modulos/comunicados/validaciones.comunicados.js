// Validaciones de un comunicado (CU 6.3). Devuelven { datos } o { error: { mensaje, campo } }.

export const ALCANCES = ['TODOS', 'SOLO_SOCIOS']
export const ACCIONES = ['BORRADOR', 'PUBLICAR']
export const TITULO_MAXIMO = 120
export const MENSAJE_MAXIMO = 2000

const invalido = (campo, detalle) => ({ error: { mensaje: `Datos inválidos: ${detalle}`, campo } })

// Deja el texto sin espacios en los bordes. El mensaje conserva sus saltos de línea.
const limpiar = (valor) => (typeof valor === 'string' ? valor.trim() : '')

// Valida el cuerpo de un alta o una edición: { titulo, mensaje, alcance, accion }.
//   - Con accion 'BORRADOR' solo hace falta el título (flujo 6a); el mensaje puede quedar vacío.
//   - Con accion 'PUBLICAR' se exigen título y mensaje completos y dentro del límite (paso 7).
// Se revisa en el orden del formulario: título, mensaje, alcance.
export const validarComunicado = (cuerpo) => {
  const c = cuerpo ?? {}
  if (!ACCIONES.includes(c.accion)) return invalido('accion', 'la acción debe ser BORRADOR o PUBLICAR')
  const publicar = c.accion === 'PUBLICAR'

  const titulo = limpiar(c.titulo)
  if (!titulo) return invalido('titulo', 'el título es obligatorio')
  if (titulo.length > TITULO_MAXIMO) return invalido('titulo', `el título admite hasta ${TITULO_MAXIMO} caracteres`)

  if (c.mensaje !== undefined && typeof c.mensaje !== 'string') return invalido('mensaje', 'el mensaje debe ser un texto')
  const mensaje = limpiar(c.mensaje)
  if (publicar && !mensaje) return invalido('mensaje', 'el mensaje es obligatorio para publicar')
  if (mensaje.length > MENSAJE_MAXIMO) return invalido('mensaje', `el mensaje admite hasta ${MENSAJE_MAXIMO} caracteres`)

  const alcance = c.alcance ?? 'TODOS'
  if (!ALCANCES.includes(alcance)) return invalido('alcance', 'el alcance debe ser TODOS o SOLO_SOCIOS')

  return { datos: { titulo, mensaje, alcance, accion: c.accion } }
}
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const REGEX_DNI = /^[0-9]{7,9}$/
const REGEX_TELEFONO = /^[0-9+()\- ]{6,20}$/

// Quita puntos y espacios del DNI.
export const normalizarDni = (dni) => dni.replace(/[.\s]/g, '')

export const validarNombre = (valor, etiqueta) => {
  if (!valor.trim()) return 'Campo obligatorio'
  if (valor.trim().length > 60) return `${etiqueta} puede tener como máximo 60 caracteres`
  return null
}

export const validarDni = (valor) => {
  if (!valor.trim()) return 'Campo obligatorio'
  if (!REGEX_DNI.test(normalizarDni(valor))) return 'El DNI debe tener entre 7 y 9 dígitos'
  return null
}

export const validarEmail = (valor) => {
  if (!valor.trim()) return 'Campo obligatorio'
  if (!REGEX_EMAIL.test(valor.trim()) || valor.trim().length > 254) return 'Formato de correo inválido'
  return null
}

// El teléfono es opcional.
export const validarTelefono = (valor) => {
  if (!valor.trim()) return null
  if (!REGEX_TELEFONO.test(valor.trim())) return 'El teléfono no tiene un formato válido'
  return null
}

// Requisitos de contraseña
export const REQUISITOS_PASSWORD = [
  { texto: 'Mínimo 8 caracteres', cumple: (p) => p.length >= 8 },
  { texto: 'Al menos una letra', cumple: (p) => /[A-Za-z]/.test(p) },
  { texto: 'Al menos un número', cumple: (p) => /[0-9]/.test(p) },
]

export const validarPassword = (valor) => {
  if (!valor) return 'Campo obligatorio'
  if (valor.length < 8) return 'No cumple los requisitos mínimos'
  if (new TextEncoder().encode(valor).length > 72) return 'Debe tener como máximo 72 caracteres'
  if (!REQUISITOS_PASSWORD.every((requisito) => requisito.cumple(valor))) return 'No cumple los requisitos mínimos'
  return null
}
// Cliente HTTP simple sobre fetch. Todas las pantallas llaman a la API con estas funciones.
// Si la API responde con error, se lanza un Error con:
//   error.status  → código HTTP (0 si no hubo respuesta)
//   error.mensaje → texto para mostrar al usuario
//   error.campo   → nombre del campo con problema (si la API lo informa), para resaltarlo en rojo
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

// Clave donde se guarda el token JWT (lo maneja M1-FE-02)
export const TOKEN_KEY = 'viper_token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)

async function pedir(metodo, ruta, cuerpo) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (cuerpo !== undefined) headers['Content-Type'] = 'application/json'

  let respuesta
  try {
    respuesta = await fetch(`${API_URL}${ruta}`, {
      method: metodo,
      headers,
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    })
  } catch {
    const error = new Error('No se pudo conectar con el servidor')
    error.status = 0
    error.mensaje = 'No se pudo conectar con el servidor'
    throw error
  }

  // Algunas respuestas no traen cuerpo (por ejemplo 204) o no son JSON
  const datos = await respuesta.json().catch(() => null)

  if (!respuesta.ok) {
    const mensaje = datos?.mensaje ?? 'Ocurrió un error inesperado'
    const error = new Error(mensaje)
    error.status = respuesta.status
    error.mensaje = mensaje
    error.campo = datos?.campo
    throw error
  }

  return datos
}

export const get = (ruta) => pedir('GET', ruta)
export const post = (ruta, cuerpo) => pedir('POST', ruta, cuerpo ?? {})
export const put = (ruta, cuerpo) => pedir('PUT', ruta, cuerpo ?? {})
export const patch = (ruta, cuerpo) => pedir('PATCH', ruta, cuerpo ?? {})
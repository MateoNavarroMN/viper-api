import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

// Imágenes de productos en Supabase Storage. Se usa la service role, que solo existe en el servidor.
// El cliente se crea la primera vez que hace falta, así la API arranca igual aunque falten estas variables.
export const BUCKET = process.env.SUPABASE_BUCKET_PRODUCTOS || 'productos'

let cliente = null
const obtenerCliente = () => {
  if (cliente) return cliente
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno')
  }
  cliente = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  return cliente
}

// Sube la imagen como <uuid>.<ext> y devuelve su URL pública.
export const subirImagenProducto = async (buffer, tipo) => {
  const storage = obtenerCliente().storage.from(BUCKET)
  const ruta = `${randomUUID()}.${tipo.extension}`
  const { error } = await storage.upload(ruta, buffer, { contentType: tipo.mime, upsert: false })
  if (error) throw new Error(`No se pudo subir la imagen: ${error.message}`)
  return storage.getPublicUrl(ruta).data.publicUrl
}

// Borra del bucket el archivo de una URL pública. Nunca tira error: una imagen que no se pudo borrar no debe frenar una
// operación ya hecha (queda un archivo huérfano, que se puede limpiar a mano desde el panel de Supabase).
export const borrarImagenProducto = async (url) => {
  if (!url) return
  const marca = `/${BUCKET}/`
  const posicion = url.indexOf(marca)
  if (posicion === -1) return
  const ruta = decodeURIComponent(url.slice(posicion + marca.length).split('?')[0])
  try {
    const { error } = await obtenerCliente().storage.from(BUCKET).remove([ruta])
    if (error) console.error('No se pudo borrar la imagen anterior:', error.message)
  } catch (error) {
    console.error('No se pudo borrar la imagen anterior:', error.message)
  }
}
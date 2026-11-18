import multer from 'multer'

export const TAMANIO_MAXIMO_IMAGEN = 2 * 1024 * 1024 // 2 MB

const MENSAJE_TIPO = 'La imagen debe ser JPG, PNG o WebP'
const MENSAJE_TAMANIO = 'La imagen no puede superar los 2 MB'

// Reconoce el tipo REAL del archivo por sus primeros bytes, no por la extensión ni por lo que declara el navegador.
export const tipoDeImagen = (b) => {
  if (!Buffer.isBuffer(b) || b.length < 12) return null
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', extension: 'jpg' }
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', extension: 'png' }
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', extension: 'webp' }
  return null
}

export const errorDeImagen = (mensaje) => ({ mensaje, campo: 'imagen' })
export const ERROR_TIPO_IMAGEN = errorDeImagen(MENSAJE_TIPO)

const recibir = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANIO_MAXIMO_IMAGEN, files: 1, fields: 20 },
}).single('imagen')

// Lee el campo opcional «imagen» de un formulario multipart/form-data (queda en req.file). Un pedido JSON pasa de largo.
// Si el archivo es demasiado grande o viene en otro campo, responde 400 (7b) sin llegar al controller.
export const recibirImagen = (req, res, next) => {
  recibir(req, res, (error) => {
    if (!error) return next()
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') return res.status(400).json(errorDeImagen(MENSAJE_TAMANIO))
      return res.status(400).json(errorDeImagen('Enviá una sola imagen en el campo «imagen»'))
    }
    console.error(error)
    return res.status(400).json({ mensaje: 'No se pudo leer el formulario enviado' })
  })
}
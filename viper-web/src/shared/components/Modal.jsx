import { useEffect, useRef } from 'react'

// Ventana centrada con fondo oscuro. Se cierra con Escape o tocando afuera.
// cabecera: false oculta el título y la X (lo usa ConfirmDialog, que dibuja la suya)
// posicion: 'centro' (siempre centrada) | 'abajo-movil' (desde abajo en móvil, centrada desde md; la usa BottomSheet)
export default function Modal({ abierto, titulo, onCerrar, posicion = 'centro', cabecera = true, children }) {
  const panel = useRef(null)

  useEffect(() => {
    if (!abierto) return
    const alTeclear = (e) => e.key === 'Escape' && onCerrar()
    document.addEventListener('keydown', alTeclear)
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    return () => {
      document.removeEventListener('keydown', alTeclear)
      document.body.style.overflow = ''
    }
  }, [abierto, onCerrar])

  if (!abierto) return null

  const ubicacion =
    posicion === 'abajo-movil' ? 'items-end md:items-center' : 'items-center'
  const forma =
    posicion === 'abajo-movil' ? 'rounded-t-2xl md:rounded-2xl' : 'rounded-2xl'

  return (
    <div
      className={`fixed inset-0 z-[70] flex justify-center ${ubicacion} bg-black/60 backdrop-blur-sm md:px-6`}
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        className={`bg-panel border border-gray-800 w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 md:p-8 focus:outline-none ${forma}`}
      >
        {cabecera && (
          <div className="flex items-start justify-between gap-4 mb-4">
            <h2 className="font-outfit text-xl font-bold">{titulo}</h2>
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar"
              className="text-texto-suave hover:text-viper transition-colors cursor-pointer"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
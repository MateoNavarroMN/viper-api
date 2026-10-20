import Modal from './Modal'
import Button from './Button'

const ICONO = {
  advertencia: { clases: 'bg-advertencia/20 text-advertencia', variante: 'advertencia' },
  peligro: { clases: 'bg-error/20 text-error', variante: 'peligro' },
}

// Confirmación de una acción. `tipo` define el ícono y el color del botón de confirmar:
//   'advertencia' (ámbar, para descartar cambios, cerrar inscripciones...) o 'peligro' (rojo, para cancelar, bloquear, archivar...).
// `variante` permite cambiar solo el botón (por ejemplo 'primario' en "Cerrar inscripciones").
export default function ConfirmDialog({
  abierto,
  tipo = 'advertencia',
  variante,
  titulo,
  mensaje,
  textoConfirmar = 'Confirmar',
  textoCancelar = 'Cancelar',
  cargando = false,
  onConfirmar,
  onCancelar,
}) {
  const { clases, variante: varianteTipo } = ICONO[tipo]
  return (
    <Modal abierto={abierto} titulo={titulo} onCerrar={onCancelar} cabecera={false}>
      <div className={`w-11 h-11 rounded-full flex items-center justify-center mb-5 ${clases}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        </svg>
      </div>
      <h2 className="font-outfit text-xl font-bold mb-2">{titulo}</h2>
      <p className="text-texto-suave leading-relaxed">{mensaje}</p>
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-8">
        <Button variante="neutro" onClick={onCancelar} disabled={cargando}>
          {textoCancelar}
        </Button>
        <Button variante={variante ?? varianteTipo} onClick={onConfirmar} cargando={cargando}>
          {textoConfirmar}
        </Button>
      </div>
    </Modal>
  )
}
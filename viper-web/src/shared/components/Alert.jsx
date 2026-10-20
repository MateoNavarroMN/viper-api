const VARIANTES = {
  error: 'bg-error/10 border-error/50 text-error',
  exito: 'bg-exito/10 border-exito/50 text-exito',
  advertencia: 'bg-advertencia/10 border-advertencia/50 text-advertencia',
  info: 'bg-info/10 border-info/50 text-info',
}

const ICONOS = {
  error: 'M12 8v4m0 4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z',
  exito: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0zM9 12l2 2 4-4',
  advertencia: 'M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
  info: 'M12 16v-4m0-4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z',
}

// Mensaje en recuadro dentro de una pantalla (errores de formulario, avisos, información).
// variante: 'error' | 'exito' | 'advertencia' | 'info'. `titulo` es opcional; el texto va como children.
export default function Alert({ variante = 'info', titulo, children }) {
  return (
    <div
      role={variante === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-3 border rounded-xl px-4 py-3 ${VARIANTES[variante]}`}
    >
      <svg className="shrink-0 mt-0.5" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={ICONOS[variante]} />
      </svg>
      <div>
        {titulo && <p className="font-semibold text-texto">{titulo}</p>}
        <p className={titulo ? 'text-texto-suave text-sm' : 'text-texto'}>{children}</p>
      </div>
    </div>
  )
}
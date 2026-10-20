import { useCallback, useMemo, useState } from 'react'
import { ToastContext } from '../hooks/ToastContext'

const COLORES = {
    exito: 'border-exito/50 text-exito',
    error: 'border-error/50 text-error',
    advertencia: 'border-advertencia/50 text-advertencia',
}

const ICONOS = {
    exito: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0zM9 12l2 2 4-4',
    error: 'M12 8v4m0 4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z',
    advertencia: 'M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
}

// Se monta una sola vez en main.jsx. Los avisos desaparecen solos a los 4 segundos.
export default function ToastProvider({ children }) {
    const [avisos, setAvisos] = useState([])

    const mostrarToast = useCallback((mensaje, tipo = 'exito') => {
        const id = crypto.randomUUID()
        setAvisos((actuales) => [...actuales, { id, mensaje, tipo }])
        setTimeout(() => setAvisos((actuales) => actuales.filter((a) => a.id !== id)), 4000)
    }, [])

    const valor = useMemo(() => ({ mostrarToast }), [mostrarToast])

    return (
        <ToastContext.Provider value={valor}>
            {children}
            <div
                aria-live="polite"
                className="fixed top-6 left-6 right-6 sm:left-auto sm:w-96 z-[80] flex flex-col gap-3"
            >
                {avisos.map(({ id, mensaje, tipo }) => (
                    <div key={id} className={`flex items-center gap-3 bg-panel border rounded-xl px-5 py-4 shadow-2xl ${COLORES[tipo]}`}>
                        <svg className="shrink-0" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d={ICONOS[tipo]} />
                        </svg>
                        <span className="text-texto">{mensaje}</span>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    )
}
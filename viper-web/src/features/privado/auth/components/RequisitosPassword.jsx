import { REQUISITOS_PASSWORD } from '../../../../shared/utils/validaciones'

const ICONOS = {
  cumple: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0zM9 12l2 2 4-4',
  falta: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0zM15 9l-6 6m0-6 6 6',
}

// Lista de requisitos de la contraseña: cada uno se pone verde o rojo según se cumpla.
export default function RequisitosPassword({ password }) {
  return (
    <ul className="bg-fondo border border-gray-800 rounded-xl px-4 py-3 flex flex-col gap-2" aria-label="Requisitos de la contraseña">
      {REQUISITOS_PASSWORD.map(({ texto, cumple }) => {
        const ok = cumple(password)
        return (
          <li key={texto} className={`flex items-center gap-2 text-sm ${ok ? 'text-exito' : 'text-error'}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={ok ? ICONOS.cumple : ICONOS.falta} />
            </svg>
            <span className={ok ? 'text-texto' : ''}>{texto}</span>
            <span className="sr-only">{ok ? 'cumplido' : 'pendiente'}</span>
          </li>
        )
      })}
    </ul>
  )
}
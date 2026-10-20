import { useState } from 'react'
import Input from './Input'

const OJO = ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z']
const OJO_TACHADO = [
  'M9.88 9.88a3 3 0 1 0 4.24 4.24',
  'M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68',
  'M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61',
  'M2 2l20 20',
]

export default function PasswordInput({ error = false, className = '', ...resto }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input type={visible ? 'text' : 'password'} error={error} className={`pr-12 ${className}`} {...resto} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-texto-suave hover:text-texto transition-colors cursor-pointer"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {(visible ? OJO_TACHADO : OJO).map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
      </button>
    </div>
  )
}
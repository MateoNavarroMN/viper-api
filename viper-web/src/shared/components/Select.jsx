import { CLASES_CAMPO, claseBorde } from '../utils/campo'

// opciones: [{ valor, texto }]. `placeholder` agrega una primera opción vacía.
export default function Select({ opciones = [], placeholder, error = false, className = '', ...resto }) {
  return (
    <div className="relative">
      <select
        aria-invalid={error || undefined}
        className={`${CLASES_CAMPO} ${claseBorde(error)} appearance-none pr-10 cursor-pointer ${className}`}
        {...resto}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {opciones.map(({ valor, texto }) => (
          <option key={valor} value={valor}>
            {texto}
          </option>
        ))}
      </select>
      <svg
        className="absolute right-3 top-1/2 -translate-y-1/2 text-texto-suave pointer-events-none"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  )
}
import { CLASES_CAMPO, claseBorde } from '../utils/campo'

// Campo de texto. `error` (true/false) lo resalta en rojo; el mensaje lo muestra FormField.
export default function Input({ error = false, className = '', ...resto }) {
  return (
    <input
      aria-invalid={error || undefined}
      className={`${CLASES_CAMPO} ${claseBorde(error)} ${className}`}
      {...resto}
    />
  )
}
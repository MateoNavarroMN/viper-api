const VARIANTES = {
  neutro: 'bg-texto-suave/20 text-texto-suave',
  exito: 'bg-exito/15 text-exito',
  advertencia: 'bg-advertencia/15 text-advertencia',
  error: 'bg-error/15 text-error',
  info: 'bg-info/15 text-info',
  violeta: 'bg-violeta/15 text-violeta',
}

// variante: 'neutro' | 'exito' | 'advertencia' | 'error' | 'info' | 'violeta'
export default function Badge({ variante = 'neutro', children }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-0.5 text-sm font-medium whitespace-nowrap ${VARIANTES[variante]}`}
    >
      {children}
    </span>
  )
}
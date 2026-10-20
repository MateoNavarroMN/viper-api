import Spinner from './Spinner'

const VARIANTES = {
    primario:
        'bg-viper hover:bg-viper-hover text-black shadow-[0_0_20px_rgba(16,185,129,0.3)]',
    secundario: 'bg-transparent border border-viper text-viper hover:bg-viper/20',
    neutro: 'bg-panel border border-gray-800 text-texto hover:border-viper',
    peligro: 'bg-error hover:bg-error/90 text-white',
    advertencia: 'bg-advertencia hover:bg-advertencia/90 text-black',
}

const TAMANOS = {
    grande: 'px-8 py-4 rounded-xl font-bold text-lg',
    compacto: 'px-6 py-2 rounded-lg font-semibold',
}

// variante: 'primario' | 'secundario' | 'neutro' | 'peligro' | 'advertencia'
// tamano: 'grande' | 'compacto'
// cargando: deshabilita el botón y muestra un spinner (por ejemplo, mientras se envía un formulario)
export default function Button({
    variante = 'primario',
    tamano = 'compacto',
    cargando = false,
    disabled = false,
    type = 'button',
    className = '',
    children,
    ...resto
}) {
    const inactivo = disabled || cargando
    return (
        <button
            type={type}
            disabled={inactivo}
            className={`font-outfit inline-flex items-center justify-center gap-2 transition-colors duration-300 transition-transform ${inactivo ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 cursor-pointer'
                } ${VARIANTES[variante]} ${TAMANOS[tamano]} ${className}`}
            {...resto}
        >
            {cargando && <Spinner tamano="chico" />}
            {children}
        </button>
    )
}
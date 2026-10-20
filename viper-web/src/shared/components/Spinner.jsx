// tamano: 'chico' (dentro de botones, toma el color del texto del botón) | 'normal' (verde)
export default function Spinner({ tamano = 'normal', texto = 'Cargando' }) {
    const medida = tamano === 'chico' ? 'w-4 h-4' : 'w-8 h-8'
    return (
        <span role="status" className={`inline-flex items-center justify-center ${tamano === 'chico' ? '' : 'text-viper'}`}>
            <span className={`${medida} border-2 border-current border-t-transparent rounded-full animate-spin`} />
            <span className="sr-only">{texto}</span>
        </span>
    )
}
import { Link } from 'react-router-dom'

export default function AuthLayout({ accion, children }) {
  return (
    <div className="relative min-h-screen bg-fondo overflow-hidden">
        
      <div className="absolute top-24 left-1/2 -translate-x-1/2 w-[28rem] h-72 bg-viper opacity-15 blur-[100px] rounded-full pointer-events-none" />

      <header className="relative z-10 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer">
            <span className="font-outfit text-2xl font-bold tracking-wide">
              VIPER <span className="text-viper">|</span>
            </span>
            <span className="font-outfit text-lg text-texto-suave hidden sm:block">Gestión Deportiva</span>
          </Link>
          {accion && (
            <Link
              to={accion.ruta}
              className="font-outfit bg-transparent border border-viper text-viper hover:bg-viper/20 px-6 py-2 rounded-lg font-semibold transition-colors duration-300 transition-transform hover:scale-105"
            >
              {accion.texto}
            </Link>
          )}
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-10 pb-12 md:pt-14">{children}</main>
    </div>
  )
}
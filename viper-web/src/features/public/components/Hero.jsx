import { Link } from 'react-router-dom'
import HeroBall3D from './HeroBall3D'

export default function Hero() {
  return (
    <section className="relative pt-24 pb-0 sm:pt-28 lg:pt-32 lg:pb-12 px-6 max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-8 lg:gap-12">

      <div className="flex-1 text-center lg:text-left">
        <h1 className="font-outfit text-5xl lg:text-7xl font-bold mb-6 leading-tight text-balance">
          El siguiente nivel <br className="hidden md:block" />
          en <span className="text-viper">Gestión Deportiva.</span>
        </h1>
        <p className="text-texto-suave text-lg lg:text-xl mb-10 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
          Torneos automatizados, reservas sin solapamientos, ranking en tiempo real y conciliación de caja en una sola plataforma para clubes de tenis y pádel. Los jugadores se suman gratis con su propia cuenta.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
          <button className="font-outfit bg-viper hover:bg-viper-hover text-black w-full sm:w-auto px-8 py-4 rounded-xl font-bold text-lg transition-transform hover:scale-105 shadow-[0_0_20px_rgba(16,185,129,0.3)] cursor-pointer">
            Solicitar Demo
          </button>

          <Link
            to="/torneos"
            className="font-outfit block text-center bg-transparent border border-viper text-viper hover:bg-viper/20 w-full sm:w-auto px-8 py-4 rounded-xl font-bold text-lg transition-colors duration-300 transition-transform hover:scale-105"
          >
            Gestión de Torneos
          </Link>
        </div>
      </div>

      <div className="flex-1 w-full max-w-lg lg:max-w-none relative">
        <div className="absolute inset-0 bg-viper opacity-20 blur-[60px] lg:blur-[100px] rounded-full"></div>
        <HeroBall3D className="relative z-10 w-full" />
      </div>

    </section>
  )
}
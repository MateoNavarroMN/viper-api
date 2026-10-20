import { useState, useEffect } from 'react'
import { Link, NavLink } from 'react-router-dom'

const ENLACES = [
  { texto: 'Reservas', ruta: '/reservas' },
  { texto: 'Torneos', ruta: '/torneos' },
  { texto: 'Ranking', ruta: '/ranking' },
  { texto: 'Tienda', ruta: '/tienda' },
]

export default function Navbar() {
  const [menuAbierto, setMenuAbierto] = useState(false)

  useEffect(() => {
    if (menuAbierto) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
  }, [menuAbierto])

  return (
    <>
      <nav className="fixed w-full top-0 z-[60] bg-fondo/90 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">

          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer">
            <span className="font-outfit text-2xl font-bold tracking-wide">
              VIPER <span className="text-viper">|</span>
            </span>
            <span className="font-outfit text-lg text-texto-suave hidden sm:flex flex-col items-center leading-none">
              <span>Gestión</span>
              <span>Deportiva</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8 font-medium text-texto-suave">
            {ENLACES.map(({ texto, ruta }) => (
              <NavLink
                key={ruta}
                to={ruta}
                className={({ isActive }) => `${isActive ? 'text-viper' : ''} hover:text-viper transition-colors`}
              >
                {texto}
              </NavLink>
            ))}
            <button className="font-outfit bg-transparent border border-viper text-viper hover:bg-viper/20 px-6 py-2 rounded-lg font-semibold transition-colors duration-300 transition-transform hover:scale-105 cursor-pointer">
              Iniciar Sesión
            </button>
          </div>

          <button
            onClick={() => setMenuAbierto(!menuAbierto)}
            className="md:hidden flex flex-col justify-center items-center w-8 h-8 gap-1.5 focus:outline-none"
            aria-label="Menú principal"
          >
            <span className={`block w-6 h-[2px] bg-texto rounded-full transition-transform duration-300 ease-in-out origin-center ${menuAbierto ? 'rotate-45 translate-y-[8px]' : ''}`}></span>
            <span className={`block w-6 h-[2px] bg-texto rounded-full transition-opacity duration-200 ease-in-out ${menuAbierto ? 'opacity-0' : 'opacity-100'}`}></span>
            <span className={`block w-6 h-[2px] bg-texto rounded-full transition-transform duration-300 ease-in-out origin-center ${menuAbierto ? '-rotate-45 -translate-y-[8px]' : ''}`}></span>
          </button>

        </div>
      </nav>

      <div
        className={`md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 ${menuAbierto ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        onClick={() => setMenuAbierto(false)}
      ></div>

      <div
        className={`md:hidden fixed top-0 right-0 w-3/4 max-w-sm h-screen bg-panel/85 backdrop-blur-2xl border-l border-gray-800 z-50 transition-transform duration-300 ease-in-out flex flex-col pt-28 px-8 shadow-2xl ${menuAbierto ? 'translate-x-0' : 'translate-x-full'
          }`}
      >
        <div className="flex flex-col gap-6">
          {ENLACES.map(({ texto, ruta }) => (
            <NavLink
              key={ruta}
              to={ruta}
              onClick={() => setMenuAbierto(false)}
              className={({ isActive }) => `${isActive ? 'text-viper' : 'text-texto'} hover:text-viper text-xl font-medium transition-colors border-b border-gray-800 pb-4`}
            >
              {texto}
            </NavLink>
          ))}

          <button onClick={() => setMenuAbierto(false)} className="mt-8 font-outfit bg-transparent border border-viper text-viper hover:bg-viper/20 w-full py-4 rounded-xl font-bold transition-colors duration-300 text-lg">
            Iniciar Sesión
          </button>
        </div>
      </div>
    </>
  )
}
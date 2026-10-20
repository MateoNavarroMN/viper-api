export default function Footer() {
  return (
    <footer className="border-t border-gray-800 bg-panel py-8 mt-12">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
        
        <div>
          <span className="font-outfit text-xl font-bold">VIPER</span>
          <p className="text-texto-suave text-sm mt-1">
            Sistema Integral de Gestión Deportiva
          </p>
        </div>

        <div className="text-texto-suave text-sm">
          <p>© 2026 Viper. Córdoba, Argentina.</p>
        </div>

      </div>
    </footer>
  )
}
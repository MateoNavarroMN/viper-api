import { Link } from 'react-router-dom'

export default function ModuleInfoPage({ titulo, resaltado, descripcion, pasos }) {
  return (
    <section className="max-w-7xl mx-auto px-6 pt-28 pb-12 lg:pt-36">
      <div className="text-center mb-10 md:mb-16">
        <h1 className="font-outfit text-4xl lg:text-6xl font-bold mb-6 leading-tight text-balance">
          {titulo} <span className="text-viper">{resaltado}</span>
        </h1>
        <p className="text-texto-suave text-lg lg:text-xl max-w-2xl mx-auto leading-relaxed">
          {descripcion}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {pasos.map((paso, index) => (
          <div
            key={paso.titulo}
            className="bg-panel border border-gray-800 p-8 rounded-2xl hover:border-viper transition-colors group"
          >
            <div className="w-12 h-12 bg-fondo rounded-lg border border-gray-700 flex items-center justify-center mb-6 group-hover:bg-viper/10 group-hover:border-viper/50 transition-colors">
              <span className="font-outfit text-xl font-bold text-viper">{index + 1}</span>
            </div>
            <h3 className="font-outfit text-xl font-bold mb-3">{paso.titulo}</h3>
            <p className="text-texto-suave leading-relaxed">{paso.desc}</p>
          </div>
        ))}
      </div>

      <div className="flex justify-center mt-12">
        <Link
          to="/"
          className="font-outfit block text-center bg-transparent border border-viper text-viper hover:bg-viper/20 w-full sm:w-auto px-8 py-4 rounded-xl font-bold text-lg transition-colors duration-300 transition-transform hover:scale-105"
        >
          Volver al inicio
        </Link>
      </div>
    </section>
  )
}

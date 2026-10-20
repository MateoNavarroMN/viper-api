// pestanas: [{ clave, titulo }]. Controlado desde afuera:
//   <Tabs pestanas={[...]} activa={pestana} onCambiar={setPestana} />
export default function Tabs({ pestanas, activa, onCambiar }) {
  return (
    <div role="tablist" className="flex gap-6 border-b border-gray-800 overflow-x-auto">
      {pestanas.map(({ clave, titulo }) => {
        const seleccionada = clave === activa
        return (
          <button
            key={clave}
            type="button"
            role="tab"
            aria-selected={seleccionada}
            onClick={() => onCambiar(clave)}
            className={`font-outfit font-semibold whitespace-nowrap pb-3 -mb-px border-b-2 transition-colors cursor-pointer ${seleccionada
                ? 'text-viper border-viper'
                : 'text-texto-suave border-transparent hover:text-viper'
              }`}
          >
            {titulo}
          </button>
        )
      })}
    </div>
  )
}
// Mensaje cuando no hay datos (listas vacías, búsquedas sin resultados). `accion` es un botón opcional.
export default function EmptyState({ titulo, descripcion, accion }) {
  return (
    <div className="bg-panel border border-gray-800 rounded-2xl p-8 text-center">
      <div className="w-12 h-12 bg-fondo rounded-lg border border-gray-700 flex items-center justify-center mx-auto mb-6">
        <svg
          className="text-viper drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M22 12h-6l-2 3h-4l-2-3H2" />
          <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
        </svg>
      </div>
      <h3 className="font-outfit text-xl font-bold mb-3">{titulo}</h3>
      {descripcion && <p className="text-texto-suave leading-relaxed">{descripcion}</p>}
      {accion && <div className="mt-6 flex justify-center">{accion}</div>}
    </div>
  )
}
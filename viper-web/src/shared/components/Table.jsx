// En pantallas grandes es una tabla; en el celular cada fila pasa a ser una tarjeta.
// columnas: [{ clave, titulo, render?: (fila) => contenido }]. Sin `render` muestra fila[clave].
// claveFila: nombre del campo único de cada fila (por defecto 'id').
export default function Table({ columnas, filas, claveFila = 'id' }) {
  const valor = (columna, fila) => (columna.render ? columna.render(fila) : fila[columna.clave])

  return (
    <>
      <div className="hidden md:block bg-panel border border-gray-800 rounded-2xl overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-800 text-texto-suave">
              {columnas.map((c) => (
                <th key={c.clave} className="text-xs font-semibold uppercase tracking-wide px-6 py-4 whitespace-nowrap">
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={fila[claveFila]} className="border-b border-gray-800 last:border-b-0 hover:bg-fondo/50 transition-colors">
                {columnas.map((c) => (
                  <td key={c.clave} className="px-6 py-4">
                    {valor(c, fila)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden flex flex-col gap-4">
        {filas.map((fila) => (
          <div key={fila[claveFila]} className="bg-panel border border-gray-800 rounded-2xl p-6 flex flex-col gap-3">
            {columnas.map((c) => (
              <div key={c.clave} className="flex items-start justify-between gap-4">
                <span className="text-texto-suave">{c.titulo}</span>
                <span className="text-right">{valor(c, fila)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}
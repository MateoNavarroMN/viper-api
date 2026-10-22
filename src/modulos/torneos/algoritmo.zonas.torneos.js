// Zonas y fixture todos contra todos (CU 3.4 · paso 4). Funciones puras: no tocan la base ni leen nada de afuera,
// así se pueden probar solas y reutilizar (M3-BE-14 las usa para generar el cuadro de un torneo con zonas).
//
// Forma del resultado (cada zona se corresponde con una fila de `zona` y cada partido con una fila de `partido`
// de fase ZONA; las filas de `posicion_zona` salen de `participantes`):
//   { participantes, zonas: [{ nombre, participantes: [id], partidos: [{ ronda, posicion, local, visitante }] }] }
// `ronda` es la fecha (jornada) del fixture y `posicion` el lugar del partido dentro de esa fecha.

// Mínimo de participantes para un torneo con zonas (cada zona necesita al menos 3, y con 5 no se puede armar 3 + 3)
export const MINIMO_CON_ZONAS = 6

// 0 → 'Zona A', 25 → 'Zona Z', 26 → 'Zona AA'
const nombreDeZona = (indice) => {
  let letras = ''
  let n = indice
  do {
    letras = String.fromCharCode(65 + (n % 26)) + letras
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return `Zona ${letras}`
}

// Cuántos lugares tiene cada zona. Las zonas son de 3 o 4: hay una cada 4 participantes (redondeando hacia arriba)
// y se reparte parejo, con las más grandes primero. 7 → [4, 3]; 10 → [4, 3, 3]; 12 → [4, 4, 4]; 13 → [4, 3, 3, 3].
export const tamanosDeZonas = (cantidad) => {
  if (cantidad < MINIMO_CON_ZONAS) throw new Error(`Hacen falta al menos ${MINIMO_CON_ZONAS} participantes`)
  const zonas = Math.ceil(cantidad / 4)
  const base = Math.floor(cantidad / zonas)
  const conUnoMas = cantidad % zonas
  return Array.from({ length: zonas }, (_, i) => (i < conUnoMas ? base + 1 : base))
}

// Mezcla una copia del arreglo (Fisher-Yates). `aleatorio` devuelve un número en [0, 1) y se puede inyectar para probar.
const mezclar = (lista, aleatorio) => {
  const copia = [...lista]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

// Todos contra todos por el método del círculo: uno queda fijo y los demás rotan. Con una cantidad impar se suma un
// "libre" (null) que descansa en cada fecha. Devuelve [{ ronda, posicion, local, visitante }]. El local y el visitante
// se reparten a medida que avanzan las fechas: quien venía jugando más de local pasa a visitante, así nadie queda
// siempre del mismo lado.
export const fixtureTodosContraTodos = (ids) => {
  const lugares = ids.length % 2 === 0 ? [...ids] : [...ids, null]
  const total = lugares.length
  const balance = Object.fromEntries(ids.map((id) => [id, 0])) // veces de local − veces de visitante
  const partidos = []
  for (let ronda = 1; ronda < total; ronda++) {
    let posicion = 0
    for (let i = 0; i < total / 2; i++) {
      const a = lugares[i]
      const b = lugares[total - 1 - i]
      if (a === null || b === null) continue
      const invertir = balance[a] > balance[b]
      const [local, visitante] = invertir ? [b, a] : [a, b]
      balance[local]++
      balance[visitante]--
      partidos.push({ ronda, posicion: ++posicion, local, visitante })
    }
    // Rotación: el último pasa al segundo lugar y los demás corren uno
    lugares.splice(1, 0, lugares.pop())
  }
  return partidos
}

// participantes: [{ id, cabezaDeSerie }] ya ordenados por ranking (como los entrega GET /torneos/:id/cabezas-de-serie).
// Cada cabeza de serie va a una zona distinta (la primera a la Zona A, la segunda a la B…, en el orden recibido);
// el resto se sortea en los lugares que quedan. Las zonas son de 3 o 4 con reparto parejo.
export const generarZonas = (participantes, { aleatorio = Math.random } = {}) => {
  const n = participantes.length
  if (new Set(participantes.map((p) => p.id)).size !== n) throw new Error('Hay participantes repetidos')
  const tamanos = tamanosDeZonas(n)

  const cabezas = participantes.filter((p) => p.cabezaDeSerie)
  if (cabezas.length > tamanos.length) throw new Error('Hay más cabezas de serie que zonas')
  const resto = mezclar(participantes.filter((p) => !p.cabezaDeSerie), aleatorio)

  const zonas = tamanos.map((tamano, i) => {
    const integrantes = cabezas[i] ? [cabezas[i].id] : []
    while (integrantes.length < tamano) integrantes.push(resto.shift().id)
    return {
      nombre: nombreDeZona(i),
      participantes: integrantes,
      partidos: fixtureTodosContraTodos(integrantes),
    }
  })

  return { participantes: n, zonas }
}
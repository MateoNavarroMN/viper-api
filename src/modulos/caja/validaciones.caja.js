// Una fecha AAAA-MM-DD que exista de verdad (rechaza 2026-02-30 o 2026-13-01).
export const esFechaValida = (texto) => {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false
  const fecha = new Date(`${texto}T00:00:00Z`)
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === texto
}
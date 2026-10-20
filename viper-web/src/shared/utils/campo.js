// Clases compartidas por Input y Select
export const CLASES_CAMPO =
  'w-full bg-fondo text-texto placeholder:text-texto-suave border rounded-lg px-4 py-3 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

export const claseBorde = (error) =>
  error ? 'border-error focus:border-error' : 'border-gray-800 focus:border-viper'
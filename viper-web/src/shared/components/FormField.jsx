export default function FormField({ label, id, error, ayuda, requerido = false, children }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-medium">
        {label}
        {requerido && (
          <span className="text-viper ml-1" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-error text-sm">
          {error}
        </p>
      ) : (
        ayuda && <p className="text-texto-suave text-sm">{ayuda}</p>
      )}
    </div>
  )
}
import { useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { post } from '../../../../shared/api/client'
import { useToast } from '../../../../shared/hooks/useToast'
import Alert from '../../../../shared/components/Alert'
import Button from '../../../../shared/components/Button'
import FormField from '../../../../shared/components/FormField'
import Input from '../../../../shared/components/Input'
import PasswordInput from '../../../../shared/components/PasswordInput'
import {
  normalizarDni,
  validarDni,
  validarEmail,
  validarNombre,
  validarPassword,
  validarTelefono,
} from '../../../../shared/utils/validaciones'
import AuthLayout from '../components/AuthLayout'
import RequisitosPassword from '../components/RequisitosPassword'

const VACIO = { nombre: '', apellido: '', dni: '', telefono: '', email: '', password: '', confirmarPassword: '' }

// Orden en que se revisa y se enfoca el primer campo con error
const CAMPOS = ['nombre', 'apellido', 'dni', 'telefono', 'email', 'password', 'confirmarPassword']

const validar = (v) => {
  const errores = {
    nombre: validarNombre(v.nombre, 'El nombre'),
    apellido: validarNombre(v.apellido, 'El apellido'),
    dni: validarDni(v.dni),
    telefono: validarTelefono(v.telefono),
    email: validarEmail(v.email),
    password: validarPassword(v.password),
  }
  if (!errores.password && v.password !== v.confirmarPassword) {
    errores.confirmarPassword = 'Las contraseñas no coinciden'
  }
  return Object.fromEntries(Object.entries(errores).filter(([, texto]) => texto))
}

export default function Registro() {
  const [valores, setValores] = useState(VACIO)
  const [errores, setErrores] = useState({})
  const [alerta, setAlerta] = useState(null) // { titulo, texto, conEnlace }
  const [mostrarRequisitos, setMostrarRequisitos] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const formulario = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()
  const { mostrarToast } = useToast()

  const cambiar = (campo) => (evento) => {
    setValores((anteriores) => ({ ...anteriores, [campo]: evento.target.value }))
    // Al corregir un campo se limpia su error; el resto de los datos no se toca
    if (errores[campo]) setErrores((anteriores) => ({ ...anteriores, [campo]: undefined }))
  }

  const enfocarPrimerError = (conError) => {
    const primero = CAMPOS.find((campo) => conError[campo])
    if (primero) formulario.current?.elements[primero]?.focus()
  }

  // 4a · Cancelar: vuelve a la pantalla anterior sin registrar nada
  const cancelar = () => {
    if (location.key !== 'default') navigate(-1)
    else navigate('/')
  }

  const enviar = async (evento) => {
    evento.preventDefault()
    setAlerta(null)

    // 5a y 5d: validación en el cliente, con las mismas reglas que la API
    const conError = validar(valores)
    if (Object.keys(conError).length > 0) {
      setErrores(conError)
      const soloPassword = Object.keys(conError).every((c) => c === 'password' || c === 'confirmarPassword')
      if (soloPassword) {
        setMostrarRequisitos(true)
        setAlerta({ titulo: 'La contraseña no es válida', texto: 'No cumple los requisitos mínimos o no coincide con su confirmación.' })
      } else {
        setAlerta({ titulo: 'Revisá los campos marcados', texto: 'Completá los datos obligatorios con el formato correcto.' })
      }
      enfocarPrimerError(conError)
      return
    }

    setErrores({})
    setEnviando(true)
    try {
      await post('/auth/registro', {
        nombre: valores.nombre.trim(),
        apellido: valores.apellido.trim(),
        dni: normalizarDni(valores.dni),
        email: valores.email.trim(),
        telefono: valores.telefono.trim() || undefined,
        password: valores.password,
        confirmarPassword: valores.confirmarPassword,
      })
      // Paso 8: aviso de éxito y redirección al inicio de sesión
      mostrarToast('Cuenta creada con éxito', 'exito')
      navigate('/login', { replace: true, state: { cuentaCreada: true } })
    } catch (error) {
      const campo = error.campo
      if (error.status === 409 && campo === 'email') {
        // 5b
        setErrores({ email: 'Este correo ya está registrado' })
        setAlerta({ titulo: 'Ya existe una cuenta con ese correo', texto: 'Iniciá sesión o usá otro correo electrónico.', conEnlace: true })
        enfocarPrimerError({ email: true })
      } else if (error.status === 409 && campo === 'dni') {
        // 5c
        setErrores({ dni: 'Este DNI ya está registrado' })
        setAlerta({ titulo: 'Ya existe una cuenta con ese DNI', texto: 'Cada DNI puede tener una sola cuenta en Viper.' })
        enfocarPrimerError({ dni: true })
      } else if (campo && CAMPOS.includes(campo)) {
        // La API rechazó un dato que el cliente dio por bueno: se marca el campo con su mensaje
        setErrores({ [campo]: error.mensaje })
        setAlerta({ titulo: 'Revisá los campos marcados', texto: error.mensaje })
        if (campo === 'password') setMostrarRequisitos(true)
        enfocarPrimerError({ [campo]: true })
      } else {
        setAlerta({ titulo: 'No pudimos crear tu cuenta', texto: error.mensaje })
      }
    } finally {
      setEnviando(false)
    }
  }

  return (
    <AuthLayout accion={{ texto: 'Iniciar sesión', ruta: '/login' }}>
      <div className="text-center mb-8 md:mb-10">
        <h1 className="font-outfit text-4xl lg:text-5xl font-bold mb-4 leading-tight text-balance">
          Creá tu <span className="text-viper">cuenta</span>
        </h1>
        <p className="text-texto-suave text-lg max-w-2xl mx-auto leading-relaxed">
          Registrate para reservar canchas, inscribirte a torneos y seguir tu ranking.
        </p>
      </div>

      <form
        ref={formulario}
        onSubmit={enviar}
        noValidate
        className="bg-panel border border-gray-800 rounded-2xl p-6 md:p-10 max-w-3xl mx-auto flex flex-col gap-6"
      >
        {alerta && (
          <Alert variante="error" titulo={alerta.titulo}>
            {alerta.texto}
            {alerta.conEnlace && (
              <>
                {' '}
                <Link to="/login" className="text-viper font-semibold hover:underline">
                  Ir a iniciar sesión
                </Link>
              </>
            )}
          </Alert>
        )}

        <fieldset className="flex flex-col gap-5">
          <legend className="text-xs font-semibold uppercase tracking-wide text-texto-suave mb-4">Datos personales</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
            <FormField label="Nombre" id="nombre" requerido error={errores.nombre}>
              <Input id="nombre" name="nombre" autoComplete="given-name" placeholder="Nombre" maxLength={60}
                value={valores.nombre} onChange={cambiar('nombre')} error={!!errores.nombre} />
            </FormField>
            <FormField label="Apellido" id="apellido" requerido error={errores.apellido}>
              <Input id="apellido" name="apellido" autoComplete="family-name" placeholder="Apellido" maxLength={60}
                value={valores.apellido} onChange={cambiar('apellido')} error={!!errores.apellido} />
            </FormField>
            <FormField label="DNI" id="dni" requerido error={errores.dni}>
              <Input id="dni" name="dni" inputMode="numeric" placeholder="12.345.678" maxLength={12}
                value={valores.dni} onChange={cambiar('dni')} error={!!errores.dni} />
            </FormField>
            <FormField label="Teléfono" id="telefono" error={errores.telefono} ayuda="Opcional">
              <Input id="telefono" name="telefono" type="tel" autoComplete="tel" placeholder="351 123 4567" maxLength={20}
                value={valores.telefono} onChange={cambiar('telefono')} error={!!errores.telefono} />
            </FormField>
          </div>
        </fieldset>

        <hr className="border-gray-800" />

        <fieldset className="flex flex-col gap-5">
          <legend className="text-xs font-semibold uppercase tracking-wide text-texto-suave mb-4">Acceso a tu cuenta</legend>
          <FormField label="Correo electrónico" id="email" requerido error={errores.email}>
            <Input id="email" name="email" type="email" autoComplete="email" placeholder="nombre@correo.com" maxLength={254}
              value={valores.email} onChange={cambiar('email')} error={!!errores.email} />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
            <FormField label="Contraseña" id="password" requerido error={errores.password} ayuda="Mínimo 8 caracteres, con una letra y un número">
              <PasswordInput id="password" name="password" autoComplete="new-password" placeholder="••••••••"
                value={valores.password} onChange={cambiar('password')} error={!!errores.password} />
            </FormField>
            <FormField label="Confirmar contraseña" id="confirmarPassword" requerido error={errores.confirmarPassword}>
              <PasswordInput id="confirmarPassword" name="confirmarPassword" autoComplete="new-password" placeholder="••••••••"
                value={valores.confirmarPassword} onChange={cambiar('confirmarPassword')} error={!!errores.confirmarPassword} />
            </FormField>
          </div>
          {mostrarRequisitos && <RequisitosPassword password={valores.password} />}
          <p className="flex items-center gap-2 text-texto-suave text-sm">
            <svg className="shrink-0" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 16v-4m0-4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z" />
            </svg>
            Tu cuenta se crea con el rol de Jugador
          </p>
        </fieldset>

        <div className="flex flex-col-reverse sm:flex-row gap-3">
          <Button variante="neutro" tamano="compacto" onClick={cancelar} disabled={enviando} className="sm:px-8">
            Cancelar
          </Button>
          <Button type="submit" variante="primario" cargando={enviando} className="flex-1 py-3">
            Crear cuenta
          </Button>
        </div>
      </form>

      <p className="text-center text-texto-suave mt-8">
        ¿Ya tenés una cuenta?{' '}
        <Link to="/login" className="text-viper font-semibold hover:underline">
          Iniciá sesión
        </Link>
      </p>
    </AuthLayout>
  )
}
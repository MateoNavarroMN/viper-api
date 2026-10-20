import { useState } from 'react'
import Button from '../../../../shared/components/Button'
import Input from '../../../../shared/components/Input'
import Select from '../../../../shared/components/Select'
import FormField from '../../../../shared/components/FormField'
import Modal from '../../../../shared/components/Modal'
import ConfirmDialog from '../../../../shared/components/ConfirmDialog'
import BottomSheet from '../../../../shared/components/BottomSheet'
import Table from '../../../../shared/components/Table'
import EstadoBadge from '../../../../shared/components/EstadoBadge'
import Alert from '../../../../shared/components/Alert'
import Badge from '../../../../shared/components/Badge'
import EmptyState from '../../../../shared/components/EmptyState'
import Spinner from '../../../../shared/components/Spinner'
import Tabs from '../../../../shared/components/Tabs'
import { useToast } from '../../../../shared/hooks/useToast'

const FILAS = [
  { id: 1, nombre: 'Torneo de Primavera', disciplina: 'Tenis', estado: 'INSCRIPCIONES_ABIERTAS' },
  { id: 2, nombre: 'Copa Pádel Mixto', disciplina: 'Pádel', estado: 'EN_CURSO' },
  { id: 3, nombre: 'Abierto de Verano', disciplina: 'Tenis', estado: 'CANCELADO' },
]

const COLUMNAS = [
  { clave: 'nombre', titulo: 'Torneo' },
  { clave: 'disciplina', titulo: 'Disciplina' },
  { clave: 'estado', titulo: 'Estado', render: (f) => <EstadoBadge tipo="torneo" estado={f.estado} /> },
]

// Página de prueba para ver todos los componentes juntos. Se borra cuando ya no haga falta.
export default function DemoUI() {
  const { mostrarToast } = useToast()
  const [modal, setModal] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [advertir, setAdvertir] = useState(false)
  const [hoja, setHoja] = useState(false)
  const [pestana, setPestana] = useState('activos')

  return (
    <main className="max-w-7xl mx-auto px-6 py-12 flex flex-col gap-12">
      <h1 className="font-outfit text-4xl font-bold">
        Componentes <span className="text-viper">UI</span>
      </h1>

      <section className="flex flex-col gap-4">
        <h2 className="font-outfit text-2xl font-bold">Botones</h2>
        <div className="flex flex-wrap gap-4">
          <Button variante="primario" tamano="grande">Primario</Button>
          <Button variante="secundario">Secundario</Button>
          <Button variante="neutro">Neutro</Button>
          <Button variante="advertencia">Advertencia</Button>
          <Button variante="peligro">Peligro</Button>
          <Button cargando>Guardando</Button>
          <Button disabled>Deshabilitado</Button>
        </div>
      </section>

      <section className="flex flex-col gap-4 max-w-2xl">
        <h2 className="font-outfit text-2xl font-bold">Mensajes</h2>
        <Alert variante="error" titulo="Revisá los campos marcados">Completá los datos obligatorios con el formato correcto.</Alert>
        <Alert variante="exito">Cuenta creada con éxito</Alert>
        <Alert variante="advertencia">3 inscripciones con pago pendiente quedan fuera del cuadro.</Alert>
        <Alert variante="info">Este evento ya no se puede editar: está en Inscripciones abiertas</Alert>
      </section>

      <section className="flex flex-col gap-4 max-w-md">
        <h2 className="font-outfit text-2xl font-bold">Formulario</h2>
        <FormField label="Correo" id="demo-email" ayuda="Usá el correo con el que te registraste">
          <Input id="demo-email" type="email" placeholder="nombre@correo.com" />
        </FormField>
        <FormField label="DNI" id="demo-dni" error="El DNI ya está registrado">
          <Input id="demo-dni" error defaultValue="12345678" />
        </FormField>
        <FormField label="Disciplina" id="demo-disciplina">
          <Select
            id="demo-disciplina"
            placeholder="Elegí una opción"
            opciones={[{ valor: 'TENIS', texto: 'Tenis' }, { valor: 'PADEL', texto: 'Pádel' }]}
          />
        </FormField>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-outfit text-2xl font-bold">Estados</h2>
        <div className="flex flex-wrap gap-3">
          <EstadoBadge tipo="torneo" estado="PLANIFICADO" />
          <EstadoBadge tipo="torneo" estado="INSCRIPCIONES_ABIERTAS" />
          <EstadoBadge tipo="torneo" estado="INSCRIPCIONES_CERRADAS" />
          <EstadoBadge tipo="torneo" estado="EN_CURSO" />
          <EstadoBadge tipo="torneo" estado="FINALIZADO" />
          <EstadoBadge tipo="torneo" estado="CANCELADO" />
          <EstadoBadge tipo="pago" estado="PENDIENTE" />
          <EstadoBadge tipo="partido" estado="WO" />
          <Badge variante="violeta">Organizador</Badge>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-outfit text-2xl font-bold">Pestañas y tabla</h2>
        <Tabs
          pestanas={[{ clave: 'activos', titulo: 'Activos' }, { clave: 'historicos', titulo: 'Históricos' }]}
          activa={pestana}
          onCambiar={setPestana}
        />
        <Table columnas={COLUMNAS} filas={FILAS} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-outfit text-2xl font-bold">Ventanas y avisos</h2>
        <div className="flex flex-wrap gap-4">
          <Button variante="secundario" onClick={() => setModal(true)}>Abrir modal</Button>
          <Button variante="peligro" onClick={() => setConfirmar(true)}>Cancelar torneo</Button>
          <Button variante="advertencia" onClick={() => setAdvertir(true)}>Descartar cambios</Button>
          <Button variante="secundario" onClick={() => setHoja(true)}>Abrir panel inferior</Button>
          <Button onClick={() => mostrarToast('Torneo creado correctamente', 'exito')}>Toast éxito</Button>
          <Button variante="neutro" onClick={() => mostrarToast('No se pudo guardar', 'error')}>Toast error</Button>
          <Button variante="secundario" onClick={() => mostrarToast('Quedan pocos cupos', 'advertencia')}>Toast aviso</Button>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-outfit text-2xl font-bold">Vacío y carga</h2>
        <EmptyState
          titulo="Todavía no hay torneos"
          descripcion="Cuando crees uno, lo vas a ver acá."
          accion={<Button variante="secundario">Crear torneo</Button>}
        />
        <div className="flex justify-center"><Spinner /></div>
      </section>

      <Modal abierto={modal} titulo="Título del modal" onCerrar={() => setModal(false)}>
        <p className="text-texto-suave">Contenido de la ventana.</p>
      </Modal>
      <ConfirmDialog
        abierto={advertir}
        titulo="¿Descartar cambios?"
        mensaje="Si salís ahora, vas a perder los datos cargados."
        textoConfirmar="Descartar"
        textoCancelar="Seguir editando"
        onConfirmar={() => setAdvertir(false)}
        onCancelar={() => setAdvertir(false)}
      />
      <ConfirmDialog
        abierto={confirmar}
        tipo="peligro"
        titulo="¿Cancelar torneo?"
        mensaje="Se van a anular todas las inscripciones y cancelar las reservas de cancha del torneo."
        textoConfirmar="Cancelar torneo"
        textoCancelar="Volver"
        onConfirmar={() => setConfirmar(false)}
        onCancelar={() => setConfirmar(false)}
      />
      <BottomSheet abierto={hoja} titulo="Elegí una opción" onCerrar={() => setHoja(false)}>
        <p className="text-texto-suave">En el celular sube desde abajo.</p>
      </BottomSheet>
    </main>
  )
}
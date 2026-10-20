import Modal from './Modal'

// Panel que sube desde abajo en el celular (selectores, acciones). En pantallas grandes se ve como un Modal centrado.
export default function BottomSheet(props) {
  return <Modal posicion="abajo-movil" {...props} />
}
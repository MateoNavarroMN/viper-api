import ModuleInfoPage from '../components/ModuleInfoPage'

const pasos = [
  { titulo: 'Vende desde un punto', desc: 'Gestiona el Pro-Shop y el buffet del club desde un mismo punto de venta.' },
  { titulo: 'Cobra con Mercado Pago', desc: 'El cobro se concilia directamente con Mercado Pago, sin cargas manuales.' },
  { titulo: 'Cierra la caja', desc: 'La conciliación de caja queda lista al cierre, con cada venta respaldada por su comprobante.' },
]

export default function TiendaInfo() {
  return (
    <ModuleInfoPage
      titulo="Tienda y"
      resaltado="Caja (POS)."
      descripcion="Punto de venta para Pro-Shop y buffet, con conciliación de caja directa vía Mercado Pago."
      pasos={pasos}
    />
  )
}

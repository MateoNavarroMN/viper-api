import { useContext } from 'react'
import { ToastContext } from './ToastContext'

// const { mostrarToast } = useToast()
// mostrarToast('Torneo creado', 'exito')   // tipo: 'exito' | 'error' | 'advertencia'
export function useToast() {
  const contexto = useContext(ToastContext)
  if (!contexto) throw new Error('useToast se usa dentro de <ToastProvider>')
  return contexto
}
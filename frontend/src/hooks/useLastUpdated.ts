import { useState, useEffect, useCallback } from 'react'

// ---------------------------------------------------------------------------
// useLastUpdated
//
// Centraliza la logica de "ultima actualizacion" para todas las paginas
// que tienen boton de refrescar.
//
// Devuelve:
//   lastUpdated  - Date | null del ultimo fetch exitoso
//   labelTiempo  - string reactivo (se actualiza cada 30s sin tocar el backend)
//   marcarActualizado - llamar despues de cada fetch exitoso
// ---------------------------------------------------------------------------

function calcLabel(fecha: Date | null): string {
  if (!fecha) return ''
  const diff = Math.floor((Date.now() - fecha.getTime()) / 1000)
  if (diff < 60) return 'Actualizado hace un momento'
  if (diff < 3600) return `Actualizado hace ${Math.floor(diff / 60)} min`
  return `Actualizado el ${fecha.toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })}`
}

export function useLastUpdated() {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [labelTiempo, setLabelTiempo] = useState('')

  // Recalcular el label cada 30 segundos para que sea reactivo
  useEffect(() => {
    if (!lastUpdated) return
    setLabelTiempo(calcLabel(lastUpdated))
    const interval = setInterval(() => {
      setLabelTiempo(calcLabel(lastUpdated))
    }, 30_000)
    return () => clearInterval(interval)
  }, [lastUpdated])

  const marcarActualizado = useCallback(() => {
    const ahora = new Date()
    setLastUpdated(ahora)
    setLabelTiempo(calcLabel(ahora))
  }, [])

  return { lastUpdated, labelTiempo, marcarActualizado }
}

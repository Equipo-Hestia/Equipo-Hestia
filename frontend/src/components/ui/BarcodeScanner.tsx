import { useEffect, useRef, useState } from 'react'
import { X, Camera, AlertCircle } from 'lucide-react'

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  onClose: () => void
}

/**
 * Abre la cámara del dispositivo y decodifica códigos de barras (1D y QR)
 * usando @zxing/browser (importación dinámica para code-splitting).
 *
 * Requiere HTTPS o localhost para acceder a getUserMedia.
 * El header Permissions-Policy debe incluir camera=(self).
 */
export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const scannedRef = useRef(false)

  useEffect(() => {
    let active = true

    async function start() {
      if (!videoRef.current) return
      try {
        // Importación dinámica: el chunk de @zxing/browser solo se descarga
        // cuando el usuario abre el escáner, no al cargar la página.
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        if (!active) return

        const reader = new BrowserMultiFormatReader()
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: 'environment' } },
          videoRef.current,
          (result, _err, ctrl) => {
            if (!active || scannedRef.current) return
            if (result) {
              scannedRef.current = true
              ctrl.stop()
              onScan(result.getText())
            }
          }
        )
        controlsRef.current = controls
        if (active) setLoading(false)
      } catch {
        if (active) {
          setError(
            'No se pudo acceder a la cámara. ' +
            'Verifica que el sitio tenga permisos de cámara en tu navegador.'
          )
          setLoading(false)
        }
      }
    }

    start()
    return () => {
      active = false
      controlsRef.current?.stop()
    }
  }, [onScan])

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl overflow-hidden w-full max-w-sm shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Camera size={16} className="text-teal-600" />
            <span className="font-bold text-slate-900 text-sm">Escanear código</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Visor de cámara */}
        <div className="relative bg-black" style={{ aspectRatio: '4/3' }}>
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />

          {/* Marco de objetivo con esquinas resaltadas */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-56 h-28">
              <div className="absolute top-0 left-0 w-5 h-5 border-t-[3px] border-l-[3px] border-teal-400 rounded-tl-sm" />
              <div className="absolute top-0 right-0 w-5 h-5 border-t-[3px] border-r-[3px] border-teal-400 rounded-tr-sm" />
              <div className="absolute bottom-0 left-0 w-5 h-5 border-b-[3px] border-l-[3px] border-teal-400 rounded-bl-sm" />
              <div className="absolute bottom-0 right-0 w-5 h-5 border-b-[3px] border-r-[3px] border-teal-400 rounded-br-sm" />
              {/* Línea de escaneo animada */}
              <div className="absolute inset-x-0 top-1/2 h-px bg-teal-400/70 animate-pulse" />
            </div>
          </div>

          {/* Overlay de carga */}
          {loading && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 gap-3">
              <Camera size={28} className="text-white animate-pulse" />
              <p className="text-white text-xs font-semibold">Iniciando cámara...</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {error ? (
          <div className="p-4">
            <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl p-3">
              <AlertCircle size={14} className="text-rose-500 mt-0.5 flex-shrink-0" />
              <p className="text-rose-700 text-xs font-medium leading-relaxed">{error}</p>
            </div>
          </div>
        ) : (
          <p className="px-4 py-3 text-xs text-slate-400 text-center">
            Apunta la cámara al código de barras del insumo
          </p>
        )}
      </div>
    </div>
  )
}

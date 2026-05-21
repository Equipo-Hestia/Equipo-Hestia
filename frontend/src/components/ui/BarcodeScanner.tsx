import { useEffect, useRef, useState } from 'react'
import { X, Camera, AlertCircle, CheckCircle, ScanLine } from 'lucide-react'

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  onClose: () => void
}

type Estado = 'cargando' | 'activo' | 'detectado' | 'error'

/**
 * Abre la cámara y decodifica códigos de barras (1D/2D) con @zxing/browser.
 *
 * Estrategia de cámara:
 * 1. Intenta cámara trasera con facingMode: { ideal: 'environment' }
 *    (no estricto — en notebooks con una sola webcam usa la que haya).
 * 2. Si falla, reintenta con { video: true } (cualquier cámara disponible).
 *
 * IMPORTANTE z-index: usa z-[9999] para garantizar que aparezca sobre
 * cualquier Modal (z-50) u otro overlay del sistema.
 *
 * El video es siempre visible. El overlay de carga no bloquea el stream.
 * Al detectar un código muestra un flash verde con el valor antes de cerrar.
 *
 * Requiere HTTPS o localhost para getUserMedia.
 */
export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const scannedRef  = useRef(false)

  const [estado, setEstado]          = useState<Estado>('cargando')
  const [errorMsg, setErrorMsg]      = useState<string | null>(null)
  const [codigoDetectado, setCodigo] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function start() {
      if (!videoRef.current) return

      let ZxingModule: typeof import('@zxing/browser')
      try {
        ZxingModule = await import('@zxing/browser')
      } catch {
        if (active) {
          setErrorMsg('No se pudo cargar la librería de escaneo. Recarga la página.')
          setEstado('error')
        }
        return
      }
      if (!active) return

      const { BrowserMultiFormatReader } = ZxingModule

      // Opciones en orden de preferencia:
      // 1. Cámara trasera “ideal” (no estricto; en notebook usa la webcam disponible)
      // 2. Cualquier cámara disponible como fallback
      const opcionesConstraints: MediaStreamConstraints[] = [
        { video: { facingMode: { ideal: 'environment' } } },
        { video: true },
      ]

      for (const constraints of opcionesConstraints) {
        try {
          const reader = new BrowserMultiFormatReader()
          const controls = await reader.decodeFromConstraints(
            constraints,
            videoRef.current!,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (result: any, _err: any, ctrl: any) => {
              if (!active || scannedRef.current || !result) return
              scannedRef.current = true
              const code = result.getText() as string
              setCodigo(code)
              setEstado('detectado')
              setTimeout(() => {
                ctrl.stop()
                onScan(code)
              }, 800)
            }
          )
          controlsRef.current = controls
          if (active) setEstado('activo')
          return  // éxito — no probar siguiente opción
        } catch (e: unknown) {
          if (constraints === opcionesConstraints[opcionesConstraints.length - 1]) {
            if (!active) return
            const msg = e instanceof Error ? e.message.toLowerCase() : ''
            if (msg.includes('permission') || msg.includes('denied') || msg.includes('notallowed')) {
              setErrorMsg(
                'Permiso denegado. Haz clic en el ícono de cámara en la barra del
                navegador, permite el acceso y vuelve a intentarlo.'
              )
            } else if (msg.includes('notfound') || msg.includes('devicenotfound')) {
              setErrorMsg('No se encontró ningún dispositivo de cámara en este equipo.')
            } else {
              setErrorMsg(
                'No se pudo iniciar la cámara. Verifica que no esté en uso por otra '
                + 'aplicación y que el sitio tenga permisos de cámara.'
              )
            }
            setEstado('error')
          }
        }
      }
    }

    start()
    return () => {
      active = false
      controlsRef.current?.stop()
    }
  }, [onScan])

  const marcoColor = estado === 'detectado' ? 'border-emerald-400' : 'border-teal-400'

  return (
    /*
     * z-[9999]: debe superar al Modal (z-50) y a cualquier otro overlay.
     * Sin esto, el scanner queda tapado por el formulario aunque la
     * cámara sí se active.
     */
    <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl overflow-hidden w-full max-w-sm shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Camera size={16} className="text-teal-600" />
            <span className="font-bold text-slate-900 text-sm">Escanear código de barras</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Visor de cámara */}
        <div className="relative bg-black" style={{ aspectRatio: '4/3' }}>

          {/*
           * El video está SIEMPRE montado en el DOM para que @zxing pueda
           * adjuntarle el stream. autoPlay evita que quede en pausa en
           * algunos navegadores de escritorio.
           */}
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />

          {/* Marco de encuadre — visible en activo y detectado */}
          {(estado === 'activo' || estado === 'detectado') && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className={`relative transition-all duration-300 ${
                estado === 'detectado' ? 'w-72 h-36 scale-105' : 'w-64 h-32'
              }`}>
                <div className={`absolute top-0 left-0 w-6 h-6 border-t-[3px] border-l-[3px] rounded-tl-sm ${marcoColor}`} />
                <div className={`absolute top-0 right-0 w-6 h-6 border-t-[3px] border-r-[3px] rounded-tr-sm ${marcoColor}`} />
                <div className={`absolute bottom-0 left-0 w-6 h-6 border-b-[3px] border-l-[3px] rounded-bl-sm ${marcoColor}`} />
                <div className={`absolute bottom-0 right-0 w-6 h-6 border-b-[3px] border-r-[3px] rounded-br-sm ${marcoColor}`} />

                {/* Línea de escaneo animada (solo en activo) */}
                {estado === 'activo' && (
                  <div className="absolute inset-x-2 top-1/2 -translate-y-1/2
                                  h-0.5 bg-teal-400/90 animate-pulse" />
                )}
              </div>
            </div>
          )}

          {/* Spinner de carga — semitransparente para no tapar el video */}
          {estado === 'cargando' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center
                            bg-black/50 gap-3 pointer-events-none">
              <div className="w-8 h-8 border-[3px] border-white border-t-transparent
                              rounded-full animate-spin" />
              <p className="text-white text-xs font-semibold tracking-wide">
                Iniciando cámara...
              </p>
            </div>
          )}

          {/* Flash de detección exitosa */}
          {estado === 'detectado' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center
                            bg-emerald-900/60 gap-3 pointer-events-none">
              <CheckCircle size={44} className="text-emerald-400" />
              <p className="text-white text-sm font-bold">¡Código detectado!</p>
              {codigoDetectado && (
                <p className="text-emerald-200 text-xs font-mono bg-black/40
                              px-3 py-1 rounded-full">
                  {codigoDetectado}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {estado === 'error' ? (
          <div className="p-4">
            <div className="flex items-start gap-2 bg-rose-50 border border-rose-200
                            rounded-xl p-3">
              <AlertCircle size={14} className="text-rose-500 mt-0.5 flex-shrink-0" />
              <p className="text-rose-700 text-xs font-medium leading-relaxed">{errorMsg}</p>
            </div>
          </div>
        ) : (
          <div className="px-4 py-3 flex items-center justify-center gap-2">
            <ScanLine size={13} className={`flex-shrink-0 ${
              estado === 'activo' ? 'text-teal-500 animate-pulse' : 'text-slate-300'
            }`} />
            <p className="text-xs text-slate-400 text-center">
              {estado === 'cargando'  && 'Esperando acceso a la cámara...'}
              {estado === 'activo'    && 'Centra el código de barras dentro del recuadro'}
              {estado === 'detectado' && 'Procesando...'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

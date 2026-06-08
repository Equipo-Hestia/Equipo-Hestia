import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Upload, FileSpreadsheet, Download, CheckCircle,
  XCircle, AlertTriangle, ArrowLeft, Shield, RefreshCw
} from 'lucide-react'
import { api } from '../api/client'
import { TotpInput } from '../components/ui/TotpInput'

interface ErrorFila {
  fila: number
  razon: string
}

interface ImportarResponse {
  importados: number
  omitidos: number
  errores: ErrorFila[]
}

type Estado = 'idle' | 'archivo' | 'totp' | 'cargando' | 'resultado'

const COLUMNAS  = ['nombre', 'descripcion', 'stock_actual', 'stock_minimo', 'sala', 'categoria']
const REQUERIDAS = ['nombre', 'stock_actual', 'stock_minimo']

export function ImportarInsumos() {
  const [estado, setEstado]       = useState<Estado>('idle')
  const [archivo, setArchivo]     = useState<File | null>(null)
  const [preview, setPreview]     = useState<string[][]>([])
  const [codigoTotp, setCodigoTotp] = useState('')
  const [resultado, setResultado] = useState<ImportarResponse | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [dragOver, setDragOver]   = useState(false)
  const inputRef                  = useRef<HTMLInputElement>(null)

  // Ref para disparar la animacion TotpInput desde el boton externo
  const totpAnimRef = useRef<(() => void) | null>(null)

  // Cuando cambia a paso totp, resetear el codigo
  useEffect(() => {
    if (estado === 'totp') {
      setCodigoTotp('')
      setError(null)
    }
  }, [estado])

  function leerPreview(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const texto = e.target?.result as string
      const lineas = texto.split('\n').slice(0, 6).map(l => l.split(','))
      setPreview(lineas)
    }
    reader.readAsText(file)
  }

  function seleccionarArchivo(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['csv', 'xlsx', 'xls'].includes(ext ?? '')) {
      setError('Solo se aceptan archivos .csv o .xlsx')
      return
    }
    setError(null)
    setArchivo(file)
    if (ext === 'csv') leerPreview(file)
    setEstado('archivo')
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) seleccionarArchivo(file)
  }

  // Se llama desde DENTRO de la animacion TotpInput
  async function handleSubir() {
    if (!archivo || codigoTotp.length !== 6) return
    setEstado('cargando')
    setError(null)
    try {
      const form = new FormData()
      form.append('archivo', archivo)
      form.append('codigo_totp', codigoTotp)
      const { data } = await api.post<ImportarResponse>('/importar/insumos', form)
      setResultado(data)
      setEstado('resultado')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        .response?.data?.detail
      setError(msg ?? 'Error al importar el archivo.')
      setEstado('totp')
    }
  }

  function reiniciar() {
    setEstado('idle'); setArchivo(null); setPreview([])
    setCodigoTotp(''); setResultado(null); setError(null)
  }

  async function descargarPlantilla() {
    const res = await api.get('/importar/plantilla', { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url; a.download = 'plantilla_insumos_hestia.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <Link to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-h-secondary
                     hover:text-h-primary font-semibold mb-4 transition-colors"
        >
          <ArrowLeft size={14} /> Dashboard
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-h-primary">Importar insumos</h1>
            <p className="text-h-secondary text-sm mt-0.5">
              Carga masiva desde CSV o XLSX. Requiere codigo 2FA.
            </p>
          </div>
          <button
            onClick={descargarPlantilla}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-h-subtle
                       text-h-secondary hover:bg-h-elevated text-sm font-semibold transition-colors"
          >
            <Download size={14} /> Descargar plantilla
          </button>
        </div>
      </div>

      {(estado === 'idle' || estado === 'archivo') && (
        <div className="space-y-5">
          <div className="rounded-xl border border-h-subtle p-4"
            style={{ background: 'var(--h-bg-elevated)' }}>
            <p className="text-[10px] font-bold text-h-tertiary uppercase tracking-widest mb-3">
              Columnas esperadas
            </p>
            <div className="flex flex-wrap gap-2">
              {COLUMNAS.map(col => (
                <span key={col}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold"
                  style={REQUERIDAS.includes(col) ? {
                    background: 'var(--h-teal-subtle)',
                    color: 'var(--h-teal-hover)',
                    border: '1px solid var(--h-teal-border)',
                  } : {
                    background: 'var(--h-bg-highlight)',
                    color: 'var(--h-text-secondary)',
                  }}>
                  {col}{REQUERIDAS.includes(col) ? ' *' : ''}
                </span>
              ))}
            </div>
            <p className="text-xs text-h-tertiary mt-2">* Columnas requeridas</p>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className="relative border-2 border-dashed rounded-2xl p-12
                       text-center cursor-pointer transition-all duration-200"
            style={{
              borderColor: dragOver
                ? 'var(--h-teal-hover)'
                : archivo ? 'var(--h-teal-border)' : 'var(--h-border-visible)',
              background: dragOver || archivo
                ? 'var(--h-teal-subtle)' : 'var(--h-bg-elevated)',
            }}
          >
            <input
              ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) seleccionarArchivo(f) }}
            />
            {archivo ? (
              <>
                <FileSpreadsheet size={40} className="mx-auto mb-3"
                  style={{ color: 'var(--h-teal-hover)' }} />
                <p className="font-bold text-h-primary">{archivo.name}</p>
                <p className="text-h-secondary text-sm mt-1">
                  {(archivo.size / 1024).toFixed(1)} KB
                </p>
                <p className="text-xs text-h-tertiary mt-2">Haz clic para cambiar el archivo</p>
              </>
            ) : (
              <>
                <Upload size={40} className="mx-auto mb-3 text-h-tertiary" />
                <p className="font-semibold text-h-primary">Arrastra tu archivo aqui</p>
                <p className="text-h-secondary text-sm mt-1">o haz clic para buscarlo</p>
                <p className="text-xs text-h-tertiary mt-3">CSV o XLSX</p>
              </>
            )}
          </div>

          {preview.length > 0 && (
            <div className="rounded-xl border border-h-subtle overflow-hidden"
              style={{ background: 'var(--h-bg-surface)' }}>
              <div className="px-4 py-2.5 border-b border-h-subtle"
                style={{ background: 'var(--h-bg-elevated)' }}>
                <p className="text-[10px] font-bold text-h-tertiary uppercase tracking-wide">
                  Vista previa (primeras {preview.length - 1} filas)
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-h-subtle">
                      {(preview[0] ?? []).map((h, i) => (
                        <th key={i} className="px-3 py-2 text-left font-bold text-h-secondary">
                          {h.trim()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(1).map((fila, i) => (
                      <tr key={i} className="border-b border-h-subtle">
                        {fila.map((celda, j) => (
                          <td key={j} className="px-3 py-2 text-h-secondary">{celda.trim()}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs px-4 py-3 rounded-xl font-semibold"
              style={{
                background: 'var(--h-sem-danger-bg)',
                color: 'var(--h-sem-danger-text)',
                border: '1px solid var(--h-sem-danger-border)',
              }}>
              {error}
            </p>
          )}

          {archivo && (
            <button
              onClick={() => setEstado('totp')}
              className="w-full flex items-center justify-center gap-2 text-white
                         font-bold py-3 rounded-xl transition-colors"
              style={{ background: 'var(--h-teal-rest)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-teal-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--h-teal-rest)')}
            >
              <Shield size={16} /> Continuar con verificacion 2FA
            </button>
          )}
        </div>
      )}

      {estado === 'totp' && (
        <div className="rounded-2xl border border-h-subtle p-8"
          style={{ background: 'var(--h-bg-surface)' }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--h-teal-subtle)' }}>
              <Shield size={20} style={{ color: 'var(--h-teal-hover)' }} />
            </div>
            <div>
              <p className="font-bold text-h-primary">Verificacion de seguridad</p>
              <p className="text-h-secondary text-sm">
                Autoriza la importacion de <strong>{archivo?.name}</strong>.
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <TotpInput
              value={codigoTotp}
              onChange={v => { setCodigoTotp(v); setError(null) }}
              onConfirm={handleSubir}
              animRef={totpAnimRef}
            />

            {error && (
              <p className="text-xs px-4 py-3 rounded-xl font-semibold"
                style={{
                  background: 'var(--h-sem-danger-bg)',
                  color: 'var(--h-sem-danger-text)',
                  border: '1px solid var(--h-sem-danger-border)',
                }}>
                {error}
              </p>
            )}

            <button
              onClick={() => totpAnimRef.current?.()}
              disabled={codigoTotp.length !== 6}
              className="w-full flex items-center justify-center gap-2 text-white
                         font-bold py-3 rounded-xl transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'var(--h-teal-rest)' }}
              onMouseEnter={e => {
                if (codigoTotp.length === 6)
                  (e.currentTarget.style.background = 'var(--h-teal-hover)')
              }}
              onMouseLeave={e =>
                (e.currentTarget.style.background = 'var(--h-teal-rest)')
              }
            >
              <Upload size={16} /> Importar insumos
            </button>

            <button type="button" onClick={() => setEstado('archivo')}
              className="w-full py-2 text-sm text-h-tertiary hover:text-h-secondary
                         font-semibold transition-colors">
              Volver al archivo
            </button>
          </div>
        </div>
      )}

      {estado === 'cargando' && (
        <div className="rounded-2xl border border-h-subtle p-16 text-center"
          style={{ background: 'var(--h-bg-surface)' }}>
          <RefreshCw size={40} className="mx-auto mb-4 animate-spin"
            style={{ color: 'var(--h-teal-hover)' }} />
          <p className="font-bold text-h-primary">Importando insumos...</p>
          <p className="text-h-secondary text-sm mt-1">Esto puede tomar unos segundos.</p>
        </div>
      )}

      {estado === 'resultado' && resultado && (
        <div className="space-y-4">
          <div className="rounded-2xl border p-6"
            style={{
              background: resultado.omitidos === 0
                ? 'var(--h-sem-success-bg)'
                : resultado.importados === 0
                  ? 'var(--h-sem-danger-bg)'
                  : 'var(--h-sem-warning-bg)',
              borderColor: resultado.omitidos === 0
                ? 'var(--h-sem-success-border)'
                : resultado.importados === 0
                  ? 'var(--h-sem-danger-border)'
                  : 'var(--h-sem-warning-border)',
            }}>
            <div className="flex items-center gap-3 mb-4">
              {resultado.importados > 0
                ? <CheckCircle size={24} style={{ color: 'var(--h-sem-success-text)' }} />
                : <XCircle    size={24} style={{ color: 'var(--h-sem-danger-text)'  }} />
              }
              <p className="font-black text-h-primary text-lg">
                {resultado.importados > 0 ? 'Importacion completada' : 'Sin filas importadas'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl p-4 text-center border"
                style={{
                  background: 'var(--h-bg-surface)',
                  borderColor: 'var(--h-sem-success-border)',
                }}>
                <p className="text-3xl font-black"
                  style={{ color: 'var(--h-sem-success-text)' }}>
                  {resultado.importados}
                </p>
                <p className="text-xs font-semibold text-h-tertiary mt-1">
                  Insumos importados
                </p>
              </div>
              <div className="rounded-xl p-4 text-center border"
                style={{
                  background: 'var(--h-bg-surface)',
                  borderColor: 'var(--h-sem-danger-border)',
                }}>
                <p className="text-3xl font-black"
                  style={{ color: 'var(--h-sem-danger-text)' }}>
                  {resultado.omitidos}
                </p>
                <p className="text-xs font-semibold text-h-tertiary mt-1">
                  Filas omitidas
                </p>
              </div>
            </div>
          </div>

          {resultado.errores.length > 0 && (
            <div className="rounded-xl border border-h-subtle overflow-hidden"
              style={{ background: 'var(--h-bg-surface)' }}>
              <div className="px-4 py-3 border-b border-h-subtle flex items-center gap-2"
                style={{ background: 'var(--h-bg-elevated)' }}>
                <AlertTriangle size={14}
                  style={{ color: 'var(--h-sem-warning-text)' }} />
                <p className="text-[10px] font-bold text-h-tertiary uppercase tracking-wide">
                  Filas con errores ({resultado.errores.length})
                </p>
              </div>
              <div className="divide-y max-h-64 overflow-y-auto"
                style={{ borderColor: 'var(--h-border-subtle)' }}>
                {resultado.errores.map((e, i) => (
                  <div key={i} className="px-4 py-3 flex items-start gap-3">
                    <span className="text-xs font-black text-h-tertiary mt-0.5 w-12
                                    flex-shrink-0">
                      Fila {e.fila}
                    </span>
                    <p className="text-sm font-semibold"
                      style={{ color: 'var(--h-sem-danger-text)' }}>
                      {e.razon}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={reiniciar}
            className="w-full flex items-center justify-center gap-2 border
                       font-bold py-3 rounded-xl transition-colors text-h-secondary"
            style={{
              borderColor: 'var(--h-border-subtle)',
              background: 'var(--h-bg-elevated)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-bg-highlight)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--h-bg-elevated)')}
          >
            <Upload size={15} /> Importar otro archivo
          </button>
        </div>
      )}
    </div>
  )
}

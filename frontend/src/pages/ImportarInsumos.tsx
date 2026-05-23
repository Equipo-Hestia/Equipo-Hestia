import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Upload, FileSpreadsheet, Download, CheckCircle,
  XCircle, AlertTriangle, ArrowLeft, Shield, RefreshCw
} from 'lucide-react'
import { api } from '../api/client'

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

const COLUMNAS = ['nombre', 'descripcion', 'stock_actual', 'stock_minimo', 'sala', 'categoria']
const REQUERIDAS = ['nombre', 'stock_actual', 'stock_minimo']

export function ImportarInsumos() {
  const [estado, setEstado] = useState<Estado>('idle')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [preview, setPreview] = useState<string[][]>([])
  const [codigoTotp, setCodigoTotp] = useState('')
  const [resultado, setResultado] = useState<ImportarResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [segundos, setSegundos] = useState(30)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (estado !== 'totp') return
    const ahora = Math.floor(Date.now() / 1000)
    setSegundos(30 - (ahora % 30))
    const interval = setInterval(() => {
      setSegundos(30 - (Math.floor(Date.now() / 1000) % 30))
    }, 1000)
    return () => clearInterval(interval)
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

  async function handleSubir(e: React.FormEvent) {
    e.preventDefault()
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

  const pctSegundos = (segundos / 30) * 100
  const colorCountdown =
    segundos <= 5 ? 'text-rose-500' :
    segundos <= 10 ? 'text-amber-500' :
    'text-teal-600'
  const strokeColor =
    segundos <= 5 ? '#f43f5e' :
    segundos <= 10 ? '#f59e0b' :
    '#0d9488'

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <Link to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 font-semibold mb-4"
        >
          <ArrowLeft size={14} /> Dashboard
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Importar insumos</h1>
            <p className="text-slate-500 text-sm mt-0.5">Carga masiva desde CSV o XLSX. Requiere código 2FA.</p>
          </div>
          <button
            onClick={descargarPlantilla}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200
                       text-slate-600 hover:bg-slate-100 text-sm font-semibold transition-colors"
          >
            <Download size={14} /> Descargar plantilla
          </button>
        </div>
      </div>

      {(estado === 'idle' || estado === 'archivo') && (
        <div className="space-y-5">
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Columnas esperadas</p>
            <div className="flex flex-wrap gap-2">
              {COLUMNAS.map(col => (
                <span key={col} className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                  REQUERIDAS.includes(col)
                    ? 'bg-teal-100 text-teal-700 border border-teal-200'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {col}{REQUERIDAS.includes(col) ? ' *' : ''}
                </span>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-2">* Columnas requeridas</p>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer
              transition-all duration-200
              ${ dragOver ? 'border-teal-500 bg-teal-50'
                : archivo ? 'border-teal-400 bg-teal-50/50'
                : 'border-slate-300 hover:border-teal-400 hover:bg-slate-50' }
            `}
          >
            <input
              ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) seleccionarArchivo(f) }}
            />
            {archivo ? (
              <>
                <FileSpreadsheet size={40} className="mx-auto mb-3 text-teal-600" />
                <p className="font-bold text-teal-700">{archivo.name}</p>
                <p className="text-slate-500 text-sm mt-1">{(archivo.size / 1024).toFixed(1)} KB</p>
                <p className="text-xs text-slate-400 mt-2">Haz clic para cambiar el archivo</p>
              </>
            ) : (
              <>
                <Upload size={40} className="mx-auto mb-3 text-slate-400" />
                <p className="font-semibold text-slate-700">Arrastra tu archivo aquí</p>
                <p className="text-slate-400 text-sm mt-1">o haz clic para buscarlo</p>
                <p className="text-xs text-slate-300 mt-3">CSV o XLSX</p>
              </>
            )}
          </div>

          {preview.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  Vista previa (primeras {preview.length - 1} filas)
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {(preview[0] ?? []).map((h, i) => (
                        <th key={i} className="px-3 py-2 text-left font-bold text-slate-600">{h.trim()}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(1).map((fila, i) => (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                        {fila.map((celda, j) => (
                          <td key={j} className="px-3 py-2 text-slate-600">{celda.trim()}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && (
            <p className="text-rose-600 text-sm bg-rose-50 border border-rose-200 px-4 py-3 rounded-xl font-semibold">
              {error}
            </p>
          )}

          {archivo && (
            <button
              onClick={() => { setEstado('totp'); setCodigoTotp(''); setError(null) }}
              className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700
                         text-white font-bold py-3 rounded-xl transition-colors"
            >
              <Shield size={16} /> Continuar con verificación 2FA
            </button>
          )}
        </div>
      )}

      {estado === 'totp' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center">
              <Shield size={20} className="text-teal-600" />
            </div>
            <div>
              <p className="font-bold text-slate-900">Verificación de seguridad</p>
              <p className="text-slate-500 text-sm">
                Autoriza la importación de <strong>{archivo?.name}</strong>.
              </p>
            </div>
          </div>
          <form onSubmit={handleSubir} className="space-y-5">
            <div className="relative">
              <input
                type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                value={codigoTotp}
                onChange={(e) => { setCodigoTotp(e.target.value.replace(/\D/g, '')); setError(null) }}
                placeholder="000000" autoFocus
                className="w-full px-4 py-5 rounded-xl border-2 border-slate-200
                           text-slate-900 text-4xl text-center font-black tracking-[0.7em]
                           focus:outline-none focus:border-teal-500 bg-slate-50 focus:bg-white
                           placeholder:text-slate-200 transition-colors"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center">
                <svg width="36" height="36" className="-rotate-90">
                  <circle cx="18" cy="18" r="14" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="14" fill="none"
                    stroke={strokeColor} strokeWidth="3"
                    strokeDasharray={`${2 * Math.PI * 14}`}
                    strokeDashoffset={`${2 * Math.PI * 14 * (1 - pctSegundos / 100)}`}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
                  />
                </svg>
                <span className={`text-xs font-black -mt-7 ${colorCountdown}`}>{segundos}</span>
              </div>
            </div>
            {error && (
              <p className="text-rose-600 text-sm bg-rose-50 border border-rose-200 px-4 py-3 rounded-xl font-semibold">
                {error}
              </p>
            )}
            <button
              type="submit" disabled={codigoTotp.length !== 6}
              className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700
                         text-white font-bold py-3 rounded-xl transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload size={16} /> Importar insumos
            </button>
            <button type="button" onClick={() => setEstado('archivo')}
              className="w-full py-2 text-sm text-slate-400 hover:text-slate-600 font-semibold"
            >
              ← Volver al archivo
            </button>
          </form>
        </div>
      )}

      {estado === 'cargando' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 text-center">
          <RefreshCw size={40} className="mx-auto mb-4 text-teal-600 animate-spin" />
          <p className="font-bold text-slate-900">Importando insumos...</p>
          <p className="text-slate-500 text-sm mt-1">Esto puede tomar unos segundos.</p>
        </div>
      )}

      {estado === 'resultado' && resultado && (
        <div className="space-y-4">
          <div className={`rounded-2xl border p-6 ${
            resultado.omitidos === 0 ? 'bg-teal-50 border-teal-200'
            : resultado.importados === 0 ? 'bg-rose-50 border-rose-200'
            : 'bg-amber-50 border-amber-200'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              {resultado.importados > 0
                ? <CheckCircle size={24} className="text-teal-600" />
                : <XCircle size={24} className="text-rose-600" />
              }
              <p className="font-black text-slate-900 text-lg">
                {resultado.importados > 0 ? 'Importación completada' : 'Sin filas importadas'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl p-4 text-center border border-teal-200">
                <p className="text-3xl font-black text-teal-600">{resultado.importados}</p>
                <p className="text-xs font-semibold text-slate-500 mt-1">Insumos importados</p>
              </div>
              <div className="bg-white rounded-xl p-4 text-center border border-rose-200">
                <p className="text-3xl font-black text-rose-500">{resultado.omitidos}</p>
                <p className="text-xs font-semibold text-slate-500 mt-1">Filas omitidas</p>
              </div>
            </div>
          </div>

          {resultado.errores.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-500" />
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                  Filas con errores ({resultado.errores.length})
                </p>
              </div>
              <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {resultado.errores.map((e, i) => (
                  <div key={i} className="px-4 py-3 flex items-start gap-3">
                    <span className="text-xs font-black text-slate-400 mt-0.5 w-12 flex-shrink-0">
                      Fila {e.fila}
                    </span>
                    <p className="text-sm text-rose-600 font-semibold">{e.razon}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={reiniciar}
            className="w-full flex items-center justify-center gap-2 border border-slate-200
                       hover:bg-slate-50 text-slate-700 font-bold py-3 rounded-xl transition-colors"
          >
            <Upload size={15} /> Importar otro archivo
          </button>
        </div>
      )}
    </div>
  )
}

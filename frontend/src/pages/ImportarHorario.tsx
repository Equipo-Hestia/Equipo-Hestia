import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Calendar, Upload, FileText, Download, CheckCircle,
  XCircle, AlertTriangle, ArrowLeft, Shield, RefreshCw,
  ArrowRight, Info
} from 'lucide-react'
import { api } from '../api/client'
import type { HorarioFila, HorarioImportResponse } from '../types/api'

// ---------------------------------------------------------------------------
// Campos canonicos de Hestia para el mapeo de columnas
// ---------------------------------------------------------------------------
const CAMPOS_HESTIA = [
  { value: '', label: '\u2014 Ignorar \u2014' },
  { value: 'email_docente', label: 'Email del docente *' },
  { value: 'codigo_asignatura', label: 'C\u00f3digo asignatura *' },
  { value: 'seccion', label: 'Secci\u00f3n *' },
  { value: 'semestre', label: 'Semestre *' },
  { value: 'sala', label: 'Sala' },
  { value: 'dia_semana', label: 'D\u00eda de la semana' },
  { value: 'hora_inicio', label: 'Hora inicio' },
  { value: 'hora_fin', label: 'Hora fin' },
]
const CAMPOS_REQUERIDOS = ['email_docente', 'codigo_asignatura', 'seccion', 'semestre']

// Alias para auto-detección (normalizado, sin tildes)
const ALIAS_COLS: Record<string, string> = {
  'email': 'email_docente', 'correo': 'email_docente', 'mail': 'email_docente',
  'email docente': 'email_docente', 'email_docente': 'email_docente',
  'correo institucional': 'email_docente', 'correo electronico': 'email_docente',
  'codigo': 'codigo_asignatura', 'cod': 'codigo_asignatura',
  'cod asignatura': 'codigo_asignatura', 'cod. asignatura': 'codigo_asignatura',
  'codigo asignatura': 'codigo_asignatura', 'codigo_asignatura': 'codigo_asignatura',
  'asignatura': 'codigo_asignatura',
  'seccion': 'seccion', 'seccion_docente': 'seccion',
  'semestre': 'semestre', 'periodo': 'semestre', 'periodo academico': 'semestre',
  'sala': 'sala', 'nombre sala': 'sala', 'sala asignada': 'sala',
  'dia': 'dia_semana', 'dia semana': 'dia_semana', 'dia_semana': 'dia_semana',
  'hora inicio': 'hora_inicio', 'hora_inicio': 'hora_inicio',
  'inicio': 'hora_inicio', 'hora de inicio': 'hora_inicio',
  'hora fin': 'hora_fin', 'hora_fin': 'hora_fin', 'fin': 'hora_fin',
  'hora termino': 'hora_fin', 'hora de termino': 'hora_fin',
}

function quitarTildes(s: string): string {
  return s
    .replace(/[\u00e1\u00e0\u00e4]/g, 'a').replace(/[\u00e9\u00e8\u00eb]/g, 'e')
    .replace(/[\u00ed\u00ec\u00ef]/g, 'i').replace(/[\u00f3\u00f2\u00f6]/g, 'o')
    .replace(/[\u00fa\u00f9\u00fc]/g, 'u')
}

/**
 * Parser CSV nativo — sin dependencias externas.
 * Maneja BOM UTF-8, comillas dobles, saltos de linea CRLF/LF y
 * delimitadores coma o punto y coma (auto-detectado por la primera linea).
 */
function parsearCSV(texto: string): string[][] {
  const limpio = texto.replace(/^\uFEFF/, '') // elimina BOM
  const sep = limpio.indexOf(';') !== -1 &&
    (limpio.indexOf(';') < (limpio.indexOf(',') === -1
      ? Infinity : limpio.indexOf(',')))
    ? ';' : ','

  const resultado: string[][] = []
  const lineas = limpio.split(/\r?\n/)

  for (const linea of lineas) {
    if (!linea.trim()) continue
    const celdas: string[] = []
    let enComillas = false
    let celda = ''

    for (let i = 0; i < linea.length; i++) {
      const ch = linea[i]
      if (ch === '"') {
        if (enComillas && linea[i + 1] === '"') {
          celda += '"'; i++ // comilla escapada
        } else {
          enComillas = !enComillas
        }
      } else if (ch === sep && !enComillas) {
        celdas.push(celda.trim())
        celda = ''
      } else {
        celda += ch
      }
    }
    celdas.push(celda.trim())
    resultado.push(celdas)
  }
  return resultado
}

function autoDetectar(headers: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  headers.forEach(h => {
    const norm = quitarTildes(h.toLowerCase().trim())
    result[h] = ALIAS_COLS[norm] ?? ''
  })
  return result
}

function formatearFilas(
  filasRaw: string[][], columnas: string[], mapeo: Record<string, string>
): HorarioFila[] {
  const idx: Record<string, number> = {}
  columnas.forEach((col, i) => { if (mapeo[col]) idx[mapeo[col]] = i })
  return filasRaw
    .map(row => ({
      email_docente: (row[idx.email_docente] ?? '').trim(),
      codigo_asignatura: (row[idx.codigo_asignatura] ?? '').trim(),
      seccion: (row[idx.seccion] ?? '').trim(),
      semestre: (row[idx.semestre] ?? '').trim(),
      sala: idx.sala !== undefined
        ? (row[idx.sala] ?? '').trim() || undefined : undefined,
      dia_semana: idx.dia_semana !== undefined
        ? (row[idx.dia_semana] ?? '').trim() || undefined : undefined,
      hora_inicio: idx.hora_inicio !== undefined
        ? (row[idx.hora_inicio] ?? '').trim() || undefined : undefined,
      hora_fin: idx.hora_fin !== undefined
        ? (row[idx.hora_fin] ?? '').trim() || undefined : undefined,
    }))
    .filter(f => f.email_docente && f.codigo_asignatura)
}

function descargarCSV(datos: HorarioFila[]) {
  const headers = [
    'email_docente', 'codigo_asignatura', 'seccion', 'semestre',
    'sala', 'dia_semana', 'hora_inicio', 'hora_fin',
  ]
  const rows = datos.map(f => [
    f.email_docente, f.codigo_asignatura, f.seccion, f.semestre,
    f.sala ?? '', f.dia_semana ?? '', f.hora_inicio ?? '', f.hora_fin ?? '',
  ])
  const csv = [headers, ...rows]
    .map(r => r.map(v => String(v).includes(',') ? `"${v}"` : v).join(','))
    .join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'horario_hestia.csv'; a.click()
  URL.revokeObjectURL(url)
}

type Paso = 'idle' | 'mapeo' | 'totp' | 'cargando' | 'resultado'

export function ImportarHorario() {
  const [paso, setPaso]             = useState<Paso>('idle')
  const [columnas, setCols]         = useState<string[]>([])
  const [filasRaw, setFilasRaw]     = useState<string[][]>([])
  const [mapeo, setMapeo]           = useState<Record<string, string>>({})
  const [datos, setDatos]           = useState<HorarioFila[]>([])
  const [errorMapeo, setErrorMapeo] = useState<string | null>(null)
  const [codigoTotp, setTotp]       = useState('')
  const [resultado, setResultado]   = useState<HorarioImportResponse | null>(null)
  const [errorMsg, setErrorMsg]     = useState<string | null>(null)
  const [dragOver, setDragOver]     = useState(false)
  const [segundos, setSegundos]     = useState(30)
  const [archivoNombre, setNombre]  = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (paso !== 'totp') return
    const ahora = Math.floor(Date.now() / 1000)
    setSegundos(30 - (ahora % 30))
    const iv = setInterval(() => {
      setSegundos(30 - (Math.floor(Date.now() / 1000) % 30))
    }, 1000)
    return () => clearInterval(iv)
  }, [paso])

  function leerArchivo(file: File) {
    setNombre(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const texto = e.target?.result as string
      const filas = parsearCSV(texto)
      if (!filas.length) { setErrorMsg('El archivo est\u00e1 vac\u00edo.'); return }
      const headers = filas[0].filter(Boolean)
      setFilasRaw(filas.slice(1))
      setCols(headers)
      setMapeo(autoDetectar(headers))
      setDatos([])
      setErrorMapeo(null)
      setPaso('mapeo')
    }
    // UTF-8 con BOM y sin BOM quedan cubiertos por el parser
    reader.readAsText(file, 'UTF-8')
  }

  function seleccionarArchivo(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'csv') {
      setErrorMsg(
        'Solo se aceptan archivos CSV. Si tienes un Excel, ábrelo y
        guárdalo como CSV antes de subirlo.'
      )
      return
    }
    setErrorMsg(null)
    leerArchivo(file)
  }

  function handleFormatear() {
    const faltantes = CAMPOS_REQUERIDOS.filter(
      campo => !Object.values(mapeo).includes(campo)
    )
    if (faltantes.length) {
      const labels = faltantes.map(
        f => CAMPOS_HESTIA.find(c => c.value === f)?.label ?? f
      )
      setErrorMapeo(`Campos requeridos sin mapear: ${labels.join(', ')}`)
      return
    }
    const formateados = formatearFilas(filasRaw, columnas, mapeo)
    if (!formateados.length) {
      setErrorMapeo('No se encontraron filas de datos v\u00e1lidos.')
      return
    }
    setErrorMapeo(null)
    setDatos(formateados)
  }

  async function handleImportar() {
    if (codigoTotp.length !== 6) return
    setPaso('cargando')
    try {
      const { data } = await api.post<HorarioImportResponse>(
        '/importar/horario-academico',
        { filas: datos },
        { headers: { 'x-totp-code': codigoTotp } }
      )
      setResultado(data)
      setPaso('resultado')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        .response?.data?.detail
      setErrorMsg(msg ?? 'Error al importar.')
      setPaso('totp')
    }
  }

  async function descargarPlantilla() {
    const res = await api.get('/importar/plantilla-horario', { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url; a.download = 'plantilla_horario_hestia.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  function reiniciar() {
    setPaso('idle'); setCols([]); setFilasRaw([])
    setMapeo({}); setDatos([]); setErrorMapeo(null)
    setTotp(''); setResultado(null); setErrorMsg(null); setNombre('')
  }

  const pctSeg = (segundos / 30) * 100
  const colorSeg = segundos <= 5 ? '#f43f5e' : segundos <= 10 ? '#f59e0b' : '#0d9488'
  const labelSeg = segundos <= 5
    ? 'text-rose-500' : segundos <= 10 ? 'text-amber-500' : 'text-teal-600'

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500
                     hover:text-slate-700 font-semibold mb-4">
          <ArrowLeft size={14} /> Dashboard
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
              <Calendar size={22} className="text-teal-600" />
              Importar Horario Académico
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Sube el CSV de DuocUC, mapea las columnas y carga el horario en Hestia.
            </p>
          </div>
          <button onClick={descargarPlantilla}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border
                       border-slate-200 text-slate-600 hover:bg-slate-100
                       text-sm font-semibold transition-colors">
            <Download size={14} /> Descargar plantilla CSV
          </button>
        </div>
      </div>

      {/* Paso 1: carga de archivo */}
      {paso === 'idle' && (
        <div className="max-w-xl mx-auto">
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-4
                          flex items-start gap-2">
            <Info size={14} className="text-teal-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-teal-700 leading-relaxed">
              Sube un archivo CSV. Hestia detectará las columnas automáticamente
              y te pedirá confirmar el mapeo antes de importar.{' '}
              <strong>Si tienes un Excel de DuocUC,
              ábrelo y guárdalo como CSV primero</strong>{' '}
              (Archivo → Guardar como → CSV).
            </p>
          </div>
          {errorMsg && (
            <p className="text-rose-600 text-sm bg-rose-50 border border-rose-200
                          px-4 py-3 rounded-xl font-semibold mb-4">{errorMsg}</p>
          )}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault(); setDragOver(false)
              const f = e.dataTransfer.files[0]
              if (f) seleccionarArchivo(f)
            }}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-16 text-center
                         cursor-pointer transition-all ${
              dragOver
                ? 'border-teal-500 bg-teal-50'
                : 'border-slate-300 hover:border-teal-400 hover:bg-slate-50'
            }`}>
            <input ref={inputRef} type="file" accept=".csv" className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]; if (f) seleccionarArchivo(f)
              }} />
            <FileText size={40} className="mx-auto mb-3 text-slate-400" />
            <p className="font-semibold text-slate-700">
              Arrastra el archivo CSV aquí
            </p>
            <p className="text-slate-400 text-sm mt-1">o haz clic para buscarlo</p>
            <p className="text-xs text-slate-300 mt-3">Solo CSV (.csv)</p>
          </div>
        </div>
      )}

      {/* Paso 2: mapeo + preview */}
      {paso === 'mapeo' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Panel izquierdo */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="px-5 py-4 border-b border-slate-100">
                <p className="font-bold text-slate-900 text-sm">
                  Columnas de{' '}
                  <span className="font-mono text-teal-700 text-xs">{archivoNombre}</span>
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Asigna cada columna a un campo de Hestia.
                </p>
              </div>
              <div className="px-5 py-4 space-y-3 max-h-96 overflow-y-auto">
                {columnas.map(col => (
                  <div key={col}>
                    <p className="text-xs font-semibold text-slate-500 mb-1 truncate"
                      title={col}>{col}
                    </p>
                    <select
                      value={mapeo[col] ?? ''}
                      onChange={e => {
                        setMapeo(prev => ({ ...prev, [col]: e.target.value }))
                        setDatos([])
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200
                                 text-sm bg-white focus:outline-none
                                 focus:ring-2 focus:ring-teal-500 cursor-pointer">
                      {CAMPOS_HESTIA.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {errorMapeo && (
              <p className="text-rose-600 text-xs bg-rose-50 border border-rose-200
                            px-3 py-2.5 rounded-xl font-semibold">{errorMapeo}</p>
            )}

            <button onClick={handleFormatear}
              className="w-full flex items-center justify-center gap-2
                         bg-teal-600 hover:bg-teal-700 text-white font-bold
                         py-3 rounded-xl transition-colors text-sm">
              <ArrowRight size={15} /> Formatear y previsualizar
            </button>
            <button onClick={reiniciar}
              className="w-full py-2 text-xs text-slate-400
                         hover:text-slate-600 font-semibold">
              ← Cargar otro archivo
            </button>
          </div>

          {/* Panel derecho */}
          <div className="lg:col-span-3 space-y-4">
            {datos.length === 0 ? (
              <div className="bg-slate-50 border-2 border-dashed border-slate-200
                              rounded-xl h-64 flex flex-col items-center
                              justify-center text-slate-400">
                <FileText size={32} className="mb-2 opacity-40" />
                <p className="text-sm font-semibold">Vista previa</p>
                <p className="text-xs mt-1">Configura el mapeo y presiona Formatear</p>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-xl border border-slate-200
                                shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                      Vista previa — {datos.length} filas
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50">
                          {['Email', 'Cód.', 'Secc.', 'Semestre', 'Día', 'Hora'].map(h => (
                            <th key={h}
                              className="px-3 py-2 text-left font-bold text-slate-500">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {datos.slice(0, 8).map((f, i) => (
                          <tr key={i}
                            className="border-b border-slate-50 hover:bg-slate-50">
                            <td className="px-3 py-2 text-slate-600 truncate max-w-36">
                              {f.email_docente}
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-700">
                              {f.codigo_asignatura}
                            </td>
                            <td className="px-3 py-2 font-bold text-slate-700">
                              {f.seccion}
                            </td>
                            <td className="px-3 py-2 text-slate-600">{f.semestre}</td>
                            <td className="px-3 py-2 capitalize text-slate-600">
                              {f.dia_semana ?? '—'}
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-600">
                              {f.hora_inicio && f.hora_fin
                                ? `${f.hora_inicio}–${f.hora_fin}`
                                : (f.hora_inicio ?? '—')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {datos.length > 8 && (
                      <p className="text-center text-xs text-slate-400 py-2">
                        ... y {datos.length - 8} filas más
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => descargarCSV(datos)}
                    className="flex-1 flex items-center justify-center gap-2
                               border border-slate-200 hover:bg-slate-50
                               text-slate-700 font-bold py-3 rounded-xl
                               transition-colors text-sm">
                    <Download size={15} /> Descargar CSV
                  </button>
                  <button
                    onClick={() => { setTotp(''); setErrorMsg(null); setPaso('totp') }}
                    className="flex-1 flex items-center justify-center gap-2
                               bg-teal-600 hover:bg-teal-700 text-white font-bold
                               py-3 rounded-xl transition-colors text-sm">
                    <Shield size={15} /> Importar a Hestia
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal TOTP */}
      {paso === 'totp' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center
                        p-4 bg-black/60">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-teal-100
                              flex items-center justify-center">
                <Shield size={20} className="text-teal-600" />
              </div>
              <div>
                <p className="font-bold text-slate-900">Verificación 2FA</p>
                <p className="text-slate-500 text-sm">
                  Autoriza la importación de {datos.length} clases.
                </p>
              </div>
            </div>
            <div className="relative mb-4">
              <input
                type="text" inputMode="numeric" maxLength={6}
                value={codigoTotp}
                onChange={e => {
                  setTotp(e.target.value.replace(/\D/g, ''))
                  setErrorMsg(null)
                }}
                onKeyDown={e => e.key === 'Enter' && handleImportar()}
                placeholder="000000" autoFocus
                className="w-full px-4 py-5 rounded-xl border-2 border-slate-200
                           text-4xl text-center font-black tracking-[0.7em]
                           focus:outline-none focus:border-teal-500 bg-slate-50
                           placeholder:text-slate-200"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2
                              flex flex-col items-center">
                <svg width="36" height="36" className="-rotate-90">
                  <circle cx="18" cy="18" r="14" fill="none"
                    stroke="#e2e8f0" strokeWidth="3" />
                  <circle cx="18" cy="18" r="14" fill="none"
                    stroke={colorSeg} strokeWidth="3"
                    strokeDasharray={`${2 * Math.PI * 14}`}
                    strokeDashoffset={`${2 * Math.PI * 14 * (1 - pctSeg / 100)}`}
                    strokeLinecap="round"
                    style={{
                      transition: 'stroke-dashoffset 1s linear, stroke 0.3s'
                    }} />
                </svg>
                <span className={`text-xs font-black -mt-7 ${labelSeg}`}>
                  {segundos}
                </span>
              </div>
            </div>
            {errorMsg && (
              <p className="text-rose-600 text-sm bg-rose-50 border border-rose-200
                            px-3 py-2 rounded-xl font-semibold mb-4">{errorMsg}</p>
            )}
            <button onClick={handleImportar} disabled={codigoTotp.length !== 6}
              className="w-full flex items-center justify-center gap-2
                         bg-teal-600 hover:bg-teal-700 text-white font-bold
                         py-3 rounded-xl disabled:opacity-50
                         disabled:cursor-not-allowed mb-3">
              <Upload size={16} /> Confirmar importación
            </button>
            <button onClick={() => setPaso('mapeo')}
              className="w-full py-2 text-sm text-slate-400
                         hover:text-slate-600 font-semibold">
              ← Volver
            </button>
          </div>
        </div>
      )}

      {/* Cargando */}
      {paso === 'cargando' && (
        <div className="max-w-sm mx-auto bg-white rounded-2xl border
                        border-slate-200 shadow-sm p-16 text-center">
          <RefreshCw size={40}
            className="mx-auto mb-4 text-teal-600 animate-spin" />
          <p className="font-bold text-slate-900">Importando horario...</p>
          <p className="text-slate-500 text-sm mt-1">
            Esto puede tardar unos segundos.
          </p>
        </div>
      )}

      {/* Resultado */}
      {paso === 'resultado' && resultado && (
        <div className="max-w-xl mx-auto space-y-4">
          <div className={`rounded-2xl border p-6 ${
            resultado.omitidos === 0
              ? 'bg-teal-50 border-teal-200'
              : resultado.importados + resultado.actualizados === 0
              ? 'bg-rose-50 border-rose-200'
              : 'bg-amber-50 border-amber-200'
          }`}>
            <div className="flex items-center gap-3 mb-5">
              {resultado.importados + resultado.actualizados > 0
                ? <CheckCircle size={24} className="text-teal-600" />
                : <XCircle size={24} className="text-rose-600" />}
              <p className="font-black text-slate-900 text-lg">
                Importación completada
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-xl p-4 text-center border border-teal-200">
                <p className="text-3xl font-black text-teal-600">
                  {resultado.importados}
                </p>
                <p className="text-xs font-semibold text-slate-500 mt-1">Nuevas</p>
              </div>
              <div className="bg-white rounded-xl p-4 text-center border border-blue-200">
                <p className="text-3xl font-black text-blue-600">
                  {resultado.actualizados}
                </p>
                <p className="text-xs font-semibold text-slate-500 mt-1">
                  Actualizadas
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 text-center border border-rose-200">
                <p className="text-3xl font-black text-rose-500">
                  {resultado.omitidos}
                </p>
                <p className="text-xs font-semibold text-slate-500 mt-1">Omitidas</p>
              </div>
            </div>
          </div>

          {resultado.errores.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200
                            shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50
                              flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-500" />
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                  Errores ({resultado.errores.length})
                </p>
              </div>
              <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {resultado.errores.map((e, i) => (
                  <div key={i} className="px-4 py-3 flex items-start gap-3">
                    <span className="text-xs font-black text-slate-400 mt-0.5
                                     w-12 flex-shrink-0">Fila {e.fila}</span>
                    <p className="text-sm text-rose-600 font-semibold">{e.razon}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button onClick={reiniciar}
            className="w-full flex items-center justify-center gap-2
                       border border-slate-200 hover:bg-slate-50
                       text-slate-700 font-bold py-3 rounded-xl">
            <Upload size={15} /> Importar otro archivo
          </button>
        </div>
      )}
    </div>
  )
}

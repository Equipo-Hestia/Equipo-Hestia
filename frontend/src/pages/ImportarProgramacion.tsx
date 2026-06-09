import { useState, useRef } from 'react'
import {
  Upload, FileSpreadsheet, CheckCircle2,
  XCircle, AlertTriangle, RefreshCw, Info,
} from 'lucide-react'
import { api } from '../api/client'
import type { ImportarProgramacionResponse } from '../types/api'

type Paso = 'idle' | 'cargando' | 'resultado'

// Semestres sugeridos: actual y los dos anteriores
function generarSemestres(): string[] {
  const now = new Date()
  const year = now.getFullYear()
  const mes = now.getMonth() + 1
  const semActual = mes <= 6 ? `${year}-1` : `${year}-2`
  const opciones: string[] = []
  for (let i = 0; i < 4; i++) {
    const [y, s] = semActual.split('-').map(Number)
    const totalSems = y * 2 + s - 1 - i
    opciones.push(`${Math.floor(totalSems / 2)}-${totalSems % 2 === 0 ? 2 : 1}`)
  }
  return opciones
}

export function ImportarProgramacion() {
  const [paso,       setPaso]       = useState<Paso>('idle')
  const [semestre,   setSemestre]   = useState(generarSemestres()[0])
  const [semestreCustom, setSemCustom] = useState('')
  const [usarCustom, setUsarCustom] = useState(false)
  const [archivo,    setArchivo]    = useState<File | null>(null)
  const [resultado,  setResultado]  = useState<ImportarProgramacionResponse | null>(null)
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null)
  const [dragOver,   setDragOver]   = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const semestreEfectivo = usarCustom
    ? semestreCustom.trim()
    : semestre

  function handleArchivo(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'xlsx' && ext !== 'xls') {
      setErrorMsg('Solo se aceptan archivos Excel (.xlsx o .xls).')
      return
    }
    setErrorMsg(null)
    setArchivo(file)
  }

  async function handleImportar() {
    if (!archivo || !semestreEfectivo) return
    setPaso('cargando')
    setErrorMsg(null)
    try {
      const form = new FormData()
      form.append('archivo', archivo)
      const { data } = await api.post<ImportarProgramacionResponse>(
        `/programacion/importar-xlsx?semestre=${encodeURIComponent(semestreEfectivo)}`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      setResultado(data)
      setPaso('resultado')
    } catch (err: unknown) {
      const detail = (
        err as { response?: { data?: { detail?: string } } }
      )?.response?.data?.detail
      setErrorMsg(
        typeof detail === 'string'
          ? detail
          : 'Error al importar. Verifica el archivo y la conexion.'
      )
      setPaso('idle')
    }
  }

  function reiniciar() {
    setPaso('idle')
    setArchivo(null)
    setResultado(null)
    setErrorMsg(null)
  }

  const labelCls = (
    'block text-[10px] font-semibold text-h-tertiary mb-1.5 '
    + 'uppercase tracking-widest'
  )
  const inputCls = (
    'w-full px-3 py-2.5 rounded-lg text-h-primary text-sm '
    + 'focus:outline-none transition-all bg-h-elevated border '
    + 'border-h-visible focus:border-h-strong placeholder:text-h-tertiary'
  )

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">

      {/* Encabezado */}
      <div>
        <h1 className="text-2xl font-bold text-h-primary">
          Importar Programacion
        </h1>
        <p className="text-sm text-h-secondary mt-0.5">
          Carga el Excel de planificacion semestral de Maritza para
          alimentar la Vista de Salas.
        </p>
      </div>

      {/* Info */}
      <div
        className="flex items-start gap-2.5 rounded-xl px-4 py-3"
        style={{
          background: 'rgba(29,158,117,0.08)',
          border:     '1px solid rgba(29,158,117,0.25)',
        }}
      >
        <Info size={14} style={{ color: '#5dcaa5', flexShrink: 0, marginTop: 2 }} />
        <p className="text-xs leading-relaxed" style={{ color: '#5dcaa5' }}>
          El Excel debe tener las columnas:{' '}
          <strong>Nombre de Taller</strong>,{' '}
          <strong>Fecha</strong>,{' '}
          <strong>Sala</strong>,{' '}
          <strong>Horario</strong>,{' '}
          <strong>Docente</strong>,{' '}
          <strong>Seccion</strong>. Puede tener multiples hojas; cada una
          se procesa de forma independiente. Re-importar el mismo archivo
          es seguro (upsert idempotente).
        </p>
      </div>

      {paso === 'idle' && (
        <div className="space-y-5">

          {/* Selector semestre */}
          <div
            className="rounded-2xl border border-h-subtle p-5 space-y-4"
            style={{ background: 'var(--h-bg-surface)' }}
          >
            <div>
              <label className={labelCls}>Semestre</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {generarSemestres().map(s => (
                  <button key={s} type="button"
                    onClick={() => { setSemestre(s); setUsarCustom(false) }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold
                               transition-colors"
                    style={{
                      background: !usarCustom && semestre === s
                        ? 'var(--h-teal-rest)'
                        : 'var(--h-bg-elevated)',
                      color: !usarCustom && semestre === s
                        ? 'white'
                        : 'var(--h-text-secondary)',
                      border: '1px solid var(--h-border-subtle)',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Otro semestre (ej: 2027-1)"
                  value={semestreCustom}
                  onChange={e => {
                    setSemCustom(e.target.value)
                    setUsarCustom(!!e.target.value.trim())
                  }}
                  className={inputCls}
                  style={{ flex: 1 }}
                />
              </div>
              {usarCustom && semestreCustom.trim() && (
                <p className="text-[10px] text-h-tertiary mt-1">
                  Usando semestre personalizado:{' '}
                  <span className="font-bold text-h-secondary">
                    {semestreCustom.trim()}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Dropzone */}
          <div
            className="rounded-2xl border border-h-subtle p-5"
            style={{ background: 'var(--h-bg-surface)' }}
          >
            <label className={labelCls}>Archivo Excel (.xlsx)</label>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault(); setDragOver(false)
                const f = e.dataTransfer.files[0]
                if (f) handleArchivo(f)
              }}
              onClick={() => inputRef.current?.click()}
              className="flex flex-col items-center justify-center
                         rounded-xl border-2 border-dashed cursor-pointer
                         py-10 transition-all"
              style={{
                borderColor: dragOver
                  ? 'var(--h-teal-rest)'
                  : archivo
                    ? 'rgba(29,158,117,0.5)'
                    : 'var(--h-border-visible)',
                background: dragOver
                  ? 'rgba(29,158,117,0.05)'
                  : archivo
                    ? 'rgba(29,158,117,0.04)'
                    : 'var(--h-bg-elevated)',
              }}
            >
              <input
                ref={inputRef} type="file" accept=".xlsx,.xls"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) handleArchivo(f)
                }}
              />
              {archivo ? (
                <>
                  <FileSpreadsheet size={36} style={{ color: '#1D9E75' }}
                    className="mb-2" />
                  <p className="text-sm font-semibold text-h-primary">
                    {archivo.name}
                  </p>
                  <p className="text-xs text-h-tertiary mt-0.5">
                    {(archivo.size / 1024).toFixed(0)} KB
                    {' '}&mdash; clic para cambiar
                  </p>
                </>
              ) : (
                <>
                  <Upload size={32} className="mb-2 text-h-tertiary" />
                  <p className="text-sm font-semibold text-h-primary">
                    Arrastra el Excel aqui
                  </p>
                  <p className="text-xs text-h-tertiary mt-0.5">
                    o haz clic para buscarlo
                  </p>
                </>
              )}
            </div>
          </div>

          {errorMsg && (
            <div
              className="flex items-start gap-2 rounded-xl px-4 py-3 text-xs
                         font-semibold"
              style={{
                background: 'var(--h-sem-danger-bg)',
                color:      'var(--h-sem-danger-text)',
                border:     '1px solid var(--h-sem-danger-border)',
              }}
            >
              <XCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              {errorMsg}
            </div>
          )}

          {/* Boton importar */}
          <button
            onClick={handleImportar}
            disabled={!archivo || !semestreEfectivo}
            className="w-full flex items-center justify-center gap-2
                       py-3 rounded-xl text-sm font-semibold text-white
                       transition-colors disabled:opacity-40
                       disabled:cursor-not-allowed"
            style={{ background: 'var(--h-teal-rest)' }}
            onMouseEnter={e => {
              if (archivo && semestreEfectivo)
                e.currentTarget.style.background = 'var(--h-teal-hover)'
            }}
            onMouseLeave={e =>
              (e.currentTarget.style.background = 'var(--h-teal-rest)')}
          >
            <Upload size={15} />
            Importar programacion
          </button>
        </div>
      )}

      {/* Cargando */}
      {paso === 'cargando' && (
        <div
          className="flex flex-col items-center justify-center py-16
                     rounded-2xl border border-h-subtle"
          style={{ background: 'var(--h-bg-surface)' }}
        >
          <RefreshCw size={32} className="animate-spin mb-4"
            style={{ color: 'var(--h-teal-hover)' }} />
          <p className="text-sm font-semibold text-h-primary">
            Procesando el archivo...
          </p>
          <p className="text-xs text-h-tertiary mt-1">
            Esto puede tardar unos segundos
          </p>
        </div>
      )}

      {/* Resultado */}
      {paso === 'resultado' && resultado && (
        <div className="space-y-4">

          {/* Tarjeta resumen */}
          <div
            className="rounded-2xl border p-6"
            style={{
              background: resultado.importadas + resultado.actualizadas > 0
                ? 'rgba(29,158,117,0.06)'
                : 'var(--h-bg-surface)',
              border: resultado.importadas + resultado.actualizadas > 0
                ? '1px solid rgba(29,158,117,0.3)'
                : '1px solid var(--h-border-subtle)',
            }}
          >
            <div className="flex items-center gap-3 mb-5">
              {resultado.importadas + resultado.actualizadas > 0 ? (
                <CheckCircle2 size={22} style={{ color: '#1D9E75' }} />
              ) : (
                <XCircle size={22} style={{ color: 'var(--h-sem-danger-text)' }} />
              )}
              <div>
                <p className="font-bold text-h-primary">
                  Importacion completada
                </p>
                <p className="text-xs text-h-tertiary">
                  Semestre: {semestreEfectivo}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  valor: resultado.importadas,
                  label: 'Nuevas',
                  color: '#1D9E75',
                  bg: 'rgba(29,158,117,0.08)',
                  border: 'rgba(29,158,117,0.3)',
                },
                {
                  valor: resultado.actualizadas,
                  label: 'Actualizadas',
                  color: '#378ADD',
                  bg: 'rgba(55,138,221,0.08)',
                  border: 'rgba(55,138,221,0.3)',
                },
                {
                  valor: resultado.omitidas,
                  label: 'Omitidas',
                  color: resultado.omitidas > 0
                    ? 'var(--h-sem-danger-text)' : 'var(--h-text-tertiary)',
                  bg: resultado.omitidas > 0
                    ? 'var(--h-sem-danger-bg)' : 'var(--h-bg-elevated)',
                  border: resultado.omitidas > 0
                    ? 'var(--h-sem-danger-border)' : 'var(--h-border-subtle)',
                },
              ].map(({ valor, label, color, bg, border }) => (
                <div key={label}
                  className="rounded-xl p-4 text-center"
                  style={{ background: bg, border: `1px solid ${border}` }}
                >
                  <p className="text-3xl font-bold" style={{ color }}>
                    {valor}
                  </p>
                  <p className="text-[10px] font-semibold text-h-tertiary mt-1"
                    style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}
                  >
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Tabla de errores */}
          {resultado.errores.length > 0 && (
            <div
              className="rounded-2xl border border-h-subtle overflow-hidden"
              style={{ background: 'var(--h-bg-surface)' }}
            >
              <div
                className="flex items-center gap-2 px-5 py-3 border-b
                           border-h-subtle"
                style={{ background: 'var(--h-bg-elevated)' }}
              >
                <AlertTriangle size={13}
                  style={{ color: 'var(--h-sem-warning-text)' }} />
                <p className="text-[10px] font-semibold text-h-tertiary
                               uppercase tracking-widest">
                  Errores ({resultado.errores.length})
                </p>
              </div>
              <div className="divide-y divide-h-subtle max-h-64 overflow-y-auto">
                {resultado.errores.map((e, i) => (
                  <div key={i}
                    className="flex items-start gap-4 px-5 py-3"
                  >
                    <span
                      className="text-[10px] font-bold text-h-tertiary
                                 flex-shrink-0 mt-0.5 font-mono"
                    >
                      {e.hoja} / fila {e.fila}
                    </span>
                    <p className="text-xs text-h-secondary">{e.razon}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={reiniciar}
            className="w-full flex items-center justify-center gap-2
                       py-3 rounded-xl text-sm font-semibold
                       text-h-secondary border border-h-subtle
                       transition-colors"
            style={{ background: 'var(--h-bg-elevated)' }}
            onMouseEnter={e =>
              (e.currentTarget.style.background = 'var(--h-bg-highlight)')}
            onMouseLeave={e =>
              (e.currentTarget.style.background = 'var(--h-bg-elevated)')}
          >
            <Upload size={14} /> Importar otro archivo
          </button>
        </div>
      )}
    </div>
  )
}

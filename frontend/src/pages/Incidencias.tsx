import { useState, useEffect, useCallback, useRef } from 'react'
import {
  AlertOctagon, Plus, Pencil, Trash2,
  Search, RefreshCw, CheckCircle, Camera, X,
} from 'lucide-react'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'
import type {
  IncidenciaResponse, IncidenciaCreate, IncidenciaUpdate,
  TipoIncidencia, SeveridadIncidencia, EstadoIncidencia,
  SalaResponse, PaginatedResponse,
} from '../types/api'
import { HSelect } from '../components/ui/HSelect'
import { useLastUpdated } from '../hooks/useLastUpdated'

// ---------------------------------------------------------------------------
// Configuracion de badges
// ---------------------------------------------------------------------------

const TIPO_CFG: Record<TipoIncidencia, { label: string; cls: string }> = {
  dano_fisico:       { label: 'Daño físico',       cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  pieza_perdida:     { label: 'Pieza perdida',     cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' },
  mal_funcionamiento: { label: 'Mal funcionamiento', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  otro:              { label: 'Otro',              cls: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300' },
}

const SEVERIDAD_CFG: Record<SeveridadIncidencia, { label: string; cls: string }> = {
  leve:     { label: 'Leve',     cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  moderada: { label: 'Moderada', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  critica:  { label: 'Crítica',  cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
}

const ESTADO_CFG: Record<EstadoIncidencia, { label: string; cls: string }> = {
  abierta:     { label: 'Abierta',     cls: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300' },
  en_revision: { label: 'En revisión', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  resuelta:    { label: 'Resuelta',    cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
}

function TipoBadge({ tipo }: { tipo: TipoIncidencia }) {
  const cfg = TIPO_CFG[tipo]
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full
                      text-xs font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function SeveridadBadge({ severidad }: { severidad: SeveridadIncidencia }) {
  const cfg = SEVERIDAD_CFG[severidad]
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full
                      text-xs font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function EstadoBadge({ estado }: { estado: EstadoIncidencia }) {
  const cfg = ESTADO_CFG[estado]
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full
                      text-xs font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Opciones para HSelect
// ---------------------------------------------------------------------------

const TIPO_OPTS = [
  { value: 'dano_fisico',       label: 'Daño físico' },
  { value: 'pieza_perdida',     label: 'Pieza perdida' },
  { value: 'mal_funcionamiento', label: 'Mal funcionamiento' },
  { value: 'otro',              label: 'Otro' },
]

const SEVERIDAD_OPTS = [
  { value: 'leve',     label: 'Leve' },
  { value: 'moderada', label: 'Moderada' },
  { value: 'critica',  label: 'Crítica' },
]

const ESTADO_OPTS = [
  { value: 'abierta',     label: 'Abierta' },
  { value: 'en_revision', label: 'En revisión' },
  { value: 'resuelta',    label: 'Resuelta' },
]

// ---------------------------------------------------------------------------
// Sub-componente: autocompletado de activo fijo
// ---------------------------------------------------------------------------

interface SugerenciaActivo {
  id: number
  nombre: string
  codigo_interno: string | null
  tipo: string
}

interface ActivoSelectorProps {
  value: number | null
  label: string
  onChange: (id: number | null, nombre: string) => void
}

function ActivoSelector({ value, label, onChange }: ActivoSelectorProps) {
  const [query, setQuery] = useState(label)
  const [sugerencias, setSugerencias] = useState<SugerenciaActivo[]>([])
  const [inventario, setInventario] = useState<SugerenciaActivo[]>([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Carga la lista de activos del inventario al montar el componente.
  // Se usa en el dropdown de foco cuando el campo está vacío.
  useEffect(() => {
    api.get<{ id: number; nombre: string; codigo_interno: string | null; tipo: string }[]>(
      '/activos-fijos/', { params: { limit: 50 } }
    ).then(r => setInventario(r.data)).catch(() => {})
  }, [])

  useEffect(() => { setQuery(label) }, [label])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    // Si el campo coincide con la selección actual no re-buscar
    if (query === label && value !== null) return
    if (query.trim().length < 2) {
      setSugerencias([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get<SugerenciaActivo[]>(
          '/activos-fijos/sugerencias', { params: { q: query.trim() } }
        )
        setSugerencias(data)
        setOpen(data.length > 0)
      } catch { setSugerencias([]) }
    }, 250)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, label, value])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleFocus() {
    // Al hacer foco sin texto muestra el inventario completo;
    // con texto ya filtrado muestra las sugerencias ya cargadas.
    setOpen(true)
  }

  function seleccionar(s: SugerenciaActivo) {
    setQuery(`${s.nombre} [${s.codigo_interno ?? s.id}]`)
    setSugerencias([])
    setOpen(false)
    onChange(s.id, `${s.nombre} [${s.codigo_interno ?? s.id}]`)
  }

  // Qué lista mostrar: si hay texto usa las sugerencias filtradas,
  // si no hay texto usa el inventario completo.
  const listaVisible = query.trim().length >= 2 ? sugerencias : inventario

  const inputCls = (
    'w-full px-3 py-2.5 rounded-lg text-h-primary text-sm '
    + 'focus:outline-none transition-all bg-h-elevated border '
    + 'border-h-visible focus:border-h-strong placeholder:text-h-tertiary'
  )

  return (
    <div ref={containerRef} className="relative">
      <input
        className={inputCls}
        value={query}
        onChange={e => {
          setQuery(e.target.value)
          if (!e.target.value) { onChange(null, ''); setOpen(true) }
        }}
        onFocus={handleFocus}
        placeholder="Buscar o seleccionar equipo..."
        autoComplete="off"
      />
      {open && listaVisible.length > 0 && (
        <ul className="absolute left-0 right-0 top-full mt-1.5 z-50 overflow-y-auto
                        rounded-xl shadow-lg border border-h-subtle max-h-52"
          style={{ background: 'var(--h-bg-surface)' }}>
          {listaVisible.map(s => (
            <li key={s.id}>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); seleccionar(s) }}
                className="w-full text-left px-4 py-2.5 text-sm flex items-center
                           gap-3 text-h-secondary transition-colors"
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'var(--h-bg-highlight)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = ''
                }}
              >
                <Search size={11} className="text-h-tertiary flex-shrink-0" />
                <span className="font-medium text-h-primary truncate">{s.nombre}</span>
                {s.codigo_interno && (
                  <span className="text-xs font-mono text-h-tertiary ml-auto">
                    {s.codigo_interno}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

interface ModalProps {
  incidencia: IncidenciaResponse | null
  salas: SalaResponse[]
  onClose: () => void
  onSaved: () => void
}

function IncidenciaModal({ incidencia, salas, onClose, onSaved }: ModalProps) {
  const esNueva = incidencia === null

  const ahora = new Date()
  const ahoraLocal = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 16)

  const [activoId, setActivoId] = useState<number | null>(
    incidencia?.activo_fijo_id ?? null
  )
  const [activoLabel, setActivoLabel] = useState(
    incidencia
      ? `${incidencia.activo_fijo_nombre ?? ''} [${incidencia.activo_fijo_codigo ?? incidencia.activo_fijo_id}]`
      : ''
  )
  const [tipo, setTipo] = useState<string>(incidencia?.tipo ?? 'dano_fisico')
  const [descripcion, setDescripcion] = useState(incidencia?.descripcion ?? '')
  const [salaId, setSalaId] = useState<string>(incidencia?.sala_id?.toString() ?? '')
  const [fechaHora, setFechaHora] = useState(
    incidencia
      ? new Date(incidencia.fecha_hora).toISOString().slice(0, 16)
      : ahoraLocal
  )
  // docenteNombre es solo lectura: se obtiene de ProgramacionTaller al seleccionar sala.
  const [docenteNombre, setDocenteNombre] = useState<string | null>(
    incidencia?.responsable_nombre ?? null
  )
  const [cargandoDocente, setCargandoDocente] = useState(false)
  const [severidad, setSeveridad] = useState<string>(incidencia?.severidad ?? 'leve')
  const [estado, setEstado] = useState<string>(incidencia?.estado ?? 'abierta')
  const [fotoB64, setFotoB64] = useState<string | null>(incidencia?.foto_b64 ?? null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const salaOpts = salas.map(s => ({ value: String(s.id), label: s.nombre }))

  async function buscarDocente(nuevoSalaId: string, nuevaFecha: string) {
    if (!nuevoSalaId || !nuevaFecha) return
    setCargandoDocente(true)
    setDocenteNombre(null)
    try {
      const { data } = await api.get<{ docente_nombre: string | null }>(
        '/incidencias/docente-sugerido',
        { params: { sala_id: nuevoSalaId, fecha: nuevaFecha.slice(0, 10) } }
      )
      setDocenteNombre(data.docente_nombre)
    } catch { /* silencioso */ } finally { setCargandoDocente(false) }
  }

  function handleSalaChange(val: string) {
    setSalaId(val)
    buscarDocente(val, fechaHora)
  }

  function handleFechaChange(val: string) {
    setFechaHora(val)
    buscarDocente(salaId, val)
  }

  function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setFotoB64((ev.target?.result as string) ?? null)
    reader.readAsDataURL(file)
  }

  async function handleGuardar() {
    if (!activoId) { setError('Selecciona el equipo afectado'); return }
    if (!descripcion.trim()) { setError('La descripción es obligatoria'); return }
    if (!salaId) { setError('La sala es obligatoria'); return }
    setGuardando(true); setError('')
    try {
      if (esNueva) {
        const body: IncidenciaCreate = {
          activo_fijo_id: activoId,
          tipo: tipo as TipoIncidencia,
          descripcion: descripcion.trim(),
          sala_id: parseInt(salaId),
          responsable_nombre: docenteNombre ?? null,
          fecha_hora: fechaHora ? new Date(fechaHora).toISOString() : null,
          severidad: severidad as SeveridadIncidencia,
          estado: estado as EstadoIncidencia,
          foto_b64: fotoB64 ?? null,
        }
        await api.post('/incidencias/', body)
      } else {
        const body: IncidenciaUpdate = {
          tipo: tipo as TipoIncidencia,
          descripcion: descripcion.trim(),
          sala_id: salaId ? parseInt(salaId) : null,
          responsable_nombre: docenteNombre ?? null,
          fecha_hora: fechaHora ? new Date(fechaHora).toISOString() : null,
          severidad: severidad as SeveridadIncidencia,
          estado: estado as EstadoIncidencia,
          foto_b64: fotoB64 ?? null,
        }
        await api.patch(`/incidencias/${incidencia!.id}`, body)
      }
      onSaved()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail
      setError(detail ?? 'Error al guardar')
    } finally { setGuardando(false) }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center
                    bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-h-surface border border-h-subtle rounded-2xl shadow-2xl
                      w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4
                        border-b border-h-subtle flex-shrink-0">
          <h2 className="text-base font-semibold text-h-primary">
            {esNueva ? 'Registrar incidencia' : 'Editar incidencia'}
          </h2>
          <button onClick={onClose}
            className="text-h-tertiary hover:text-h-secondary text-xl font-bold
                       transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

          {/* Equipo afectado */}
          <div>
            <label className={labelCls}>Equipo afectado *</label>
            <ActivoSelector
              value={activoId}
              label={activoLabel}
              onChange={(id, lbl) => { setActivoId(id); setActivoLabel(lbl) }}
            />
          </div>

          {/* Tipo */}
          <div>
            <label className={labelCls}>Tipo de incidencia *</label>
            <HSelect
              value={tipo} onChange={setTipo}
              options={TIPO_OPTS} className="w-full"
            />
          </div>

          {/* Descripción */}
          <div>
            <label className={labelCls}>Descripción del daño *</label>
            <textarea
              className={`${inputCls} resize-none`} rows={3}
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Describe el daño o problema observado..." />
          </div>

          {/* Sala */}
          <div>
            <label className={labelCls}>Sala donde ocurrió *</label>
            <HSelect
              value={salaId} onChange={handleSalaChange}
              options={salaOpts} placeholder="Seleccionar sala..." className="w-full"
            />
          </div>

          {/* Fecha y hora */}
          <div>
            <label className={labelCls}>Fecha y hora</label>
            <input
              type="datetime-local"
              className={inputCls}
              value={fechaHora}
              onChange={e => handleFechaChange(e.target.value)}
            />
          </div>

          {/* Responsable — solo lectura, obtenido de ProgramacionTaller */}
          <div>
            <label className={labelCls}>Docente asignado a la sala</label>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border
                            text-sm border-h-subtle"
              style={{ background: 'var(--h-bg-elevated)' }}>
              {cargandoDocente ? (
                <span className="text-h-tertiary flex items-center gap-2">
                  <RefreshCw size={12} className="animate-spin" /> Buscando docente...
                </span>
              ) : docenteNombre ? (
                <span className="text-h-primary font-medium">{docenteNombre}</span>
              ) : salaId ? (
                <span className="text-h-tertiary italic">
                  Sin docente asignado en el horario para esta sala y fecha
                </span>
              ) : (
                <span className="text-h-tertiary italic">
                  Se completará al seleccionar la sala
                </span>
              )}
            </div>
          </div>

          {/* Severidad y Estado en fila */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Severidad *</label>
              <HSelect
                value={severidad} onChange={setSeveridad}
                options={SEVERIDAD_OPTS} className="w-full"
              />
            </div>
            <div>
              <label className={labelCls}>Estado *</label>
              <HSelect
                value={estado} onChange={setEstado}
                options={ESTADO_OPTS} className="w-full"
              />
            </div>
          </div>

          {/* Foto adjunta */}
          <div>
            <label className={labelCls}>Foto adjunta (opcional)</label>
            {fotoB64 ? (
              <div className="relative">
                <img
                  src={fotoB64} alt="Foto incidencia"
                  className="w-full max-h-48 object-contain rounded-lg border
                             border-h-subtle"
                />
                <button
                  type="button"
                  onClick={() => setFotoB64(null)}
                  className="absolute top-2 right-2 p-1 rounded-full text-white"
                  style={{ background: 'var(--h-sem-danger-text)' }}
                  title="Quitar foto"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <label
                className="flex items-center gap-2 px-4 py-3 rounded-lg border-2
                           border-dashed border-h-visible cursor-pointer
                           text-h-tertiary text-sm transition-colors"
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--h-teal-hover)'
                  e.currentTarget.style.color = 'var(--h-teal-hover)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = ''
                  e.currentTarget.style.color = ''
                }}
              >
                <Camera size={16} />
                Adjuntar foto
                <input type="file" accept="image/*" className="hidden"
                  onChange={handleFotoChange} />
              </label>
            )}
          </div>

          {error && (
            <p className="text-xs font-medium px-3 py-2 rounded-lg"
              style={{
                background: 'var(--h-sem-danger-bg)',
                color: 'var(--h-sem-danger-text)',
                border: '1px solid var(--h-sem-danger-border)',
              }}>
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4
                        border-t border-h-subtle flex-shrink-0">
          <button onClick={onClose} disabled={guardando}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-h-secondary
                       hover:bg-h-elevated transition-colors">
            Cancelar
          </button>
          <button onClick={handleGuardar} disabled={guardando}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white
                       transition-colors disabled:opacity-50"
            style={{ background: 'var(--h-teal-rest)' }}
            onMouseEnter={e => !guardando &&
              (e.currentTarget.style.background = 'var(--h-teal-hover)')}
            onMouseLeave={e =>
              (e.currentTarget.style.background = 'var(--h-teal-rest)')}
          >
            {guardando ? 'Guardando...' : esNueva ? 'Registrar' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal de foto ampliada
// ---------------------------------------------------------------------------

function FotoModal({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center
                    bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}>
      <img src={src} alt="Foto incidencia"
        className="max-w-full max-h-[90vh] rounded-xl shadow-2xl object-contain"
        onClick={e => e.stopPropagation()}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pagina principal
// ---------------------------------------------------------------------------

const ROLES_ESCRITURA = ['admin', 'operador_coordinador', 'operador']
const COLS = [
  'Equipo', 'Tipo', 'Descripción', 'Sala', 'Fecha', 'Responsable',
  'Severidad', 'Estado', 'Acciones',
]

function formatFecha(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function Incidencias() {
  const { user } = useAuthStore()
  const puedeEscribir = user?.rol ? ROLES_ESCRITURA.includes(user.rol) : false
  const esAdmin = user?.rol === 'admin'

  const [incidencias, setIncidencias] = useState<IncidenciaResponse[]>([])
  const [salas, setSalas] = useState<SalaResponse[]>([])
  const [cargando, setCargando] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState<string>('')
  const [filtroSeveridad, setFiltroSeveridad] = useState<string>('')
  const [filtroTipo, setFiltroTipo] = useState<string>('')
  const [filtroSala, setFiltroSala] = useState<string>('')
  const [busqueda, setBusqueda] = useState('')
  const [modalInc, setModalInc] =
    useState<IncidenciaResponse | null | undefined>(undefined)
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const { labelTiempo, marcarActualizado } = useLastUpdated()

  function mostrarToast(msg: string) {
    setToast(msg); setTimeout(() => setToast(''), 3000)
  }

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const params: Record<string, string> = {}
      if (filtroEstado)    params.estado     = filtroEstado
      if (filtroSeveridad) params.severidad  = filtroSeveridad
      if (filtroTipo)      params.tipo       = filtroTipo
      if (filtroSala)      params.sala_id    = filtroSala
      const res = await api.get<IncidenciaResponse[]>('/incidencias/', { params })
      const lista = busqueda.trim()
        ? res.data.filter(i =>
            i.activo_fijo_nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
            i.activo_fijo_codigo?.toLowerCase().includes(busqueda.toLowerCase()) ||
            i.descripcion.toLowerCase().includes(busqueda.toLowerCase()) ||
            i.responsable_nombre?.toLowerCase().includes(busqueda.toLowerCase())
          )
        : res.data
      setIncidencias(lista)
      marcarActualizado()
    } catch {
      mostrarToast('Error al cargar incidencias')
    } finally { setCargando(false) }
  }, [filtroEstado, filtroSeveridad, filtroTipo, filtroSala, busqueda, marcarActualizado])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    api.get<PaginatedResponse<SalaResponse>>('/salas/', { params: { limit: 100 } })
      .then(r => setSalas(r.data.data ?? [])).catch(() => {})
  }, [])

  async function handleEliminar(inc: IncidenciaResponse) {
    if (!confirm(`¿Eliminar incidencia "${inc.activo_fijo_nombre}"?`)) return
    try {
      await api.delete(`/incidencias/${inc.id}`)
      mostrarToast('Incidencia eliminada'); cargar()
    } catch { mostrarToast('Error al eliminar') }
  }

  const salaFiltroOpts = salas.map(s => ({ value: String(s.id), label: s.nombre }))

  const countPorEstado = {
    total:       incidencias.length,
    abiertas:    incidencias.filter(i => i.estado === 'abierta').length,
    en_revision: incidencias.filter(i => i.estado === 'en_revision').length,
    resueltas:   incidencias.filter(i => i.estado === 'resuelta').length,
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2
                        text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg"
          style={{ background: 'var(--h-bg-highlight)' }}>
          <CheckCircle size={14} style={{ color: 'var(--h-teal-hover)' }} />
          {toast}
        </div>
      )}

      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-h-primary">Incidencias</h1>
          <p className="text-sm text-h-secondary mt-0.5">
            Registro de daños, piezas perdidas y mal funcionamiento en activos fijos
          </p>
          {labelTiempo && (
            <p className="text-xs text-h-tertiary mt-1">{labelTiempo}</p>
          )}
        </div>
        {puedeEscribir && (
          <button onClick={() => setModalInc(null)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl
                       text-white text-sm font-semibold transition-colors shadow-sm"
            style={{ background: 'var(--h-teal-rest)' }}
            onMouseEnter={e =>
              (e.currentTarget.style.background = 'var(--h-teal-hover)')}
            onMouseLeave={e =>
              (e.currentTarget.style.background = 'var(--h-teal-rest)')}
          >
            <Plus size={16} /> Registrar incidencia
          </button>
        )}
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total',       value: countPorEstado.total,       cls: 'text-h-primary' },
          { label: 'Abiertas',    value: countPorEstado.abiertas,    cls: 'text-rose-500' },
          { label: 'En revisión', value: countPorEstado.en_revision, cls: 'text-blue-500' },
          { label: 'Resueltas',   value: countPorEstado.resueltas,   cls: 'text-emerald-500' },
        ].map(c => (
          <div key={c.label}
            className="rounded-xl border border-h-subtle px-4 py-3"
            style={{ background: 'var(--h-bg-surface)' }}>
            <p className={`text-2xl font-bold ${c.cls}`}>{c.value}</p>
            <p className="text-xs text-h-tertiary mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Barra de filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2
                                       text-h-tertiary pointer-events-none" />
          <input
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border text-sm
                       bg-h-elevated border-h-subtle text-h-primary
                       focus:outline-none focus:border-h-visible
                       placeholder:text-h-tertiary transition-colors"
            placeholder="Buscar por equipo, descripción, responsable..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>
        <HSelect value={filtroTipo} onChange={setFiltroTipo}
          options={TIPO_OPTS} placeholder="Todos los tipos" size="sm" />
        <HSelect value={filtroSeveridad} onChange={setFiltroSeveridad}
          options={SEVERIDAD_OPTS} placeholder="Todas las severidades" size="sm" />
        <HSelect value={filtroEstado} onChange={setFiltroEstado}
          options={ESTADO_OPTS} placeholder="Todos los estados" size="sm" />
        <HSelect value={filtroSala} onChange={setFiltroSala}
          options={salaFiltroOpts} placeholder="Todas las salas" size="sm" />
        <button onClick={cargar}
          className="p-2 rounded-lg border border-h-subtle text-h-tertiary
                     transition-colors"
          style={{ background: 'var(--h-bg-elevated)' }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--h-bg-highlight)'
            e.currentTarget.style.color = 'var(--h-text-secondary)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'var(--h-bg-elevated)'
            e.currentTarget.style.color = ''
          }}
          title="Actualizar">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border border-h-subtle overflow-hidden"
        style={{ background: 'var(--h-bg-surface)' }}>
        {cargando ? (
          <div className="p-12 text-center text-h-secondary">
            <RefreshCw size={22} className="animate-spin mx-auto mb-3"
              style={{ color: 'var(--h-teal-hover)' }} />
            <p className="text-sm">Cargando incidencias...</p>
          </div>
        ) : incidencias.length === 0 ? (
          <div className="p-12 text-center">
            <AlertOctagon size={36} className="mx-auto mb-3 text-h-tertiary" />
            <p className="text-h-secondary font-medium text-sm">
              No se encontraron incidencias
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-h-subtle"
                  style={{ background: 'var(--h-bg-elevated)' }}>
                  {COLS.map(col => (
                    <th key={col}
                      className="text-left px-4 py-3 text-[10px] font-semibold
                                 text-h-tertiary uppercase tracking-widest">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {incidencias.map((inc, idx) => (
                  <tr key={inc.id}
                    className="border-b border-h-subtle transition-colors"
                    style={{
                      background: hoveredId === inc.id
                        ? 'var(--h-bg-highlight)'
                        : idx % 2 === 0
                          ? 'var(--h-bg-surface)'
                          : 'var(--h-bg-elevated)',
                    }}
                    onMouseEnter={() => setHoveredId(inc.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    {/* Equipo */}
                    <td className="px-4 py-3">
                      <p className="font-semibold text-h-primary text-sm">
                        {inc.activo_fijo_nombre ?? `#${inc.activo_fijo_id}`}
                      </p>
                      {inc.activo_fijo_codigo && (
                        <span className="font-mono text-xs text-h-tertiary">
                          {inc.activo_fijo_codigo}
                        </span>
                      )}
                    </td>
                    {/* Tipo */}
                    <td className="px-4 py-3">
                      <TipoBadge tipo={inc.tipo} />
                    </td>
                    {/* Descripción */}
                    <td className="px-4 py-3 max-w-[200px]">
                      <p className="text-h-secondary text-xs truncate" title={inc.descripcion}>
                        {inc.descripcion}
                      </p>
                      {inc.foto_b64 && (
                        <button
                          onClick={() => setFotoAmpliada(inc.foto_b64!)}
                          className="mt-1 text-xs flex items-center gap-1
                                     transition-colors"
                          style={{ color: 'var(--h-teal-hover)' }}
                        >
                          <Camera size={10} /> Ver foto
                        </button>
                      )}
                    </td>
                    {/* Sala */}
                    <td className="px-4 py-3 text-h-secondary text-sm">
                      {inc.sala_nombre ?? (
                        <span className="text-h-tertiary italic text-xs">Sin sala</span>
                      )}
                    </td>
                    {/* Fecha */}
                    <td className="px-4 py-3 text-h-secondary text-xs whitespace-nowrap">
                      {formatFecha(inc.fecha_hora)}
                    </td>
                    {/* Responsable */}
                    <td className="px-4 py-3 text-h-secondary text-sm">
                      {inc.responsable_nombre ?? (
                        <span className="text-h-tertiary italic text-xs">Sin asignar</span>
                      )}
                    </td>
                    {/* Severidad */}
                    <td className="px-4 py-3">
                      <SeveridadBadge severidad={inc.severidad} />
                    </td>
                    {/* Estado */}
                    <td className="px-4 py-3">
                      <EstadoBadge estado={inc.estado} />
                    </td>
                    {/* Acciones */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {puedeEscribir && (
                          <button onClick={() => setModalInc(inc)}
                            title="Editar"
                            className="p-1.5 rounded-lg text-h-tertiary transition-colors"
                            onMouseEnter={e => {
                              e.currentTarget.style.color = 'var(--h-teal-hover)'
                              e.currentTarget.style.background = 'var(--h-teal-subtle)'
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.color = ''
                              e.currentTarget.style.background = ''
                            }}
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        {esAdmin && (
                          <button onClick={() => handleEliminar(inc)}
                            title="Eliminar"
                            className="p-1.5 rounded-lg text-h-tertiary transition-colors"
                            onMouseEnter={e => {
                              e.currentTarget.style.color = 'var(--h-sem-danger-text)'
                              e.currentTarget.style.background = 'var(--h-sem-danger-bg)'
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.color = ''
                              e.currentTarget.style.background = ''
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalInc !== undefined && (
        <IncidenciaModal
          incidencia={modalInc} salas={salas}
          onClose={() => setModalInc(undefined)}
          onSaved={() => {
            setModalInc(undefined)
            mostrarToast(modalInc === null ? 'Incidencia registrada' : 'Incidencia actualizada')
            cargar()
          }}
        />
      )}

      {fotoAmpliada && (
        <FotoModal src={fotoAmpliada} onClose={() => setFotoAmpliada(null)} />
      )}
    </div>
  )
}

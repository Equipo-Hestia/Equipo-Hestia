import { useState, useEffect, useCallback } from 'react'
import {
  Sofa, Brain, Plus, Pencil, PowerOff,
  Search, RefreshCw, Building2, CheckCircle,
} from 'lucide-react'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'
import type {
  ActivoFijoResponse, ActivoFijoCreate, ActivoFijoUpdate,
  TipoActivo, EstadoActivo, FidelidadPhantoma,
  SalaResponse, ProveedorResponse, PaginatedResponse,
} from '../types/api'
import { HSelect } from '../components/ui/HSelect'
import { useLastUpdated } from '../hooks/useLastUpdated'

const ESTADO_CFG: Record<EstadoActivo, { label: string; cls: string }> = {
  disponible: {
    label: 'Disponible',
    cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  en_uso: {
    label: 'En uso',
    cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  },
  en_mantenimiento: {
    label: 'En mantenimiento',
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  },
  dado_de_baja: {
    label: 'Dado de baja',
    cls: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
  },
}

const FIDELIDAD_CFG: Record<FidelidadPhantoma, { label: string; cls: string }> = {
  baja: {
    label: 'Fidelidad baja',
    cls: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  },
  media: {
    label: 'Fidelidad media',
    cls: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
  },
  alta: {
    label: 'Fidelidad alta',
    cls: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  },
}

function EstadoBadge({ estado }: { estado: EstadoActivo }) {
  const cfg = ESTADO_CFG[estado]
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5
                      rounded-full text-xs font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function FidelidadBadge({ fidelidad }: { fidelidad: FidelidadPhantoma | null }) {
  if (!fidelidad) return null
  const cfg = FIDELIDAD_CFG[fidelidad]
  return (
    <span className={`inline-flex items-center px-2 py-0.5
                      rounded-full text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

const ESTADO_OPTS = [
  { value: 'disponible',       label: 'Disponible' },
  { value: 'en_uso',           label: 'En uso' },
  { value: 'en_mantenimiento', label: 'En mantenimiento' },
  { value: 'dado_de_baja',     label: 'Dado de baja' },
]

const FIDELIDAD_OPTS = [
  { value: 'baja',  label: 'Baja' },
  { value: 'media', label: 'Media' },
  { value: 'alta',  label: 'Alta' },
]

interface ModalProps {
  activo: ActivoFijoResponse | null
  salas: SalaResponse[]
  proveedores: ProveedorResponse[]
  onClose: () => void
  onSaved: () => void
}

function ActivoModal({ activo, salas, proveedores, onClose, onSaved }: ModalProps) {
  const esNuevo = activo === null
  const [nombre, setNombre]             = useState(activo?.nombre ?? '')
  const [descripcion, setDescripcion]   = useState(activo?.descripcion ?? '')
  const [tipo, setTipo]                 = useState<TipoActivo>(activo?.tipo ?? 'mueble')
  const [codigoBarras, setCodigoBarras] = useState(activo?.codigo_barras ?? '')
  const [estado, setEstado]             = useState<string>(activo?.estado ?? 'disponible')
  const [fidelidad, setFidelidad]       = useState<string>(activo?.fidelidad ?? '')
  const [salaId, setSalaId]             = useState<string>(activo?.sala_id?.toString() ?? '')
  const [proveedorId, setProveedorId]   = useState<string>(activo?.proveedor_id?.toString() ?? '')
  const [notas, setNotas]               = useState(activo?.notas ?? '')
  const [guardando, setGuardando]       = useState(false)
  const [error, setError]               = useState('')

  const salaOpts      = salas.map(s => ({ value: String(s.id), label: s.nombre }))
  const proveedorOpts = proveedores.map(p => ({ value: String(p.id), label: p.nombre }))

  async function handleGuardar() {
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return }
    setGuardando(true); setError('')
    try {
      if (esNuevo) {
        const body: ActivoFijoCreate = {
          nombre: nombre.trim(), descripcion: descripcion.trim() || null, tipo,
          codigo_barras: codigoBarras.trim() || null, estado: estado as EstadoActivo,
          fidelidad: (fidelidad as FidelidadPhantoma) || null,
          sala_id: salaId ? parseInt(salaId) : null,
          proveedor_id: proveedorId ? parseInt(proveedorId) : null,
          notas: notas.trim() || null,
        }
        await api.post('/activos-fijos/', body)
      } else {
        const body: ActivoFijoUpdate = {
          nombre: nombre.trim(), descripcion: descripcion.trim() || null,
          codigo_barras: codigoBarras.trim() || null, estado: estado as EstadoActivo,
          fidelidad: (fidelidad as FidelidadPhantoma) || null,
          sala_id: salaId ? parseInt(salaId) : null,
          proveedor_id: proveedorId ? parseInt(proveedorId) : null,
          notas: notas.trim() || null,
        }
        await api.put(`/activos-fijos/${activo!.id}`, body)
      }
      onSaved()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail
      setError(detail ?? 'Error al guardar')
    } finally { setGuardando(false) }
  }

  const labelCls = 'block text-[10px] font-semibold text-h-tertiary mb-1.5 uppercase tracking-widest'
  const inputCls = `w-full px-3 py-2.5 rounded-lg text-h-primary text-sm
    focus:outline-none transition-all bg-h-elevated border border-h-visible
    focus:border-h-strong placeholder:text-h-tertiary`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60
                    backdrop-blur-sm p-4">
      <div className="bg-h-surface border border-h-subtle rounded-2xl shadow-2xl
                      w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4
                        border-b border-h-subtle flex-shrink-0">
          <h2 className="text-base font-semibold text-h-primary">
            {esNuevo ? 'Registrar activo fijo' : 'Editar activo'}
          </h2>
          <button onClick={onClose}
            className="text-h-tertiary hover:text-h-secondary text-xl font-bold
                       transition-colors">x</button>
        </div>
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className={labelCls}>Nombre *</label>
            <input className={inputCls} value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Ej: Camilla articulada, SimMan 3G" />
          </div>
          {esNuevo && (
            <div>
              <label className={labelCls}>Tipo *</label>
              <div className="flex gap-3">
                {(['mueble', 'phantoma'] as TipoActivo[]).map(t => (
                  <button key={t} type="button" onClick={() => setTipo(t)}
                    className={[
                      'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl',
                      'border-2 text-sm font-semibold transition-all',
                      tipo === t
                        ? 'border-teal-500 text-white'
                        : 'border-h-subtle text-h-secondary hover:border-h-visible',
                    ].join(' ')}
                    style={tipo === t ? { background: 'var(--h-teal-rest)' } : {}}>
                    {t === 'mueble' ? <Sofa size={16} /> : <Brain size={16} />}
                    {t === 'mueble' ? 'Mueble' : 'Phantoma'}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className={labelCls}>Estado</label>
            <HSelect value={estado} onChange={setEstado} options={ESTADO_OPTS} className="w-full" />
          </div>
          {(tipo === 'phantoma' || activo?.tipo === 'phantoma') && (
            <div>
              <label className={labelCls}>Fidelidad del simulador</label>
              <HSelect value={fidelidad} onChange={setFidelidad}
                options={FIDELIDAD_OPTS} placeholder="Sin especificar" className="w-full" />
            </div>
          )}
          <div>
            <label className={labelCls}>Sala de origen</label>
            <HSelect value={salaId} onChange={setSalaId}
              options={salaOpts} placeholder="Sin asignar" className="w-full" />
          </div>
          <div>
            <label className={labelCls}>Proveedor</label>
            <HSelect value={proveedorId} onChange={setProveedorId}
              options={proveedorOpts} placeholder="Sin proveedor asignado" className="w-full" />
          </div>
          <div>
            <label className={labelCls}>Codigo de barras</label>
            <input className={inputCls} value={codigoBarras}
              onChange={e => setCodigoBarras(e.target.value)}
              placeholder="Escanear o ingresar manualmente" />
          </div>
          <div>
            <label className={labelCls}>Descripcion</label>
            <textarea className={`${inputCls} resize-none`} rows={2} value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Caracteristicas adicionales..." />
          </div>
          <div>
            <label className={labelCls}>Notas internas</label>
            <textarea className={`${inputCls} resize-none`} rows={2} value={notas}
              onChange={e => setNotas(e.target.value)}
              placeholder="Observaciones del operador..." />
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
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-h-subtle flex-shrink-0">
          <button onClick={onClose} disabled={guardando}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-h-secondary
                       hover:bg-h-elevated transition-colors">Cancelar</button>
          <button onClick={handleGuardar} disabled={guardando}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white
                       transition-colors disabled:opacity-50"
            style={{ background: 'var(--h-teal-rest)' }}
            onMouseEnter={e => !guardando &&
              (e.currentTarget.style.background = 'var(--h-teal-hover)')}
            onMouseLeave={e =>
              (e.currentTarget.style.background = 'var(--h-teal-rest)')}
          >
            {guardando ? 'Guardando...' : esNuevo ? 'Registrar' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

type FiltroTipo = 'todos' | TipoActivo
const ROLES_ESCRITURA = ['admin', 'operador_coordinador', 'operador']

const ESTADO_FILTRO_OPTS = [
  { value: 'disponible',       label: 'Disponible' },
  { value: 'en_uso',           label: 'En uso' },
  { value: 'en_mantenimiento', label: 'En mantenimiento' },
  { value: 'dado_de_baja',     label: 'Dado de baja' },
]

export function ActivosFijos() {
  const { user } = useAuthStore()
  const puedeEscribir = user?.rol ? ROLES_ESCRITURA.includes(user.rol) : false
  const esAdmin       = user?.rol === 'admin'

  const [activos, setActivos]         = useState<ActivoFijoResponse[]>([])
  const [todos, setTodos]             = useState<ActivoFijoResponse[]>([])
  const [salas, setSalas]             = useState<SalaResponse[]>([])
  const [proveedores, setProveedores] = useState<ProveedorResponse[]>([])
  const [cargando, setCargando]       = useState(true)
  const [filtroTipo, setFiltroTipo]   = useState<FiltroTipo>('todos')
  const [filtroEstado, setFiltroEstado] = useState<string>('')
  const [filtroSala, setFiltroSala]   = useState<string>('')
  const [busqueda, setBusqueda]       = useState('')
  const [modalActivo, setModalActivo] = useState<ActivoFijoResponse | null | undefined>(undefined)
  const [toast, setToast]             = useState('')
  const [hoveredId, setHoveredId]     = useState<number | null>(null)
  const { labelTiempo, marcarActualizado } = useLastUpdated()

  function mostrarToast(msg: string) {
    setToast(msg); setTimeout(() => setToast(''), 3000)
  }

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const params: Record<string, string> = {}
      if (filtroTipo !== 'todos') params.tipo = filtroTipo
      if (filtroEstado) params.estado = filtroEstado
      if (filtroSala)  params.sala_id = filtroSala
      if (busqueda.trim()) params.q = busqueda.trim()
      const res = await api.get<ActivoFijoResponse[]>('/activos-fijos/', { params })
      setActivos(res.data)
      marcarActualizado()
    } catch {
      mostrarToast('Error al cargar activos fijos')
    } finally { setCargando(false) }
  }, [filtroTipo, filtroEstado, filtroSala, busqueda, marcarActualizado])

  const cargarTodos = useCallback(async () => {
    try {
      const params: Record<string, string> = {}
      if (filtroEstado) params.estado = filtroEstado
      if (filtroSala)  params.sala_id = filtroSala
      if (busqueda.trim()) params.q = busqueda.trim()
      const res = await api.get<ActivoFijoResponse[]>('/activos-fijos/', { params })
      setTodos(res.data)
    } catch { /* silencioso */ }
  }, [filtroEstado, filtroSala, busqueda])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { cargarTodos() }, [cargarTodos])

  useEffect(() => {
    api.get<PaginatedResponse<SalaResponse>>('/salas/', { params: { limit: 100 } })
      .then(r => setSalas(r.data.data ?? [])).catch(() => {})
    api.get<PaginatedResponse<ProveedorResponse>>('/proveedores/', { params: { limit: 100 } })
      .then(r => setProveedores(r.data.data ?? [])).catch(() => {})
  }, [])

  async function handleDarDeBaja(af: ActivoFijoResponse) {
    if (!confirm(`Dar de baja a "${af.nombre}"?`)) return
    try {
      await api.put(`/activos-fijos/${af.id}`, { estado: 'dado_de_baja' })
      mostrarToast('Activo dado de baja'); cargar(); cargarTodos()
    } catch { mostrarToast('Error al dar de baja') }
  }

  const tabs: { key: FiltroTipo; label: string; icon: React.ReactNode }[] = [
    { key: 'todos',    label: 'Todos',     icon: null },
    { key: 'mueble',   label: 'Muebles',   icon: <Sofa size={14} /> },
    { key: 'phantoma', label: 'Phantomas', icon: <Brain size={14} /> },
  ]

  const conteos = {
    todos:    todos.length,
    mueble:   todos.filter(a => a.tipo === 'mueble').length,
    phantoma: todos.filter(a => a.tipo === 'phantoma').length,
  }

  const salaFiltroOpts = salas.map(s => ({ value: String(s.id), label: s.nombre }))
  const COLS = ['Codigo', 'Nombre', 'Proveedor', 'Tipo', 'Estado', 'Sala de origen', 'Fidelidad', 'Acciones']

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
          <h1 className="text-2xl font-bold text-h-primary">Activos Fijos</h1>
          <p className="text-sm text-h-secondary mt-0.5">
            Muebles clinicos y phantomas de simulacion
          </p>
          {labelTiempo && (
            <p className="text-xs text-h-tertiary mt-1">{labelTiempo}</p>
          )}
        </div>
        {puedeEscribir && (
          <button onClick={() => setModalActivo(null)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl
                       text-white text-sm font-semibold transition-colors shadow-sm"
            style={{ background: 'var(--h-teal-rest)' }}
            onMouseEnter={e =>
              (e.currentTarget.style.background = 'var(--h-teal-hover)')}
            onMouseLeave={e =>
              (e.currentTarget.style.background = 'var(--h-teal-rest)')}
          >
            <Plus size={16} /> Registrar activo
          </button>
        )}
      </div>

      {/* Tabs tipo */}
      <div className="flex gap-1 p-1 rounded-xl w-fit"
        style={{ background: 'var(--h-bg-elevated)' }}>
        {tabs.map(tab => {
          const isActive = filtroTipo === tab.key
          return (
            <button key={tab.key} onClick={() => setFiltroTipo(tab.key)}
              className={[
                'flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold',
                'transition-all duration-150',
                isActive ? 'text-h-primary shadow-sm' : 'text-h-tertiary hover:text-h-secondary',
              ].join(' ')}
              style={isActive ? { background: 'var(--h-bg-surface)' } : {}}>
              {tab.icon}
              {tab.label}
              <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full"
                style={{
                  background: isActive ? 'var(--h-teal-subtle)' : 'var(--h-bg-highlight)',
                  color: isActive ? 'var(--h-teal-hover)' : 'var(--h-text-tertiary)',
                }}>
                {conteos[tab.key]}
              </span>
            </button>
          )
        })}
      </div>

      {/* Barra de filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-h-tertiary
                                       pointer-events-none" />
          <input
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border text-sm
                       bg-h-elevated border-h-subtle text-h-primary
                       focus:outline-none focus:border-h-visible
                       placeholder:text-h-tertiary transition-colors"
            placeholder="Buscar por nombre o codigo..."
            value={busqueda} onChange={e => setBusqueda(e.target.value)}
          />
        </div>
        <HSelect value={filtroEstado} onChange={setFiltroEstado}
          options={ESTADO_FILTRO_OPTS} placeholder="Todos los estados" size="sm" />
        <HSelect value={filtroSala} onChange={setFiltroSala}
          options={salaFiltroOpts} placeholder="Todas las salas" size="sm" />
        <button onClick={() => { cargar(); cargarTodos() }}
          className="p-2 rounded-lg border border-h-subtle text-h-tertiary transition-colors"
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
            <p className="text-sm">Cargando activos...</p>
          </div>
        ) : activos.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-3xl mb-3">🏥</p>
            <p className="text-h-secondary font-medium text-sm">No se encontraron activos fijos</p>
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
                {activos.map((af, idx) => (
                  <tr key={af.id}
                    className="border-b border-h-subtle transition-colors"
                    style={{
                      background: hoveredId === af.id
                        ? 'var(--h-bg-highlight)'
                        : idx % 2 === 0
                          ? 'var(--h-bg-surface)'
                          : 'var(--h-bg-elevated)',
                    }}
                    onMouseEnter={() => setHoveredId(af.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md"
                        style={{
                          background: 'var(--h-bg-highlight)',
                          color: 'var(--h-text-primary)',
                          border: '1px solid var(--h-border-subtle)',
                        }}>
                        {af.codigo_interno ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-h-primary">{af.nombre}</p>
                      {af.descripcion && (
                        <p className="text-xs text-h-tertiary mt-0.5 truncate max-w-[200px]">
                          {af.descripcion}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {af.proveedor_nombre ? (
                        <span className="inline-flex items-center gap-1 text-xs
                                         font-semibold text-h-secondary">
                          <Building2 size={11} className="text-h-tertiary" />
                          {af.proveedor_nombre}
                        </span>
                      ) : (
                        <span className="text-xs italic text-h-tertiary">Sin proveedor</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={[
                        'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full',
                        af.tipo === 'mueble'
                          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                          : 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
                      ].join(' ')}>
                        {af.tipo === 'mueble'
                          ? <><Sofa size={11} /> Mueble</>
                          : <><Brain size={11} /> Phantoma</>}
                      </span>
                    </td>
                    <td className="px-4 py-3"><EstadoBadge estado={af.estado} /></td>
                    <td className="px-4 py-3 text-h-secondary text-sm">
                      {af.sala_nombre ?? (
                        <span className="text-h-tertiary italic text-xs">Sin asignar</span>
                      )}
                    </td>
                    <td className="px-4 py-3"><FidelidadBadge fidelidad={af.fidelidad} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {puedeEscribir && (
                          <button onClick={() => setModalActivo(af)} title="Editar"
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
                        {esAdmin && af.estado !== 'dado_de_baja' && (
                          <button onClick={() => handleDarDeBaja(af)} title="Dar de baja"
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
                            <PowerOff size={14} />
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

      {modalActivo !== undefined && (
        <ActivoModal
          activo={modalActivo} salas={salas} proveedores={proveedores}
          onClose={() => setModalActivo(undefined)}
          onSaved={() => {
            setModalActivo(undefined)
            mostrarToast('Activo guardado')
            cargar(); cargarTodos()
          }}
        />
      )}
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import {
  Sofa, Brain, Plus, Pencil, PowerOff,
  Search, RefreshCw, ChevronDown, Building2,
} from 'lucide-react'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'
import type {
  ActivoFijoResponse, ActivoFijoCreate, ActivoFijoUpdate,
  TipoActivo, EstadoActivo, FidelidadPhantoma,
  SalaResponse, ProveedorResponse, PaginatedResponse,
} from '../types/api'

const ESTADO_CFG: Record<EstadoActivo, { label: string; cls: string }> = {
  disponible: { label: 'Disponible',
    cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  en_uso: { label: 'En uso',
    cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  en_mantenimiento: { label: 'En mantenimiento',
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  dado_de_baja: { label: 'Dado de baja',
    cls: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300' },
}

const FIDELIDAD_CFG: Record<FidelidadPhantoma, { label: string; cls: string }> = {
  baja: { label: 'Fidelidad baja',
    cls: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300' },
  media: { label: 'Fidelidad media',
    cls: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300' },
  alta: { label: 'Fidelidad alta',
    cls: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' },
}

function EstadoBadge({ estado }: { estado: EstadoActivo }) {
  const cfg = ESTADO_CFG[estado]
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function FidelidadBadge({ fidelidad }: { fidelidad: FidelidadPhantoma | null }) {
  if (!fidelidad) return null
  const cfg = FIDELIDAD_CFG[fidelidad]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

interface ModalProps {
  activo: ActivoFijoResponse | null
  salas: SalaResponse[]
  proveedores: ProveedorResponse[]
  onClose: () => void
  onSaved: () => void
}

function ActivoModal({ activo, salas, proveedores, onClose, onSaved }: ModalProps) {
  const esNuevo = activo === null
  const [nombre, setNombre] = useState(activo?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(activo?.descripcion ?? '')
  const [tipo, setTipo] = useState<TipoActivo>(activo?.tipo ?? 'mueble')
  const [codigoBarras, setCodigoBarras] = useState(activo?.codigo_barras ?? '')
  const [estado, setEstado] = useState<EstadoActivo>(activo?.estado ?? 'disponible')
  const [fidelidad, setFidelidad] = useState<FidelidadPhantoma | ''>(activo?.fidelidad ?? '')
  const [salaId, setSalaId] = useState<string>(activo?.sala_id?.toString() ?? '')
  const [proveedorId, setProveedorId] = useState<string>(activo?.proveedor_id?.toString() ?? '')
  const [notas, setNotas] = useState(activo?.notas ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function handleGuardar() {
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return }
    setGuardando(true); setError('')
    try {
      if (esNuevo) {
        const body: ActivoFijoCreate = {
          nombre: nombre.trim(),
          descripcion: descripcion.trim() || null,
          tipo,
          codigo_barras: codigoBarras.trim() || null,
          estado,
          fidelidad: fidelidad || null,
          sala_id: salaId ? parseInt(salaId) : null,
          proveedor_id: proveedorId ? parseInt(proveedorId) : null,
          notas: notas.trim() || null,
        }
        await api.post('/activos-fijos/', body)
      } else {
        const body: ActivoFijoUpdate = {
          nombre: nombre.trim(),
          descripcion: descripcion.trim() || null,
          codigo_barras: codigoBarras.trim() || null,
          estado,
          fidelidad: fidelidad || null,
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

  const labelCls = 'block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1'
  const inputCls = [
    'w-full px-3 py-2 rounded-lg border text-sm',
    'bg-white dark:bg-slate-700',
    'border-slate-300 dark:border-slate-600',
    'text-slate-900 dark:text-slate-50',
    'focus:outline-none focus:ring-2 focus:ring-teal-500',
  ].join(' ')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
            {esNuevo ? 'Registrar activo fijo' : 'Editar activo fijo'}
          </h2>
          <button onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl font-bold">×</button>
        </div>
        <div className="px-6 py-5 space-y-4">
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
                  <button key={t} onClick={() => setTipo(t)}
                    className={[
                      'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl',
                      'border-2 text-sm font-semibold transition-all',
                      tipo === t
                        ? 'border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'
                        : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400',
                    ].join(' ')}>
                    {t === 'mueble' ? <Sofa size={16} /> : <Brain size={16} />}
                    {t === 'mueble' ? 'Mueble' : 'Phantoma'}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className={labelCls}>Estado</label>
            <div className="relative">
              <select className={inputCls + ' appearance-none pr-9'}
                value={estado} onChange={e => setEstado(e.target.value as EstadoActivo)}>
                <option value="disponible">Disponible</option>
                <option value="en_uso">En uso</option>
                <option value="en_mantenimiento">En mantenimiento</option>
                <option value="dado_de_baja">Dado de baja</option>
              </select>
              <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
          {(tipo === 'phantoma' || activo?.tipo === 'phantoma') && (
            <div>
              <label className={labelCls}>Fidelidad del simulador</label>
              <div className="relative">
                <select className={inputCls + ' appearance-none pr-9'}
                  value={fidelidad}
                  onChange={e => setFidelidad(e.target.value as FidelidadPhantoma | '')}>
                  <option value="">Sin especificar</option>
                  <option value="baja">Baja</option>
                  <option value="media">Media</option>
                  <option value="alta">Alta</option>
                </select>
                <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
          )}
          <div>
            <label className={labelCls}>Sala de origen</label>
            <div className="relative">
              <select className={inputCls + ' appearance-none pr-9'}
                value={salaId} onChange={e => setSalaId(e.target.value)}>
                <option value="">Sin asignar</option>
                {salas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
              <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Proveedor (empresa vendedora / mantenimiento)</label>
            <div className="relative">
              <select className={inputCls + ' appearance-none pr-9'}
                value={proveedorId} onChange={e => setProveedorId(e.target.value)}>
                <option value="">Sin proveedor asignado</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Código de barras</label>
            <input className={inputCls} value={codigoBarras}
              onChange={e => setCodigoBarras(e.target.value)}
              placeholder="Escanear o ingresar manualmente" />
          </div>
          <div>
            <label className={labelCls}>Descripción</label>
            <textarea className={inputCls} rows={2} value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Características adicionales..." />
          </div>
          <div>
            <label className={labelCls}>Notas internas</label>
            <textarea className={inputCls} rows={2} value={notas}
              onChange={e => setNotas(e.target.value)}
              placeholder="Observaciones del operador..." />
          </div>
          {error && <p className="text-sm text-rose-600 dark:text-rose-400 font-medium">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700">
          <button onClick={onClose} disabled={guardando}
            className="px-4 py-2 rounded-lg text-sm font-semibold
                       text-slate-600 dark:text-slate-400
                       hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">Cancelar</button>
          <button onClick={handleGuardar} disabled={guardando}
            className="px-5 py-2 rounded-lg text-sm font-semibold
                       bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50 transition-colors">
            {guardando ? 'Guardando…' : esNuevo ? 'Registrar' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

type FiltroTipo = 'todos' | TipoActivo
const ROLES_ESCRITURA = ['admin', 'operador_coordinador', 'operador']

export function ActivosFijos() {
  const { user } = useAuthStore()
  const puedeEscribir = user?.rol ? ROLES_ESCRITURA.includes(user.rol) : false
  const esAdmin = user?.rol === 'admin'

  const [activos, setActivos] = useState<ActivoFijoResponse[]>([])
  const [salas, setSalas] = useState<SalaResponse[]>([])
  const [proveedores, setProveedores] = useState<ProveedorResponse[]>([])
  const [cargando, setCargando] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('todos')
  const [filtroEstado, setFiltroEstado] = useState<EstadoActivo | ''>('')
  const [filtroSala, setFiltroSala] = useState<string>('')
  const [busqueda, setBusqueda] = useState('')
  const [modalActivo, setModalActivo] = useState<ActivoFijoResponse | null | undefined>(undefined)
  const [toast, setToast] = useState('')

  function mostrarToast(msg: string) {
    setToast(msg); setTimeout(() => setToast(''), 3000)
  }

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const params: Record<string, string> = {}
      if (filtroTipo !== 'todos') params.tipo = filtroTipo
      if (filtroEstado) params.estado = filtroEstado
      if (filtroSala) params.sala_id = filtroSala
      if (busqueda.trim()) params.q = busqueda.trim()
      const res = await api.get<ActivoFijoResponse[]>('/activos-fijos/', { params })
      setActivos(res.data)
    } catch {
      mostrarToast('Error al cargar activos fijos')
    } finally { setCargando(false) }
  }, [filtroTipo, filtroEstado, filtroSala, busqueda])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    // /salas/ devuelve PaginatedResponse — extraer .data
    api.get<PaginatedResponse<SalaResponse>>('/salas/', { params: { limit: 100 } })
      .then(r => setSalas(r.data.data ?? []))
      .catch(() => {})
    api.get<PaginatedResponse<ProveedorResponse>>('/proveedores/', { params: { limit: 100 } })
      .then(r => setProveedores(r.data.data ?? []))
      .catch(() => {})
  }, [])

  async function handleDarDeBaja(af: ActivoFijoResponse) {
    if (!confirm(`¿Dar de baja a "${af.nombre}"? Esta acción se puede revertir.`)) return
    try {
      await api.put(`/activos-fijos/${af.id}`, { estado: 'dado_de_baja' })
      mostrarToast('Activo dado de baja'); cargar()
    } catch { mostrarToast('Error al dar de baja') }
  }

  const tabs: { key: FiltroTipo; label: string; icon: React.ReactNode }[] = [
    { key: 'todos', label: 'Todos', icon: null },
    { key: 'mueble', label: 'Muebles', icon: <Sofa size={15} /> },
    { key: 'phantoma', label: 'Phantomas', icon: <Brain size={15} /> },
  ]

  const conteos = {
    todos: activos.length,
    mueble: activos.filter(a => a.tipo === 'mueble').length,
    phantoma: activos.filter(a => a.tipo === 'phantoma').length,
  }

  const inputCls = [
    'px-3 py-2 rounded-lg border text-sm',
    'bg-white dark:bg-slate-700',
    'border-slate-300 dark:border-slate-600',
    'text-slate-900 dark:text-slate-50',
    'focus:outline-none focus:ring-2 focus:ring-teal-500',
  ].join(' ')

  const COLS = ['Código', 'Nombre', 'Proveedor', 'Tipo', 'Estado', 'Sala de origen', 'Fidelidad', 'Acciones']

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Activos Fijos</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Muebles clínicos y phantomas de simulación
          </p>
        </div>
        {puedeEscribir && (
          <button onClick={() => setModalActivo(null)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl
                       bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold
                       transition-colors shadow-sm">
            <Plus size={16} /> Registrar activo
          </button>
        )}
      </div>

      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setFiltroTipo(tab.key)}
            className={[
              'flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all',
              filtroTipo === tab.key
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300',
            ].join(' ')}>
            {tab.icon}
            {tab.label}
            <span className={[
              'ml-1 text-xs px-1.5 py-0.5 rounded-full',
              filtroTipo === tab.key
                ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300'
                : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
            ].join(' ')}>
              {conteos[tab.key]}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input className={inputCls + ' pl-9 w-full'}
            placeholder="Buscar por nombre o código…"
            value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>
        <div className="relative">
          <select className={inputCls + ' appearance-none pr-8'}
            value={filtroEstado}
            onChange={e => setFiltroEstado(e.target.value as EstadoActivo | '')}>
            <option value="">Todos los estados</option>
            <option value="disponible">Disponible</option>
            <option value="en_uso">En uso</option>
            <option value="en_mantenimiento">En mantenimiento</option>
            <option value="dado_de_baja">Dado de baja</option>
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select className={inputCls + ' appearance-none pr-8'}
            value={filtroSala} onChange={e => setFiltroSala(e.target.value)}>
            <option value="">Todas las salas</option>
            {salas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        <button onClick={cargar}
          className="p-2.5 rounded-lg border border-slate-300 dark:border-slate-600
                     text-slate-500 dark:text-slate-400 hover:bg-slate-100
                     dark:hover:bg-slate-700 transition-colors" title="Actualizar">
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm
                      border border-slate-200 dark:border-slate-700 overflow-hidden">
        {cargando ? (
          <div className="p-12 text-center text-slate-400 dark:text-slate-500">
            <RefreshCw size={24} className="animate-spin mx-auto mb-3" />
            Cargando activos…
          </div>
        ) : activos.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">🏥</div>
            <p className="text-slate-500 dark:text-slate-400 font-medium">
              No se encontraron activos fijos
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700
                               bg-slate-50 dark:bg-slate-900/50">
                  {COLS.map(col => (
                    <th key={col} className="text-left px-4 py-3 text-xs font-semibold
                                            text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {activos.map(af => (
                  <tr key={af.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold
                                       text-slate-600 dark:text-slate-300
                                       bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                        {af.codigo_interno ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900 dark:text-slate-50">{af.nombre}</p>
                      {af.descripcion && (
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate max-w-[200px]">
                          {af.descripcion}
                        </p>
                      )}
                    </td>
                    {/* Columna Proveedor — entre Nombre y Tipo */}
                    <td className="px-4 py-3">
                      {af.proveedor_nombre ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold
                                         text-slate-600 dark:text-slate-300">
                          <Building2 size={11} className="text-slate-400" />
                          {af.proveedor_nombre}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600 text-xs italic">
                          Sin proveedor
                        </span>
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
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {af.sala_nombre ?? (
                        <span className="text-slate-400 dark:text-slate-500 italic">Sin asignar</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <FidelidadBadge fidelidad={af.fidelidad} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {puedeEscribir && (
                          <button onClick={() => setModalActivo(af)} title="Editar"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600
                                       hover:bg-teal-50 dark:hover:bg-teal-900/30 transition-colors">
                            <Pencil size={14} />
                          </button>
                        )}
                        {esAdmin && af.estado !== 'dado_de_baja' && (
                          <button onClick={() => handleDarDeBaja(af)} title="Dar de baja"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600
                                       hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors">
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
          activo={modalActivo}
          salas={salas}
          proveedores={proveedores}
          onClose={() => setModalActivo(undefined)}
          onSaved={() => {
            setModalActivo(undefined); mostrarToast('Activo guardado'); cargar()
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 dark:bg-slate-700
                        text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}

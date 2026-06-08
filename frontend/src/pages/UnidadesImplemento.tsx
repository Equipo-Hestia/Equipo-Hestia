import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Package, Plus, Pencil, PowerOff, RefreshCw,
  ChevronLeft, CheckCircle, MapPin, AlertTriangle,
  Layers, Info,
} from 'lucide-react'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'
import type {
  UnidadImplementoResponse, UnidadImplementoCreate,
  UnidadImplementoUpdate, EstadoUnidad, InsumoResponse,
  SalaResponse, PaginatedResponse,
  GenerarLoteRequest, GenerarLoteResponse,
} from '../types/api'

// ---------------------------------------------------------------------------
// Configuracion de estados
// ---------------------------------------------------------------------------

const ESTADO_CFG: Record<EstadoUnidad, { label: string; cls: string }> = {
  disponible: {
    label: 'Disponible',
    cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  en_uso: {
    label: 'En uso',
    cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  },
  dado_de_baja: {
    label: 'Dado de baja',
    cls: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
  },
}

const ROLES_ESCRITURA = ['admin', 'operador_coordinador', 'operador']

// ---------------------------------------------------------------------------
// Modal crear unidad
// ---------------------------------------------------------------------------

interface ModalCrearProps {
  implementoId: number
  onClose: () => void
  onSaved: () => void
}

function ModalCrear({ implementoId, onClose, onSaved }: ModalCrearProps) {
  const [notas, setNotas]         = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError]         = useState('')

  async function handleGuardar() {
    setGuardando(true)
    setError('')
    try {
      const body: UnidadImplementoCreate = {
        implemento_id: implementoId,
        sala_id: null,
        notas: notas.trim() || null,
      }
      await api.post('/unidades-implemento/', body)
      onSaved()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail
      setError(detail ?? 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60
                    backdrop-blur-sm p-4">
      <div className="bg-h-surface border border-h-subtle rounded-2xl shadow-2xl
                      w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4
                        border-b border-h-subtle">
          <h2 className="text-base font-semibold text-h-primary">Registrar nueva unidad</h2>
          <button onClick={onClose}
            className="text-h-tertiary hover:text-h-secondary text-xl font-bold
                       transition-colors">x</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-h-subtle
                          bg-h-elevated px-4 py-3">
            <Info size={15} className="mt-0.5 flex-shrink-0"
              style={{ color: 'var(--h-teal-hover)' }} />
            <p className="text-xs text-h-secondary leading-relaxed">
              La unidad se registra en <strong className="text-h-primary">Bodega</strong>.
              Su ubicacion cambia automaticamente cuando sea retirada
              para un taller.
            </p>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-h-tertiary
                              mb-1.5 uppercase tracking-widest">
              Notas (opcional)
            </label>
            <textarea
              className="w-full px-3 py-2.5 rounded-lg text-h-primary text-sm
                         focus:outline-none placeholder:text-h-tertiary transition-all
                         bg-h-elevated border border-h-visible focus:border-h-strong
                         resize-none"
              rows={2}
              value={notas}
              onChange={e => setNotas(e.target.value)}
              placeholder="Ej: rayada, falta goma de sellado..."
            />
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

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-h-subtle">
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
            {guardando ? 'Registrando...' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal editar unidad
// ---------------------------------------------------------------------------

interface ModalEditarProps {
  unidad: UnidadImplementoResponse
  salas: SalaResponse[]
  esAdmin: boolean
  onClose: () => void
  onSaved: () => void
}

function ModalEditar({ unidad, salas, esAdmin, onClose, onSaved }: ModalEditarProps) {
  const [estado, setEstado]       = useState<EstadoUnidad>(unidad.estado)
  const [salaId, setSalaId]       = useState<string>(
    unidad.sala_id != null ? String(unidad.sala_id) : ''
  )
  const [notas, setNotas]         = useState(unidad.notas ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError]         = useState('')

  async function handleGuardar() {
    setGuardando(true)
    setError('')
    try {
      const body: UnidadImplementoUpdate = {
        estado,
        notas: notas.trim() || null,
      }
      if (esAdmin) {
        body.sala_id = salaId ? parseInt(salaId) : null
      }
      await api.put(`/unidades-implemento/${unidad.id}`, body)
      onSaved()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail
      setError(detail ?? 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60
                    backdrop-blur-sm p-4">
      <div className="bg-h-surface border border-h-subtle rounded-2xl shadow-2xl
                      w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4
                        border-b border-h-subtle">
          <div>
            <h2 className="text-base font-semibold text-h-primary">Editar unidad</h2>
            <p className="text-xs text-h-tertiary mt-0.5 font-mono">{unidad.codigo}</p>
          </div>
          <button onClick={onClose}
            className="text-h-tertiary hover:text-h-secondary text-xl font-bold
                       transition-colors">x</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <p className="text-[10px] font-semibold text-h-tertiary mb-2
                          uppercase tracking-widest">Estado</p>
            <div className="flex gap-2 flex-wrap">
              {(['disponible', 'en_uso', 'dado_de_baja'] as EstadoUnidad[]).map(e => (
                <button key={e} onClick={() => setEstado(e)}
                  className={[
                    'px-3 py-1.5 rounded-full text-xs font-semibold transition-all border-2',
                    estado === e
                      ? 'border-teal-500 text-white'
                      : 'border-h-subtle text-h-tertiary hover:border-h-visible',
                  ].join(' ')}
                  style={estado === e ? { background: 'var(--h-teal-rest)' } : {}}>
                  {ESTADO_CFG[e].label}
                </button>
              ))}
            </div>
          </div>

          {esAdmin && (
            <div>
              <label className="block text-[10px] font-semibold text-h-tertiary
                                mb-1.5 uppercase tracking-widest">
                <span className="flex items-center gap-1.5">
                  <MapPin size={11} />
                  Ubicacion fisica
                  <span className="ml-1 px-1.5 py-0.5 rounded text-[9px]
                                   bg-amber-100 text-amber-700
                                   dark:bg-amber-900/40 dark:text-amber-300
                                   font-bold uppercase tracking-wide">
                    Solo admin
                  </span>
                </span>
              </label>
              <select
                value={salaId}
                onChange={e => setSalaId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-h-primary text-sm
                           focus:outline-none transition-all cursor-pointer
                           bg-h-elevated border border-h-visible focus:border-h-strong"
              >
                <option value="">Bodega (sin asignar a sala)</option>
                {salas.map(s => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
              <p className="text-[10px] text-h-tertiary mt-1.5 leading-relaxed">
                La ubicacion normalmente la gestiona el flujo de retiro.
                Modifica solo si hay un error de registro.
              </p>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-semibold text-h-tertiary
                              mb-1.5 uppercase tracking-widest">Notas</label>
            <textarea
              className="w-full px-3 py-2.5 rounded-lg text-h-primary text-sm
                         focus:outline-none placeholder:text-h-tertiary transition-all
                         bg-h-elevated border border-h-visible focus:border-h-strong
                         resize-none"
              rows={2}
              value={notas}
              onChange={e => setNotas(e.target.value)}
              placeholder="Ej: rayada, falta goma de sellado..."
            />
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

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-h-subtle">
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
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal generar lote
// ---------------------------------------------------------------------------

interface ModalGenerarLoteProps {
  implementoId: number
  faltantes: number
  onClose: () => void
  onSaved: (creadas: number) => void
}

function ModalGenerarLote(
  { implementoId, faltantes, onClose, onSaved }: ModalGenerarLoteProps,
) {
  const [cantidad, setCantidad]   = useState(faltantes)
  const [generando, setGenerando] = useState(false)
  const [error, setError]         = useState('')

  async function handleGenerar() {
    if (cantidad < 1) return
    setGenerando(true)
    setError('')
    try {
      const body: GenerarLoteRequest = { implemento_id: implementoId, cantidad }
      const res = await api.post<GenerarLoteResponse>(
        '/unidades-implemento/generar-lote', body,
      )
      onSaved(res.data.creadas)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail
      setError(detail ?? 'Error al generar unidades')
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60
                    backdrop-blur-sm p-4">
      <div className="bg-h-surface border border-h-subtle rounded-2xl shadow-2xl
                      w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4
                        border-b border-h-subtle">
          <h2 className="text-base font-semibold text-h-primary">
            Generar unidades en lote
          </h2>
          <button onClick={onClose}
            className="text-h-tertiary hover:text-h-secondary text-xl font-bold
                       transition-colors">x</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-h-secondary leading-relaxed">
            Se crearan <strong className="text-h-primary">{cantidad}</strong> unidades
            nuevas en <strong className="text-h-primary">Bodega</strong>, cada una
            con su subcodigo unico generado automaticamente.
          </p>

          <div>
            <label className="block text-[10px] font-semibold text-h-tertiary
                              mb-1.5 uppercase tracking-widest">
              Cantidad a generar
            </label>
            <input
              type="number"
              min={1}
              max={500}
              value={cantidad}
              onChange={e => setCantidad(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-2.5 rounded-lg text-h-primary text-sm
                         focus:outline-none transition-all
                         bg-h-elevated border border-h-visible focus:border-h-strong"
            />
            <p className="text-[10px] text-h-tertiary mt-1">Maximo 500 por operacion.</p>
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

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-h-subtle">
          <button onClick={onClose} disabled={generando}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-h-secondary
                       hover:bg-h-elevated transition-colors">
            Cancelar
          </button>
          <button onClick={handleGenerar} disabled={generando || cantidad < 1}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white
                       transition-colors disabled:opacity-50"
            style={{ background: 'var(--h-teal-rest)' }}
            onMouseEnter={e => !(generando || cantidad < 1) &&
              (e.currentTarget.style.background = 'var(--h-teal-hover)')}
            onMouseLeave={e =>
              (e.currentTarget.style.background = 'var(--h-teal-rest)')}
          >
            {generando ? 'Generando...' : `Generar ${cantidad}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tipo de modal activo
// ---------------------------------------------------------------------------

type ModalState =
  | { tipo: 'crear' }
  | { tipo: 'editar'; unidad: UnidadImplementoResponse }
  | { tipo: 'lote'; faltantes: number }
  | null

// ---------------------------------------------------------------------------
// Pagina principal
// ---------------------------------------------------------------------------

export function UnidadesImplemento() {
  const { user } = useAuthStore()
  const puedeEscribir = user?.rol ? ROLES_ESCRITURA.includes(user.rol) : false
  const esAdmin       = user?.rol === 'admin'

  const { implemento_id } = useParams<{ implemento_id: string }>()
  const implementoId = parseInt(implemento_id ?? '0')

  const [implemento, setImplemento] = useState<InsumoResponse | null>(null)
  const [unidades, setUnidades]     = useState<UnidadImplementoResponse[]>([])
  const [salas, setSalas]           = useState<SalaResponse[]>([])
  const [cargando, setCargando]     = useState(true)
  const [modal, setModal]           = useState<ModalState>(null)
  const [toast, setToast]           = useState('')
  const [filtroSala, setFiltroSala] = useState<string>('')

  function mostrarToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  useEffect(() => {
    if (!implementoId) return
    Promise.all([
      api.get<InsumoResponse>(`/insumos/${implementoId}`),
      api.get<PaginatedResponse<SalaResponse>>('/salas/', { params: { limit: 100 } }),
    ]).then(([insumoRes, salasRes]) => {
      setImplemento(insumoRes.data)
      setSalas(salasRes.data.data)
    }).catch(() => {})
  }, [implementoId])

  const cargar = useCallback(async () => {
    if (!implementoId) return
    setCargando(true)
    try {
      const params: Record<string, string | number> = { implemento_id: implementoId }
      if (filtroSala) params.sala_id = parseInt(filtroSala)
      const res = await api.get<UnidadImplementoResponse[]>(
        '/unidades-implemento/', { params },
      )
      setUnidades(res.data)
    } catch {
      mostrarToast('Error al cargar unidades')
    } finally {
      setCargando(false)
    }
  }, [implementoId, filtroSala])

  useEffect(() => { cargar() }, [cargar])

  async function handleDarDeBaja(u: UnidadImplementoResponse) {
    if (!confirm(`Dar de baja a ${u.codigo ?? 'esta unidad'}?`)) return
    try {
      await api.put(`/unidades-implemento/${u.id}`, { estado: 'dado_de_baja' })
      mostrarToast('Unidad dada de baja')
      cargar()
    } catch {
      mostrarToast('Error al dar de baja')
    }
  }

  // ---------------------------------------------------------------------------
  // Conteos
  //
  // Las unidades "dado_de_baja" se excluyen del stock operativo.
  // No cuentan ni para la comparacion con el stock contable ni para el
  // subtotal de "en salas / en bodega".
  // ---------------------------------------------------------------------------
  const totalBaja       = unidades.filter(u => u.estado === 'dado_de_baja').length
  const totalDisp       = unidades.filter(u => u.estado === 'disponible').length
  const totalEnUso      = unidades.filter(u => u.estado === 'en_uso').length
  // Operativas = disponibles + en uso (excluye dado_de_baja)
  const totalOperativas = totalDisp + totalEnUso
  const totalEnSalas    = unidades.filter(
    u => u.sala_id != null && u.estado !== 'dado_de_baja',
  ).length
  const totalEnBodega   = unidades.filter(
    u => u.sala_id == null && u.estado !== 'dado_de_baja',
  ).length

  // Diferencia entre stock contable y unidades fisicas operativas.
  // diferencia > 0 => faltan unidades fisicas (generar lote)
  // diferencia < 0 => sobran unidades fisicas (dar de baja las sobrantes)
  const stockContable       = implemento?.stock_actual ?? 0
  const unidadesRegistradas = totalOperativas
  const diferencia          = stockContable - unidadesRegistradas

  if (!implementoId) {
    return (
      <div className="p-6 text-center text-h-secondary">
        No se especifico un implemento. Accede desde la pagina de Insumos.
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2
                        text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg"
          style={{ background: 'var(--h-bg-highlight)' }}>
          <CheckCircle size={14} style={{ color: 'var(--h-teal-hover)' }} />
          {toast}
        </div>
      )}

      {/* Encabezado */}
      <div>
        <Link to="/insumos"
          className="flex items-center gap-1.5 text-sm transition-colors mb-3"
          style={{ color: 'var(--h-text-secondary)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--h-teal-hover)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--h-text-secondary)')}
        >
          <ChevronLeft size={15} /> Volver a Insumos e Implementos
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <Package size={20} style={{ color: 'var(--h-teal-hover)' }} />
              <h1 className="text-2xl font-bold text-h-primary">
                {implemento?.nombre ?? 'Cargando...'}
              </h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{
                  background: 'rgba(139,92,246,0.15)',
                  color: '#a78bfa',
                  border: '1px solid rgba(139,92,246,0.3)',
                }}>
                Implemento
              </span>
            </div>
            <p className="text-sm text-h-secondary">
              Unidades fisicas individuales &mdash;{' '}
              <strong className="text-h-primary">{totalEnSalas}</strong> en salas,{' '}
              <strong className="text-h-primary">{totalEnBodega}</strong> en bodega
            </p>
          </div>

          {puedeEscribir && (
            <button onClick={() => setModal({ tipo: 'crear' })}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl
                         text-white text-sm font-semibold
                         transition-colors shadow-sm flex-shrink-0"
              style={{ background: 'var(--h-teal-rest)' }}
              onMouseEnter={e =>
                (e.currentTarget.style.background = 'var(--h-teal-hover)')}
              onMouseLeave={e =>
                (e.currentTarget.style.background = 'var(--h-teal-rest)')}
            >
              <Plus size={15} /> Registrar unidad
            </button>
          )}
        </div>
      </div>

      {/* Banner: faltan unidades fisicas */}
      {!cargando && diferencia > 0 && puedeEscribir && (
        <div className="flex items-start justify-between gap-4 rounded-xl
                        border px-4 py-3"
          style={{
            background: 'var(--h-sem-warning-bg)',
            borderColor: 'var(--h-sem-warning-border)',
          }}>
          <div className="flex items-start gap-3">
            <Layers size={16} className="mt-0.5 flex-shrink-0"
              style={{ color: 'var(--h-sem-warning-text)' }} />
            <div>
              <p className="text-sm font-semibold"
                style={{ color: 'var(--h-sem-warning-text)' }}>
                {diferencia}{' '}
                {diferencia === 1 ? 'unidad sin subcodigo' : 'unidades sin subcodigo'}
              </p>
              <p className="text-xs mt-0.5"
                style={{ color: 'var(--h-sem-warning-text)', opacity: 0.85 }}>
                El stock indica {stockContable} unidades pero solo hay
                {' '}{unidadesRegistradas} operativas con subcodigo asignado.
              </p>
            </div>
          </div>
          <button
            onClick={() => setModal({ tipo: 'lote', faltantes: diferencia })}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold
                       text-white transition-colors"
            style={{ background: 'var(--h-teal-rest)' }}
            onMouseEnter={e =>
              (e.currentTarget.style.background = 'var(--h-teal-hover)')}
            onMouseLeave={e =>
              (e.currentTarget.style.background = 'var(--h-teal-rest)')}
          >
            Generar {diferencia}
          </button>
        </div>
      )}

      {/* Banner: sobran unidades fisicas */}
      {!cargando && diferencia < 0 && (
        <div className="flex items-start gap-3 rounded-xl border px-4 py-3"
          style={{
            background: 'var(--h-sem-danger-bg)',
            borderColor: 'var(--h-sem-danger-border)',
          }}>
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0"
            style={{ color: 'var(--h-sem-danger-text)' }} />
          <div>
            <p className="text-sm font-semibold"
              style={{ color: 'var(--h-sem-danger-text)' }}>
              Incongruencia de stock detectada
            </p>
            <p className="text-xs mt-0.5"
              style={{ color: 'var(--h-sem-danger-text)', opacity: 0.85 }}>
              Hay {unidadesRegistradas} unidades fisicas operativas pero el stock
              indica solo {stockContable}. Revisa si alguna debe darse de baja.
            </p>
          </div>
        </div>
      )}

      {/* Tarjetas de resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Operativas',  value: totalOperativas, color: 'var(--h-text-primary)' },
          { label: 'Disponibles', value: totalDisp,       color: '#34d399' },
          { label: 'En uso',      value: totalEnUso,      color: '#60a5fa' },
          { label: 'Baja',        value: totalBaja,       color: '#f87171' },
        ].map(stat => (
          <div key={stat.label}
            className="rounded-xl border border-h-subtle p-4 text-center"
            style={{ background: 'var(--h-bg-surface)' }}>
            <p className="text-2xl font-black mb-0.5"
              style={{ color: stat.color }}>{stat.value}</p>
            <p className="text-xs text-h-tertiary font-semibold">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Filtro de sala */}
      <div className="flex items-center gap-3">
        <MapPin size={14} className="text-h-tertiary" />
        <select
          value={filtroSala}
          onChange={e => setFiltroSala(e.target.value)}
          className="px-3 py-1.5 rounded-lg border text-sm cursor-pointer
                     bg-h-elevated border-h-visible text-h-primary
                     focus:outline-none focus:border-h-strong transition-colors"
        >
          <option value="">Todas las ubicaciones</option>
          <option value="0">Solo Bodega</option>
          {salas.map(s => (
            <option key={s.id} value={s.id}>{s.nombre}</option>
          ))}
        </select>
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border border-h-subtle overflow-hidden"
        style={{ background: 'var(--h-bg-surface)' }}>
        {cargando ? (
          <div className="p-12 text-center text-h-secondary">
            <RefreshCw size={22} className="animate-spin mx-auto mb-3"
              style={{ color: 'var(--h-teal-hover)' }} />
            <p className="text-sm">Cargando unidades...</p>
          </div>
        ) : unidades.length === 0 ? (
          <div className="p-12 text-center">
            <Package size={32} className="mx-auto mb-3 text-h-tertiary" />
            <p className="text-h-secondary font-medium text-sm">
              No hay unidades para esta seleccion
            </p>
            {puedeEscribir && (
              <p className="text-h-tertiary text-xs mt-1">
                Usa "Registrar unidad" para agregar la primera.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-h-subtle"
                  style={{ background: 'var(--h-bg-elevated)' }}>
                  {['Subcodigo', 'Ubicacion', 'Estado', 'Notas', 'Acciones'].map(col => (
                    <th key={col}
                      className="text-left px-4 py-3 text-[10px] font-semibold
                                 text-h-tertiary uppercase tracking-widest">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {unidades.map((u, idx) => (
                  <tr key={u.id}
                    className="border-b border-h-subtle transition-colors"
                    style={{
                      background: idx % 2 === 0
                        ? 'var(--h-bg-surface)'
                        : 'var(--h-bg-elevated)',
                    }}
                    onMouseEnter={e =>
                      (e.currentTarget.style.background = 'var(--h-bg-highlight)')}
                    onMouseLeave={e =>
                      (e.currentTarget.style.background = idx % 2 === 0
                        ? 'var(--h-bg-surface)'
                        : 'var(--h-bg-elevated)')}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm font-bold px-2.5 py-1 rounded-lg"
                        style={{
                          background: 'var(--h-bg-highlight)',
                          color: 'var(--h-text-primary)',
                          border: '1px solid var(--h-border-subtle)',
                        }}>
                        {u.codigo ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.sala_nombre ? (
                        <span className="flex items-center gap-1.5 text-sm"
                          style={{ color: 'var(--h-teal-hover)' }}>
                          <MapPin size={11} />
                          {u.sala_nombre}
                        </span>
                      ) : (
                        <span className="text-xs font-semibold px-2 py-0.5
                                         rounded-full text-h-tertiary"
                          style={{ background: 'var(--h-bg-highlight)' }}>
                          Bodega
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5
                                        rounded-full text-xs font-semibold
                                        ${ESTADO_CFG[u.estado].cls}`}>
                        {ESTADO_CFG[u.estado].label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-h-secondary max-w-xs truncate text-xs">
                      {u.notas ?? <span className="text-h-tertiary">&mdash;</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {puedeEscribir && (
                          <button
                            onClick={() => setModal({ tipo: 'editar', unidad: u })}
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
                        {esAdmin && u.estado !== 'dado_de_baja' && (
                          <button
                            onClick={() => handleDarDeBaja(u)}
                            title="Dar de baja"
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

      {/* Modales */}
      {modal?.tipo === 'crear' && (
        <ModalCrear
          implementoId={implementoId}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            mostrarToast('Unidad registrada en Bodega')
            cargar()
          }}
        />
      )}
      {modal?.tipo === 'editar' && (
        <ModalEditar
          unidad={modal.unidad}
          salas={salas}
          esAdmin={esAdmin}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            mostrarToast('Unidad actualizada')
            cargar()
          }}
        />
      )}
      {modal?.tipo === 'lote' && (
        <ModalGenerarLote
          implementoId={implementoId}
          faltantes={modal.faltantes}
          onClose={() => setModal(null)}
          onSaved={creadas => {
            setModal(null)
            mostrarToast(`${creadas} unidades generadas en Bodega`)
            cargar()
          }}
        />
      )}
    </div>
  )
}

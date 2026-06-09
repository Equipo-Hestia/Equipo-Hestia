import { useEffect, useState, useCallback } from 'react'
import {
  Package, ChevronDown, ChevronUp, Lock, Unlock, CheckCircle,
  BookOpen, FlaskConical, RefreshCw
} from 'lucide-react'
import { api } from '../api/client'
import type {
  PaqueteResponse, TallerResponse, AsignaturaResponse, CarreraAsignatura
} from '../types/api'
import { Badge } from '../components/ui/Badge'
import { TableRowSkeleton } from '../components/ui/Skeleton'
import { HSelect } from '../components/ui/HSelect'
import { useLastUpdated } from '../hooks/useLastUpdated'

const CARRERAS: { value: CarreraAsignatura; label: string }[] = [
  { value: 'TENS',              label: 'T\u00e9cnico en Enfermer\u00eda' },
  { value: 'TQF',               label: 'T\u00e9c. Qu\u00edmica y Farmacia' },
  { value: 'TLCBS',             label: 'T\u00e9c. Lab. Cl\u00ednico y Banco de Sangre' },
  { value: 'TONS',              label: 'T\u00e9cnico en Odontolog\u00eda' },
  { value: 'preparador_fisico', label: 'Preparador F\u00edsico' },
]

type BadgeVariant = 'info' | 'warning' | 'success' | 'danger' | 'purple' | 'default'

const CARRERA_VARIANT: Record<CarreraAsignatura, BadgeVariant> = {
  TENS: 'info',
  TQF: 'warning',
  TLCBS: 'success',
  TONS: 'danger',
  preparador_fisico: 'purple',
}

function carreraLabel(c: CarreraAsignatura | null): string {
  if (!c) return '\u2014'
  return CARRERAS.find(x => x.value === c)?.label ?? c
}

function formatCLP(n: number | null | undefined): string {
  if (n == null) return '\u2014'
  return new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
  }).format(n)
}

export function Paquetes() {
  const [paquetes, setPaquetes]       = useState<PaqueteResponse[]>([])
  const [talleres, setTalleres]       = useState<TallerResponse[]>([])
  const [asignaturas, setAsignaturas] = useState<AsignaturaResponse[]>([])
  const [loading, setLoading]         = useState(true)
  const [toast, setToast]             = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)
  const [rowHover, setRowHover]       = useState<number | null>(null)

  const [filtroCarrera, setFiltroCarrera]       = useState<string>('')
  const [filtroAsignatura, setFiltroAsignatura] = useState<string>('')
  const [filtroTaller, setFiltroTaller]         = useState<string>('')
  const [filtroSemestre, setFiltroSemestre]     = useState<string>('')
  const [expandido, setExpandido]               = useState<number | null>(null)

  const { labelTiempo, marcarActualizado } = useLastUpdated()

  function showToast(msg: string, tipo: 'ok' | 'err' = 'ok') {
    setToast({ msg, tipo })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    Promise.all([
      api.get<AsignaturaResponse[]>('/asignaturas/'),
      api.get<TallerResponse[]>('/talleres/'),
    ]).then(([asigRes, tallRes]) => {
      setAsignaturas(asigRes.data)
      setTalleres(tallRes.data)
    }).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = {}
      if (filtroTaller)   params.taller_id = parseInt(filtroTaller)
      if (filtroSemestre) params.semestre   = filtroSemestre
      const { data } = await api.get<PaqueteResponse[]>('/paquetes/', { params })
      setPaquetes(data)
      marcarActualizado()
    } finally { setLoading(false) }
  }, [filtroTaller, filtroSemestre, marcarActualizado])

  useEffect(() => { load() }, [load])

  const talleresFiltrados = filtroAsignatura
    ? talleres.filter(t => String(t.asignatura_id) === filtroAsignatura)
    : talleres

  const asignaturasFiltradas = filtroCarrera
    ? asignaturas.filter(a => a.carrera === filtroCarrera)
    : asignaturas

  const paquetesFiltrados = paquetes.filter(p => {
    const taller = talleres.find(t => t.id === p.taller_id)
    if (filtroAsignatura && String(taller?.asignatura_id) !== filtroAsignatura) return false
    if (filtroCarrera) {
      const asig = asignaturas.find(a => a.id === taller?.asignatura_id)
      if (asig?.carrera !== filtroCarrera) return false
    }
    return true
  })

  const semestresDisponibles = [...new Set(paquetes.map(p => p.semestre))].sort().reverse()

  async function toggleBloqueo(p: PaqueteResponse) {
    try {
      await api.put(`/paquetes/${p.id}`, { bloqueado: !p.bloqueado })
      showToast(
        p.bloqueado ? 'Paquete desbloqueado correctamente' : 'Paquete bloqueado correctamente'
      )
      load()
    } catch {
      showToast('Error al cambiar el estado del paquete', 'err')
    }
  }

  function insumoTipoBadge(tipo: string) {
    return tipo === 'implemento'
      ? <Badge variant="info">Implemento</Badge>
      : <Badge variant="default">Insumo</Badge>
  }

  const carreraOpts = CARRERAS.map(c => ({ value: c.value, label: c.label }))
  const asignaturaOpts = asignaturasFiltradas.map(a => ({ value: String(a.id), label: a.nombre }))
  const tallerOpts = talleresFiltrados.map(t => ({ value: String(t.id), label: t.nombre }))
  const semestreOpts = semestresDisponibles.map(s => ({ value: s, label: s }))

  return (
    <div className="p-8 w-full">

      {/* Toast */}
      {toast && (
        <div
          className={`
            fixed top-6 right-6 z-50 flex items-center gap-2
            px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white
            ${toast.tipo === 'ok' ? 'bg-teal-600' : 'bg-rose-600'}
          `}
        >
          <CheckCircle size={16} />{toast.msg}
        </div>
      )}

      {/* Encabezado */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-h-primary flex items-center gap-2">
            <FlaskConical size={22} className="text-h-accent" />
            Paquetes de insumos
          </h1>
          <p className="text-h-secondary text-sm mt-0.5">
            {loading ? '...' : `${paquetesFiltrados.length} paquetes`}
          </p>
          <p className="text-xs text-h-tertiary mt-1">{labelTiempo}</p>
        </div>
        <button
          onClick={load}
          title="Actualizar"
          className="p-2 rounded-lg border border-h-subtle bg-h-elevated
                     text-h-tertiary transition-colors duration-150"
          onMouseEnter={e =>
            (e.currentTarget.style.background = 'var(--h-bg-highlight)')
          }
          onMouseLeave={e =>
            (e.currentTarget.style.background = 'var(--h-bg-elevated)')
          }
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Filtros */}
      <div
        className="
          bg-h-surface rounded-xl border border-h-subtle
          p-4 mb-5 flex flex-wrap items-center gap-3
        "
      >
        <HSelect
          value={filtroCarrera}
          onChange={v => {
            setFiltroCarrera(v)
            setFiltroAsignatura('')
            setFiltroTaller('')
          }}
          options={carreraOpts}
          placeholder="Todas las carreras"
          size="sm"
        />
        <HSelect
          value={filtroAsignatura}
          onChange={v => { setFiltroAsignatura(v); setFiltroTaller('') }}
          options={asignaturaOpts}
          placeholder="Todas las asignaturas"
          size="sm"
        />
        <HSelect
          value={filtroTaller}
          onChange={v => setFiltroTaller(v)}
          options={tallerOpts}
          placeholder="Todos los talleres"
          size="sm"
        />
        <HSelect
          value={filtroSemestre}
          onChange={v => setFiltroSemestre(v)}
          options={semestreOpts}
          placeholder="Todos los semestres"
          size="sm"
        />
      </div>

      {/* Tabla principal */}
      <div className="bg-h-surface rounded-xl border border-h-subtle overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-h-subtle bg-h-elevated">
                <th className="w-8 px-3 py-3"></th>
                {[
                  { label: 'Taller',    align: 'left'   },
                  { label: 'Asignatura', align: 'left'  },
                  { label: 'Carrera',   align: 'left'   },
                  { label: 'Semestre',  align: 'center' },
                  { label: '\u00cdtems', align: 'center' },
                  { label: 'Estado',    align: 'center' },
                  { label: 'Acciones',  align: 'center' },
                ].map(({ label, align }) => (
                  <th
                    key={label}
                    className={`
                      px-4 py-3 text-xs font-bold text-h-tertiary
                      uppercase tracking-wide
                      ${align === 'left' ? 'text-left' : 'text-center'}
                    `}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRowSkeleton key={i} cols={8} />
                ))
              ) : paquetesFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16">
                    <Package size={32} className="mx-auto mb-2 text-h-tertiary opacity-40" />
                    <p className="font-semibold text-h-secondary">Sin paquetes que mostrar</p>
                    <p className="text-xs mt-1 text-h-tertiary">
                      Crea talleres y asigna paquetes de insumos para verlos aqu\u00ed.
                    </p>
                  </td>
                </tr>
              ) : paquetesFiltrados.map(p => {
                const taller = talleres.find(t => t.id === p.taller_id)
                const asig   = asignaturas.find(a => a.id === taller?.asignatura_id)
                const estaExpandido = expandido === p.id
                const esHover = rowHover === p.id

                const costoTotal = p.items.reduce((acc, item) => {
                  if (item.insumo_costo_unitario == null) return acc
                  return acc + Number(item.insumo_costo_unitario) * item.cantidad_requerida
                }, 0)
                const tieneCostos = p.items.some(i => i.insumo_costo_unitario != null)

                return (
                  <>
                    <tr
                      key={p.id}
                      style={{
                        background: esHover
                          ? 'var(--h-bg-highlight)'
                          : 'transparent',
                      }}
                      className="border-b border-h-subtle transition-colors cursor-pointer"
                      onMouseEnter={() => setRowHover(p.id)}
                      onMouseLeave={() => setRowHover(null)}
                      onClick={() => setExpandido(estaExpandido ? null : p.id)}
                    >
                      <td className="px-3 py-3.5 text-h-tertiary">
                        {estaExpandido
                          ? <ChevronUp size={14} />
                          : <ChevronDown size={14} />}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-h-primary">
                          {p.taller_nombre}
                        </div>
                        {p.notas && (
                          <div className="text-xs text-h-tertiary mt-0.5 max-w-xs truncate">
                            {p.notas}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 max-w-[220px]">
                        {asig ? (
                          <span className="flex items-start gap-1.5 text-h-secondary text-sm">
                            <BookOpen
                              size={12}
                              className="text-h-tertiary mt-0.5 flex-shrink-0"
                            />
                            <span className="leading-tight">{asig.nombre}</span>
                          </span>
                        ) : (
                          <span className="text-h-tertiary">\u2014</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {asig?.carrera ? (
                          <Badge variant={CARRERA_VARIANT[asig.carrera]}>
                            {carreraLabel(asig.carrera)}
                          </Badge>
                        ) : (
                          <span className="text-h-tertiary">\u2014</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span
                          className="
                            font-mono text-xs text-h-secondary
                            bg-h-elevated border border-h-subtle
                            px-2 py-0.5 rounded-full whitespace-nowrap
                          "
                        >
                          {p.semestre}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="font-semibold text-h-primary">
                          {p.items.length}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {p.bloqueado
                          ? <Badge variant="warning">Bloqueado</Badge>
                          : <Badge variant="success">Editable</Badge>}
                      </td>
                      <td
                        className="px-4 py-3.5 text-center"
                        onClick={e => e.stopPropagation()}
                      >
                        <button
                          onClick={() => toggleBloqueo(p)}
                          title={p.bloqueado ? 'Desbloquear paquete' : 'Bloquear paquete'}
                          className="p-2 rounded-lg text-h-tertiary transition-colors duration-150"
                          onMouseEnter={e => {
                            e.currentTarget.style.background = p.bloqueado
                              ? 'var(--h-sem-success-bg)'
                              : 'var(--h-sem-warning-bg)'
                            e.currentTarget.style.color = p.bloqueado
                              ? 'var(--h-sem-success-text)'
                              : 'var(--h-sem-warning-text)'
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = 'transparent'
                            e.currentTarget.style.color = 'var(--h-text-tertiary)'
                          }}
                        >
                          {p.bloqueado ? <Unlock size={15} /> : <Lock size={15} />}
                        </button>
                      </td>
                    </tr>

                    {/* Detalle expandido */}
                    {estaExpandido && (
                      <tr key={`${p.id}-items`}>
                        <td
                          colSpan={8}
                          className="
                            bg-h-elevated border-b border-h-subtle
                            px-8 py-5
                          "
                        >
                          {p.items.length === 0 ? (
                            <p className="text-h-tertiary text-sm italic">
                              Este paquete no tiene \u00edtems a\u00fan.
                            </p>
                          ) : (
                            <>
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-xs font-bold text-h-tertiary uppercase tracking-wide">
                                    <th className="text-left py-1.5 pr-4">Insumo o implemento</th>
                                    <th className="text-center py-1.5 pr-4">Tipo</th>
                                    <th className="text-center py-1.5 pr-4">Cantidad requerida</th>
                                    <th className="text-right py-1.5 pr-4">Costo unitario</th>
                                    <th className="text-right py-1.5 pr-4">Subtotal</th>
                                    <th className="text-left py-1.5">Notas</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y border-h-subtle">
                                  {p.items.map(item => {
                                    const subtotal =
                                      item.insumo_costo_unitario != null
                                        ? Number(item.insumo_costo_unitario)
                                          * item.cantidad_requerida
                                        : null
                                    return (
                                      <tr
                                        key={item.id}
                                        className="transition-colors"
                                        style={{ borderColor: 'var(--h-border-subtle)' }}
                                      >
                                        <td className="py-2.5 pr-4 font-semibold text-h-primary">
                                          {item.insumo_nombre}
                                        </td>
                                        <td className="py-2.5 pr-4 text-center">
                                          {insumoTipoBadge(item.insumo_tipo)}
                                        </td>
                                        <td className="py-2.5 pr-4 text-center">
                                          <span className="font-bold text-h-primary">
                                            {item.cantidad_requerida}
                                          </span>
                                          {item.insumo_unidad_medida && (
                                            <span className="ml-1.5 text-xs text-h-tertiary font-normal">
                                              {item.insumo_unidad_medida}
                                            </span>
                                          )}
                                        </td>
                                        <td className="py-2.5 pr-4 text-right text-h-secondary tabular-nums">
                                          {formatCLP(
                                            item.insumo_costo_unitario != null
                                              ? Number(item.insumo_costo_unitario)
                                              : null
                                          )}
                                        </td>
                                        <td className="py-2.5 pr-4 text-right font-semibold text-h-primary tabular-nums">
                                          {formatCLP(subtotal)}
                                        </td>
                                        <td className="py-2.5 text-h-secondary">
                                          {item.notas ?? '\u2014'}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>

                              {/* Pie: costo total + autor */}
                              <div
                                className="
                                  mt-4 pt-3 border-t border-h-subtle
                                  flex items-center justify-between gap-4
                                "
                              >
                                <p className="text-xs text-h-tertiary">
                                  {p.creado_por_nombre
                                    ? `Creado por ${p.creado_por_nombre}`
                                    : ''}
                                </p>
                                {tieneCostos && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-h-tertiary uppercase tracking-wide">
                                      Costo estimado del paquete
                                    </span>
                                    <span
                                      className="text-base font-black tabular-nums"
                                      style={{ color: 'var(--h-teal-hover)' }}
                                    >
                                      {formatCLP(costoTotal)}
                                    </span>
                                    <span className="text-xs text-h-tertiary">
                                      (solo \u00edtems con costo registrado)
                                    </span>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

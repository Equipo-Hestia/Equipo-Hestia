import { useEffect, useState, useCallback } from 'react'
import {
  Package, ChevronDown, ChevronUp, Lock, Unlock, CheckCircle,
  BookOpen, FlaskConical
} from 'lucide-react'
import { api } from '../api/client'
import type {
  PaqueteResponse, TallerResponse, AsignaturaResponse, CarreraAsignatura
} from '../types/api'
import { Badge } from '../components/ui/Badge'
import { TableRowSkeleton } from '../components/ui/Skeleton'

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

  const [filtroCarrera, setFiltroCarrera]       = useState<string>('')
  const [filtroAsignatura, setFiltroAsignatura] = useState<string>('')
  const [filtroTaller, setFiltroTaller]         = useState<string>('')
  const [filtroSemestre, setFiltroSemestre]     = useState<string>('')
  const [expandido, setExpandido]               = useState<number | null>(null)

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
    } finally { setLoading(false) }
  }, [filtroTaller, filtroSemestre])

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

  const selectCls = `
    px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-sm
    text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700
    focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer
  `

  return (
    <div className="p-8 max-w-6xl mx-auto">

      {/* Toast de feedback */}
      {toast && (
        <div className={`
          fixed top-6 right-6 z-50 flex items-center gap-2
          px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white
          ${ toast.tipo === 'ok' ? 'bg-teal-600' : 'bg-rose-600' }
        `}>
          <CheckCircle size={16} />{toast.msg}
        </div>
      )}

      {/* Encabezado */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-50
                         flex items-center gap-2">
            <FlaskConical size={22} className="text-teal-600" />
            Paquetes de insumos
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
            {loading ? '...' : `${paquetesFiltrados.length} paquetes`}
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="
        bg-white dark:bg-slate-800 rounded-xl
        border border-slate-200 dark:border-slate-700
        shadow-sm p-4 mb-5 flex flex-wrap items-center gap-3
      ">
        <select value={filtroCarrera}
          onChange={e => {
            setFiltroCarrera(e.target.value)
            setFiltroAsignatura('')
            setFiltroTaller('')
          }}
          className={selectCls}>
          <option value="">Todas las carreras</option>
          {CARRERAS.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>

        <select value={filtroAsignatura}
          onChange={e => { setFiltroAsignatura(e.target.value); setFiltroTaller('') }}
          className={selectCls}>
          <option value="">Todas las asignaturas</option>
          {asignaturasFiltradas.map(a => (
            <option key={a.id} value={a.id}>{a.nombre}</option>
          ))}
        </select>

        <select value={filtroTaller}
          onChange={e => setFiltroTaller(e.target.value)}
          className={selectCls}>
          <option value="">Todos los talleres</option>
          {talleresFiltrados.map(t => (
            <option key={t.id} value={t.id}>{t.nombre}</option>
          ))}
        </select>

        <select value={filtroSemestre}
          onChange={e => setFiltroSemestre(e.target.value)}
          className={selectCls}>
          <option value="">Todos los semestres</option>
          {semestresDisponibles.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Tabla principal */}
      <div className="
        bg-white dark:bg-slate-800 rounded-xl
        border border-slate-200 dark:border-slate-700
        shadow-sm overflow-hidden
      ">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="
                border-b border-slate-200 dark:border-slate-700
                bg-slate-50 dark:bg-slate-900/40
              ">
                <th className="w-8 px-3 py-3"></th>
                <th className="text-left px-4 py-3 text-xs font-bold
                               text-slate-500 dark:text-slate-400
                               uppercase tracking-wide">Taller</th>
                <th className="text-left px-4 py-3 text-xs font-bold
                               text-slate-500 dark:text-slate-400
                               uppercase tracking-wide">Asignatura</th>
                <th className="text-left px-4 py-3 text-xs font-bold
                               text-slate-500 dark:text-slate-400
                               uppercase tracking-wide min-w-[160px]">Carrera</th>
                <th className="text-center px-4 py-3 text-xs font-bold
                               text-slate-500 dark:text-slate-400
                               uppercase tracking-wide whitespace-nowrap">Semestre</th>
                <th className="text-center px-4 py-3 text-xs font-bold
                               text-slate-500 dark:text-slate-400
                               uppercase tracking-wide">\u00cdtems</th>
                <th className="text-center px-4 py-3 text-xs font-bold
                               text-slate-500 dark:text-slate-400
                               uppercase tracking-wide">Estado</th>
                <th className="text-center px-4 py-3 text-xs font-bold
                               text-slate-500 dark:text-slate-400
                               uppercase tracking-wide w-24">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRowSkeleton key={i} cols={8} />
                ))
              ) : paquetesFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={8}
                    className="text-center py-16 text-slate-400 dark:text-slate-500">
                    <Package size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="font-semibold">Sin paquetes que mostrar</p>
                    <p className="text-xs mt-1">
                      Crea talleres y asigna paquetes de insumos para verlos aqu\u00ed.
                    </p>
                  </td>
                </tr>
              ) : paquetesFiltrados.map(p => {
                const taller = talleres.find(t => t.id === p.taller_id)
                const asig = asignaturas.find(a => a.id === taller?.asignatura_id)
                const estaExpandido = expandido === p.id

                // Costo total del paquete (solo items con costo registrado)
                const costoTotal = p.items.reduce((acc, item) => {
                  if (item.insumo_costo_unitario == null) return acc
                  return acc + Number(item.insumo_costo_unitario) * item.cantidad_requerida
                }, 0)
                const tieneCostos = p.items.some(i => i.insumo_costo_unitario != null)

                return (
                  <>
                    {/* Fila principal del paquete */}
                    <tr
                      key={p.id}
                      className="
                        hover:bg-slate-50 dark:hover:bg-slate-700/50
                        transition-colors cursor-pointer
                      "
                      onClick={() => setExpandido(estaExpandido ? null : p.id)}
                    >
                      <td className="px-3 py-3.5
                                     text-slate-400 dark:text-slate-500">
                        {estaExpandido
                          ? <ChevronUp size={14} />
                          : <ChevronDown size={14} />}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-semibold
                                        text-slate-900 dark:text-slate-100">
                          {p.taller_nombre}
                        </div>
                        {p.notas && (
                          <div className="text-xs text-slate-400 dark:text-slate-500
                                          mt-0.5 max-w-xs truncate">
                            {p.notas}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 max-w-[220px]">
                        {asig ? (
                          <span className="flex items-start gap-1.5
                                           text-slate-600 dark:text-slate-300 text-sm">
                            <BookOpen size={12}
                              className="text-slate-400 dark:text-slate-500
                                         mt-0.5 flex-shrink-0" />
                            <span className="leading-tight">{asig.nombre}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">\u2014</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {asig?.carrera ? (
                          <Badge variant={CARRERA_VARIANT[asig.carrera]}>
                            {carreraLabel(asig.carrera)}
                          </Badge>
                        ) : (
                          <span className="text-slate-400">\u2014</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="font-mono text-xs
                                         text-slate-600 dark:text-slate-300
                                         bg-slate-100 dark:bg-slate-700
                                         px-2 py-0.5 rounded-full whitespace-nowrap">
                          {p.semestre}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="font-semibold
                                         text-slate-700 dark:text-slate-200">
                          {p.items.length}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {p.bloqueado
                          ? <Badge variant="warning">Bloqueado</Badge>
                          : <Badge variant="success">Editable</Badge>}
                      </td>
                      <td className="px-4 py-3.5 text-center"
                          onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => toggleBloqueo(p)}
                          title={p.bloqueado ? 'Desbloquear paquete' : 'Bloquear paquete'}
                          className={`
                            p-2 rounded-lg transition-colors
                            ${ p.bloqueado
                              ? `text-slate-400 hover:bg-emerald-50
                                 dark:hover:bg-emerald-900/30
                                 hover:text-emerald-600 dark:hover:text-emerald-400`
                              : `text-slate-400 hover:bg-amber-50
                                 dark:hover:bg-amber-900/30
                                 hover:text-amber-600 dark:hover:text-amber-400`
                            }
                          `}
                        >
                          {p.bloqueado ? <Unlock size={15} /> : <Lock size={15} />}
                        </button>
                      </td>
                    </tr>

                    {/* Detalle expandido */}
                    {estaExpandido && (
                      <tr key={`${p.id}-items`}>
                        <td colSpan={8}
                          className="
                            bg-slate-50 dark:bg-slate-900/30
                            border-b border-slate-200 dark:border-slate-700
                            px-8 py-5
                          ">
                          {p.items.length === 0 ? (
                            <p className="text-slate-400 dark:text-slate-500
                                          text-sm italic">
                              Este paquete no tiene \u00edtems a\u00fan.
                            </p>
                          ) : (
                            <>
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-xs font-bold
                                                 text-slate-400 dark:text-slate-500
                                                 uppercase tracking-wide">
                                    <th className="text-left py-1.5 pr-4">
                                      Insumo o implemento
                                    </th>
                                    <th className="text-center py-1.5 pr-4">Tipo</th>
                                    <th className="text-center py-1.5 pr-4">
                                      Cantidad requerida
                                    </th>
                                    <th className="text-right py-1.5 pr-4">
                                      Costo unitario
                                    </th>
                                    <th className="text-right py-1.5 pr-4">
                                      Subtotal
                                    </th>
                                    <th className="text-left py-1.5">Notas</th>
                                  </tr>
                                </thead>
                                <tbody className="
                                  divide-y divide-slate-200 dark:divide-slate-700
                                ">
                                  {p.items.map(item => {
                                    const subtotal =
                                      item.insumo_costo_unitario != null
                                        ? Number(item.insumo_costo_unitario)
                                          * item.cantidad_requerida
                                        : null
                                    return (
                                      <tr key={item.id}
                                        className="
                                          hover:bg-white
                                          dark:hover:bg-slate-800/60
                                          transition-colors
                                        ">
                                        <td className="py-2.5 pr-4 font-semibold
                                                       text-slate-800
                                                       dark:text-slate-200">
                                          {item.insumo_nombre}
                                        </td>
                                        <td className="py-2.5 pr-4 text-center">
                                          {insumoTipoBadge(item.insumo_tipo)}
                                        </td>
                                        <td className="py-2.5 pr-4 text-center">
                                          <span className="font-bold
                                                           text-slate-700
                                                           dark:text-slate-200">
                                            {item.cantidad_requerida}
                                          </span>
                                          {item.insumo_unidad_medida && (
                                            <span className="ml-1.5 text-xs
                                                             text-slate-400
                                                             dark:text-slate-500
                                                             font-normal">
                                              {item.insumo_unidad_medida}
                                            </span>
                                          )}
                                        </td>
                                        <td className="py-2.5 pr-4 text-right
                                                       text-slate-500
                                                       dark:text-slate-400
                                                       tabular-nums">
                                          {formatCLP(
                                            item.insumo_costo_unitario != null
                                              ? Number(item.insumo_costo_unitario)
                                              : null
                                          )}
                                        </td>
                                        <td className="py-2.5 pr-4 text-right
                                                       font-semibold
                                                       text-slate-700
                                                       dark:text-slate-200
                                                       tabular-nums">
                                          {formatCLP(subtotal)}
                                        </td>
                                        <td className="py-2.5
                                                       text-slate-500
                                                       dark:text-slate-400">
                                          {item.notas ?? '\u2014'}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>

                              {/* Pie: costo total + autor */}
                              <div className="
                                mt-4 pt-3
                                border-t border-slate-200 dark:border-slate-700
                                flex items-center justify-between gap-4
                              ">
                                <p className="text-xs
                                               text-slate-400 dark:text-slate-500">
                                  {p.creado_por_nombre
                                    ? `Creado por ${p.creado_por_nombre}`
                                    : ''}
                                </p>
                                {tieneCostos && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold
                                                     text-slate-500 dark:text-slate-400
                                                     uppercase tracking-wide">
                                      Costo estimado del paquete
                                    </span>
                                    <span className="text-base font-black
                                                     text-teal-600 dark:text-teal-400
                                                     tabular-nums">
                                      {formatCLP(costoTotal)}
                                    </span>
                                    <span className="text-xs
                                                     text-slate-400 dark:text-slate-500">
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

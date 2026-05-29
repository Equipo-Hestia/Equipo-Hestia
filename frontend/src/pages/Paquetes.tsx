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
  { value: 'TENS', label: 'Técnico en Enfermería' },
  { value: 'TQF', label: 'Técnico en Química y Farmacia' },
  { value: 'TLCBS', label: 'Téc. Laboratorio Clínico y Banco de Sangre' },
  { value: 'TONS', label: 'Técnico en Odontología' },
  { value: 'preparador_fisico', label: 'Preparador Físico' },
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
  if (!c) return '—'
  return CARRERAS.find(x => x.value === c)?.label ?? c
}

export function Paquetes() {
  const [paquetes, setPaquetes]       = useState<PaqueteResponse[]>([])
  const [talleres, setTalleres]       = useState<TallerResponse[]>([])
  const [asignaturas, setAsignaturas] = useState<AsignaturaResponse[]>([])
  const [loading, setLoading]         = useState(true)
  const [toast, setToast]             = useState<string | null>(null)

  // Filtros
  const [filtroCarrera, setFiltroCarrera]       = useState<string>('')
  const [filtroAsignatura, setFiltroAsignatura] = useState<string>('')
  const [filtroTaller, setFiltroTaller]         = useState<string>('')
  const [filtroSemestre, setFiltroSemestre]     = useState<string>('')

  // Paquete expandido
  const [expandido, setExpandido] = useState<number | null>(null)

  function showToast(msg: string) {
    setToast(msg); setTimeout(() => setToast(null), 3000)
  }

  // Cargar catAlogos una vez
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
      if (filtroTaller) params.taller_id = parseInt(filtroTaller)
      if (filtroSemestre) params.semestre = filtroSemestre
      const { data } = await api.get<PaqueteResponse[]>('/paquetes/', { params })
      setPaquetes(data)
    } finally { setLoading(false) }
  }, [filtroTaller, filtroSemestre])

  useEffect(() => { load() }, [load])

  // Talleres filtrados por asignatura seleccionada
  const talleresFiltrados = filtroAsignatura
    ? talleres.filter(t => String(t.asignatura_id) === filtroAsignatura)
    : talleres

  // Asignaturas filtradas por carrera seleccionada
  const asignaturasFiltradas = filtroCarrera
    ? asignaturas.filter(a => a.carrera === filtroCarrera)
    : asignaturas

  // Paquetes filtrados en frontend (carrera y asignatura se filtran localmente
  // porque los paquetes solo vienen con taller_id, no con carrera directa)
  const paquetesFiltrados = paquetes.filter(p => {
    const taller = talleres.find(t => t.id === p.taller_id)
    if (filtroAsignatura && String(taller?.asignatura_id) !== filtroAsignatura) return false
    if (filtroCarrera) {
      const asig = asignaturas.find(a => a.id === taller?.asignatura_id)
      if (asig?.carrera !== filtroCarrera) return false
    }
    return true
  })

  // Semestres disponibles para el selector
  const semestresDisponibles = [...new Set(paquetes.map(p => p.semestre))].sort().reverse()

  async function toggleBloqueo(p: PaqueteResponse) {
    try {
      await api.put(`/paquetes/${p.id}`, { bloqueado: !p.bloqueado })
      showToast(p.bloqueado ? 'Paquete desbloqueado' : 'Paquete bloqueado')
      load()
    } catch {
      showToast('Error al cambiar el estado del paquete')
    }
  }

  function insumoTipoBadge(tipo: string) {
    if (tipo === 'implemento') return <Badge variant="info">Implemento</Badge>
    return <Badge variant="default">Insumo</Badge>
  }

  const selectCls = `px-3 py-1.5 rounded-lg border border-slate-200 text-sm
    text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500
    cursor-pointer`

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {toast && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 bg-teal-600
                        text-white px-4 py-3 rounded-xl shadow-lg text-sm font-semibold">
          <CheckCircle size={16} />{toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <FlaskConical size={22} className="text-teal-600" />
            Paquetes de insumos
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {loading ? '...' : `${paquetesFiltrados.length} paquetes`}
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-5
                      flex flex-wrap items-center gap-3">
        {/* Filtro carrera */}
        <select
          value={filtroCarrera}
          onChange={e => {
            setFiltroCarrera(e.target.value)
            setFiltroAsignatura('')
            setFiltroTaller('')
          }}
          className={selectCls}
        >
          <option value="">Todas las carreras</option>
          {CARRERAS.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>

        {/* Filtro asignatura */}
        <select
          value={filtroAsignatura}
          onChange={e => { setFiltroAsignatura(e.target.value); setFiltroTaller('') }}
          className={selectCls}
        >
          <option value="">Todas las asignaturas</option>
          {asignaturasFiltradas.map(a => (
            <option key={a.id} value={a.id}>{a.nombre}</option>
          ))}
        </select>

        {/* Filtro taller */}
        <select
          value={filtroTaller}
          onChange={e => setFiltroTaller(e.target.value)}
          className={selectCls}
        >
          <option value="">Todos los talleres</option>
          {talleresFiltrados.map(t => (
            <option key={t.id} value={t.id}>{t.nombre}</option>
          ))}
        </select>

        {/* Filtro semestre */}
        <select
          value={filtroSemestre}
          onChange={e => setFiltroSemestre(e.target.value)}
          className={selectCls}
        >
          <option value="">Todos los semestres</option>
          {semestresDisponibles.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Tabla de paquetes */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500
                             uppercase tracking-wide w-8"></th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500
                             uppercase tracking-wide">Taller</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500
                             uppercase tracking-wide">Asignatura</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500
                             uppercase tracking-wide">Carrera</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500
                             uppercase tracking-wide">Semestre</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500
                             uppercase tracking-wide">Ítems</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500
                             uppercase tracking-wide">Estado</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500
                             uppercase tracking-wide">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRowSkeleton key={i} cols={8} />
              ))
            ) : paquetesFiltrados.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-16 text-slate-400">
                  <Package size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="font-semibold">Sin paquetes que mostrar</p>
                  <p className="text-xs mt-1">
                    Crea talleres y asigna paquetes de insumos para verlos aquí.
                  </p>
                </td>
              </tr>
            ) : paquetesFiltrados.map(p => {
              const taller = talleres.find(t => t.id === p.taller_id)
              const asig = asignaturas.find(a => a.id === taller?.asignatura_id)
              const estaExpandido = expandido === p.id

              return (
                <>
                  <tr
                    key={p.id}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => setExpandido(estaExpandido ? null : p.id)}
                  >
                    <td className="px-4 py-3 text-slate-400">
                      {estaExpandido
                        ? <ChevronUp size={14} />
                        : <ChevronDown size={14} />}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{p.taller_nombre}</div>
                      {p.notas && (
                        <div className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">
                          {p.notas}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {asig ? (
                        <span className="flex items-center gap-1.5 text-slate-600">
                          <BookOpen size={12} className="text-slate-400" />
                          {asig.nombre}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {asig?.carrera ? (
                        <Badge variant={CARRERA_VARIANT[asig.carrera]}>
                          {carreraLabel(asig.carrera)}
                        </Badge>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-mono text-xs text-slate-600
                                       bg-slate-100 px-2 py-0.5 rounded-full">
                        {p.semestre}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-semibold text-slate-700">
                        {p.items.length}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.bloqueado
                        ? <Badge variant="warning">Bloqueado</Badge>
                        : <Badge variant="success">Editable</Badge>}
                    </td>
                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => toggleBloqueo(p)}
                        title={p.bloqueado ? 'Desbloquear paquete' : 'Bloquear paquete'}
                        className={`p-1.5 rounded-lg transition-colors ${
                          p.bloqueado
                            ? 'text-slate-400 hover:bg-emerald-50 hover:text-emerald-600'
                            : 'text-slate-400 hover:bg-amber-50 hover:text-amber-600'
                        }`}
                      >
                        {p.bloqueado ? <Unlock size={14} /> : <Lock size={14} />}
                      </button>
                    </td>
                  </tr>

                  {/* Fila expandida con los items del paquete */}
                  {estaExpandido && (
                    <tr key={`${p.id}-items`}>
                      <td colSpan={8} className="bg-slate-50 px-8 py-4">
                        {p.items.length === 0 ? (
                          <p className="text-slate-400 text-sm italic">
                            Este paquete no tiene ítems aún.
                          </p>
                        ) : (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-xs font-bold text-slate-400
                                             uppercase tracking-wide">
                                <th className="text-left py-1.5 pr-4">Insumo o implemento</th>
                                <th className="text-center py-1.5 pr-4">Tipo</th>
                                <th className="text-center py-1.5 pr-4">Cantidad requerida</th>
                                <th className="text-left py-1.5">Notas</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {p.items.map(item => (
                                <tr key={item.id} className="hover:bg-white transition-colors">
                                  <td className="py-2 pr-4 font-semibold text-slate-800">
                                    {item.insumo_nombre}
                                  </td>
                                  <td className="py-2 pr-4 text-center">
                                    {insumoTipoBadge(item.insumo_tipo)}
                                  </td>
                                  <td className="py-2 pr-4 text-center font-bold text-slate-700">
                                    {item.cantidad_requerida}
                                  </td>
                                  <td className="py-2 text-slate-500">
                                    {item.notas ?? '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        {p.creado_por_nombre && (
                          <p className="text-xs text-slate-400 mt-3">
                            Creado por {p.creado_por_nombre}
                          </p>
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
  )
}

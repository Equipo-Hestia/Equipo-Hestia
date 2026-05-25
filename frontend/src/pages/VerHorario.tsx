import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Calendar, AlertCircle, Users, BookOpen,
  GraduationCap, RefreshCw, Clock, Info,
} from 'lucide-react'
import { api } from '../api/client'
import type { ClaseDocenteResponse } from '../types/api'
import { Badge } from '../components/ui/Badge'

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function getSemestre(): string {
  const now = new Date()
  return `${now.getFullYear()}-${now.getMonth() + 1 <= 7 ? '1' : '2'}`
}

const DIAS_KEY = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes']
const DIAS_LABEL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']

interface DocenteGrupo {
  docente_id: number
  docente_nombre: string
  clases: ClaseDocenteResponse[]
}

function agruparPorDocente(clases: ClaseDocenteResponse[]): DocenteGrupo[] {
  const map = new Map<number, DocenteGrupo>()
  for (const c of clases) {
    if (!map.has(c.docente_id)) {
      map.set(c.docente_id, {
        docente_id: c.docente_id,
        docente_nombre: c.docente_nombre,
        clases: [],
      })
    }
    map.get(c.docente_id)!.clases.push(c)
  }
  return Array.from(map.values()).sort((a, b) =>
    a.docente_nombre.localeCompare(b.docente_nombre, 'es')
  )
}

// Paleta de colores ciclica por asignatura_id para identidad visual consistente
const PALETA = [
  {
    bg: 'bg-teal-50 dark:bg-teal-900/40',
    border: 'border-teal-200 dark:border-teal-700',
    text: 'text-teal-900 dark:text-teal-100',
    sub: 'text-teal-600 dark:text-teal-300',
  },
  {
    bg: 'bg-violet-50 dark:bg-violet-900/40',
    border: 'border-violet-200 dark:border-violet-700',
    text: 'text-violet-900 dark:text-violet-100',
    sub: 'text-violet-600 dark:text-violet-300',
  },
  {
    bg: 'bg-amber-50 dark:bg-amber-900/40',
    border: 'border-amber-200 dark:border-amber-700',
    text: 'text-amber-900 dark:text-amber-100',
    sub: 'text-amber-600 dark:text-amber-300',
  },
  {
    bg: 'bg-rose-50 dark:bg-rose-900/40',
    border: 'border-rose-200 dark:border-rose-700',
    text: 'text-rose-900 dark:text-rose-100',
    sub: 'text-rose-600 dark:text-rose-300',
  },
  {
    bg: 'bg-emerald-50 dark:bg-emerald-900/40',
    border: 'border-emerald-200 dark:border-emerald-700',
    text: 'text-emerald-900 dark:text-emerald-100',
    sub: 'text-emerald-600 dark:text-emerald-300',
  },
]

function getColor(asignatura_id: number) {
  return PALETA[asignatura_id % PALETA.length]
}

// ---------------------------------------------------------------------------
// Bloque de clase en la grilla
// ---------------------------------------------------------------------------

function ClaseBloque({ clase }: { clase: ClaseDocenteResponse }) {
  const c = getColor(clase.asignatura_id)
  return (
    <div
      className={`
        ${c.bg} ${c.border} border rounded-lg p-2 mb-1 last:mb-0
        ${!clase.activa ? 'opacity-50' : ''}
      `}
    >
      <p className={`${c.text} text-xs font-bold leading-tight truncate`}
        title={clase.asignatura_nombre}>
        {clase.asignatura_nombre}
      </p>
      <p className={`${c.sub} text-xs font-mono mt-0.5`}>
        {clase.asignatura_codigo} · {clase.seccion}
      </p>
      {clase.hora_inicio && clase.hora_fin && (
        <p className={`${c.sub} text-xs mt-1 flex items-center gap-1`}>
          <Clock size={9} />
          {clase.hora_inicio}–{clase.hora_fin}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tarjeta de docente con grilla semanal
// ---------------------------------------------------------------------------

function GrillaDocente({ grupo }: { grupo: DocenteGrupo }) {
  const { porDia, sinDia } = useMemo(() => {
    const porDia = new Map<string, ClaseDocenteResponse[]>()
    const sinDia: ClaseDocenteResponse[] = []
    for (const c of grupo.clases) {
      if (c.dia_semana) {
        const dia = c.dia_semana.toLowerCase()
        const prev = porDia.get(dia) ?? []
        porDia.set(dia, [...prev, c])
      } else {
        sinDia.push(c)
      }
    }
    return { porDia, sinDia }
  }, [grupo.clases])

  const tieneDias = DIAS_KEY.some(d => porDia.has(d))
  const totalEst = grupo.clases.reduce((s, c) => s + (c.num_estudiantes ?? 0), 0)
  const inactivas = grupo.clases.filter(c => !c.activa).length

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl
                    border border-slate-200 dark:border-slate-700
                    overflow-hidden">

      {/* Cabecera del docente */}
      <div className="flex items-center justify-between px-5 py-4
                      border-b border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-teal-100 dark:bg-teal-900
                          flex items-center justify-center flex-shrink-0">
            <GraduationCap size={17} className="text-teal-600 dark:text-teal-300" />
          </div>
          <div>
            <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">
              {grupo.docente_nombre}
            </p>
            <p className="text-xs text-slate-400">
              {grupo.clases.length}{' '}
              {grupo.clases.length === 1 ? 'clase' : 'clases'}
              {totalEst > 0 && ` · ${totalEst} estudiantes`}
            </p>
          </div>
        </div>
        {inactivas > 0 && (
          <span className="text-xs bg-rose-50 dark:bg-rose-900/30
                           text-rose-600 dark:text-rose-300
                           border border-rose-200 dark:border-rose-700
                           px-2 py-0.5 rounded-full font-semibold">
            {inactivas} inactiva{inactivas > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Grilla semanal L-V */}
      {tieneDias && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700">
                {DIAS_LABEL.map(d => (
                  <th
                    key={d}
                    className="px-3 py-2 text-left text-xs font-bold
                               text-slate-500 dark:text-slate-400
                               uppercase tracking-wide
                               bg-slate-50 dark:bg-slate-900/50 w-1/5"
                  >
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="align-top">
                {DIAS_KEY.map(dia => (
                  <td
                    key={dia}
                    className="px-3 py-2 border-r last:border-r-0
                               border-slate-100 dark:border-slate-700 w-1/5"
                  >
                    {(porDia.get(dia) ?? []).length > 0 ? (
                      (porDia.get(dia) ?? []).map(c => (
                        <ClaseBloque key={c.id} clase={c} />
                      ))
                    ) : (
                      <div className="h-10 rounded-lg
                                      bg-slate-50 dark:bg-slate-900/30" />
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Clases sin dia asignado */}
      {sinDia.length > 0 && (
        <div className="px-5 py-3">
          {!tieneDias && (
            <div className="flex items-center gap-2 mb-3
                            text-xs text-slate-400 dark:text-slate-500">
              <Info size={13} />
              Sin horario registrado. Importa el horario con los campos
              <span className="font-mono">dia_semana</span>,
              <span className="font-mono">hora_inicio</span> y
              <span className="font-mono">hora_fin</span>.
            </div>
          )}
          <div className="divide-y divide-slate-50 dark:divide-slate-700">
            {sinDia.map(c => (
              <div
                key={c.id}
                className={`flex items-center justify-between py-2
                  ${!c.activa ? 'opacity-50' : ''}`}
              >
                <div>
                  <p className="font-semibold text-sm
                               text-slate-800 dark:text-slate-100">
                    {c.asignatura_nombre}
                  </p>
                  <p className="text-xs text-slate-400 font-mono">
                    {c.asignatura_codigo}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold
                                   text-slate-600 dark:text-slate-300 text-sm">
                    {c.seccion}
                  </span>
                  {c.activa
                    ? <Badge variant="success">Activa</Badge>
                    : <Badge variant="danger">Inactiva</Badge>
                  }
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function VerHorario() {
  const [semestre, setSemestre] = useState(getSemestre)
  const [consultado, setConsultado] = useState('')
  const [clases, setClases] = useState<ClaseDocenteResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async (sem: string) => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get<ClaseDocenteResponse[]>('/clases-docente/', {
        params: { semestre: sem, solo_activas: false },
      })
      setClases(data)
      setConsultado(sem)
    } catch {
      setError('No se pudo cargar el horario académico.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Carga automatica con el semestre actual al montar
  useEffect(() => { cargar(getSemestre()) }, [cargar])

  function consultar() {
    if (semestre.trim()) cargar(semestre.trim())
  }

  const grupos = useMemo(() => agruparPorDocente(clases), [clases])
  const totalActivas = clases.filter(c => c.activa).length
  const totalEst = clases.reduce((s, c) => s + (c.num_estudiantes ?? 0), 0)
  const tieneDatosHorario = clases.some(c => c.dia_semana)

  return (
    <div className="p-8 max-w-6xl mx-auto">

      {/* Encabezado */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100
                         flex items-center gap-2">
            <Calendar size={22} className="text-teal-600" />
            Horario Académico
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Visualiza el horario cargado por semestre.
            {consultado && (
              <span className="ml-1 font-semibold text-slate-700 dark:text-slate-300">
                Semestre {consultado}
              </span>
            )}
          </p>
        </div>
        {consultado && (
          <button
            onClick={() => cargar(consultado)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg
                       border border-slate-200 dark:border-slate-600
                       text-slate-600 dark:text-slate-300
                       hover:bg-slate-100 dark:hover:bg-slate-700
                       text-sm font-semibold transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
        )}
      </div>

      {/* Selector de semestre */}
      <div className="flex gap-3 items-end mb-6">
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">
            SEMESTRE
          </label>
          <input
            value={semestre}
            onChange={e => setSemestre(e.target.value)}
            placeholder="Ej: 2026-1"
            className="px-3 py-2 text-sm rounded-lg
                       border border-slate-200 dark:border-slate-600
                       bg-white dark:bg-slate-700
                       text-slate-900 dark:text-slate-100
                       focus:outline-none focus:ring-2 focus:ring-teal-500 w-40"
            onKeyDown={e => e.key === 'Enter' && consultar()}
          />
        </div>
        <button
          onClick={consultar}
          disabled={!semestre.trim() || loading}
          className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white
                     text-sm font-bold rounded-lg disabled:opacity-50
                     transition-colors">
          {loading ? 'Cargando...' : 'Consultar'}
        </button>
      </div>

      {/* Aviso si no hay datos de horario */}
      {!loading && consultado && clases.length > 0 && !tieneDatosHorario && (
        <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20
                        border border-amber-200 dark:border-amber-700
                        rounded-xl px-4 py-3 mb-6 text-amber-800 dark:text-amber-200
                        text-sm">
          <Info size={16} className="flex-shrink-0 mt-0.5" />
          <span>
            Las clases de este semestre no tienen horario asignado.
            Vuelve a importar el archivo de horario con las columnas
            <strong className="font-mono mx-1">dia_semana</strong>,
            <strong className="font-mono mx-1">hora_inicio</strong> y
            <strong className="font-mono">hora_fin</strong> para ver
            la grilla semanal.
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 bg-rose-50 border border-rose-200
                        rounded-xl px-4 py-3 mb-6 text-rose-700 text-sm">
          <AlertCircle size={16} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Métricas */}
      {!loading && consultado && clases.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl
                          border border-slate-200 dark:border-slate-700 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-teal-50 dark:bg-teal-900/40 rounded-lg">
                <Users size={16} className="text-teal-600 dark:text-teal-300" />
              </div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Docentes
              </p>
            </div>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100">
              {grupos.length}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl
                          border border-slate-200 dark:border-slate-700 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-50 dark:bg-emerald-900/40 rounded-lg">
                <BookOpen size={16} className="text-emerald-600 dark:text-emerald-300" />
              </div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Clases activas
              </p>
            </div>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100">
              {totalActivas}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl
                          border border-slate-200 dark:border-slate-700 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-violet-50 dark:bg-violet-900/40 rounded-lg">
                <GraduationCap size={16} className="text-violet-600 dark:text-violet-300" />
              </div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Total estudiantes
              </p>
            </div>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100">
              {totalEst > 0
                ? totalEst
                : <span className="text-slate-400 text-lg">N/D</span>
              }
            </p>
          </div>
        </div>
      )}

      {/* Estado vacío */}
      {!loading && consultado && clases.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <Calendar size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-semibold">
            Sin horario cargado para el semestre {consultado}.
          </p>
          <p className="text-sm mt-1">
            Usa “Importar Horario” para cargar el archivo de clases.
          </p>
        </div>
      )}

      {/* Skeleton de carga */}
      {loading && (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}
              className="bg-white dark:bg-slate-800 rounded-xl
                         border border-slate-200 dark:border-slate-700 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="skeleton w-9 h-9 rounded-full" />
                <div className="space-y-1.5">
                  <div className="skeleton h-4 w-36 rounded" />
                  <div className="skeleton h-3 w-20 rounded" />
                </div>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: 5 }).map((_, j) => (
                  <div key={j} className="skeleton h-20 rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Grillas por docente */}
      {!loading && grupos.length > 0 && (
        <div className="space-y-5">
          {grupos.map(g => (
            <GrillaDocente key={g.docente_id} grupo={g} />
          ))}
        </div>
      )}
    </div>
  )
}

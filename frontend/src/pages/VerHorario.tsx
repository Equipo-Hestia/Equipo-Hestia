import { useEffect, useState, useCallback } from 'react'
import {
  Calendar, AlertCircle, Users, BookOpen,
  GraduationCap, RefreshCw,
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

// ---------------------------------------------------------------------------
// Tarjeta de docente
// ---------------------------------------------------------------------------

function DocenteCard({ grupo }: { grupo: DocenteGrupo }) {
  const inactivas = grupo.clases.filter(c => !c.activa).length
  const totalEst = grupo.clases.reduce((s, c) => s + (c.num_estudiantes ?? 0), 0)

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Cabecera del docente */}
      <div className="flex items-center justify-between px-5 py-4
                      border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-teal-100
                          flex items-center justify-center flex-shrink-0">
            <GraduationCap size={17} className="text-teal-600" />
          </div>
          <div>
            <p className="font-bold text-slate-900 text-sm">
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
          <span className="text-xs bg-rose-50 text-rose-600 border border-rose-200
                           px-2 py-0.5 rounded-full font-semibold">
            {inactivas} inactiva{inactivas > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Lista de clases */}
      <div className="divide-y divide-slate-50">
        {grupo.clases.map(c => (
          <div
            key={c.id}
            className={`flex items-center justify-between px-5 py-3 ${
              !c.activa ? 'opacity-50' : ''
            }`}
          >
            <div>
              <p className="font-semibold text-sm text-slate-900">
                {c.asignatura_nombre}
              </p>
              <p className="text-xs text-slate-400 font-mono">
                {c.asignatura_codigo}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono font-bold text-slate-600 text-sm">
                {c.seccion}
              </span>
              {c.num_estudiantes != null && (
                <span className="text-xs text-slate-400">
                  {c.num_estudiantes} est.
                </span>
              )}
              {c.activa
                ? <Badge variant="success">Activa</Badge>
                : <Badge variant="danger">Inactiva</Badge>
              }
            </div>
          </div>
        ))}
      </div>
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

  // Carga automática al montar con el semestre actual
  useEffect(() => { cargar(getSemestre()) }, [cargar])

  function consultar() {
    if (semestre.trim()) cargar(semestre.trim())
  }

  const grupos = agruparPorDocente(clases)
  const totalActivas = clases.filter(c => c.activa).length
  const totalEst = clases.reduce((s, c) => s + (c.num_estudiantes ?? 0), 0)

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Calendar size={22} className="text-teal-600" />
            Horario Académico
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Visualiza el horario cargado por semestre.
            {consultado && (
              <span className="ml-1 font-semibold text-slate-700">
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
                       border border-slate-200 text-slate-600
                       hover:bg-slate-100 text-sm font-semibold
                       transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
        )}
      </div>

      {/* Filtro de semestre */}
      <div className="flex gap-3 items-end mb-6">
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">
            SEMESTRE
          </label>
          <input
            value={semestre}
            onChange={e => setSemestre(e.target.value)}
            placeholder="Ej: 2026-1"
            className="px-3 py-2 text-sm rounded-lg border border-slate-200
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
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-teal-50 rounded-lg">
                <Users size={16} className="text-teal-600" />
              </div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Docentes
              </p>
            </div>
            <p className="text-2xl font-black text-slate-900">{grupos.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <BookOpen size={16} className="text-emerald-600" />
              </div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Clases activas
              </p>
            </div>
            <p className="text-2xl font-black text-slate-900">{totalActivas}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-violet-50 rounded-lg">
                <GraduationCap size={16} className="text-violet-600" />
              </div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Total estudiantes
              </p>
            </div>
            <p className="text-2xl font-black text-slate-900">
              {totalEst > 0 ? totalEst : <span className="text-slate-400 text-lg">N/D</span>}
            </p>
          </div>
        </div>
      )}

      {/* Estado vacío */}
      {!loading && consultado && clases.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <Calendar size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-semibold">Sin horario cargado para el semestre {consultado}.</p>
          <p className="text-sm mt-1">
            Usa “Importar Horario” para cargar el archivo de clases.
          </p>
        </div>
      )}

      {/* Skeleton de carga */}
      {loading && (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="skeleton w-9 h-9 rounded-full" />
                <div className="space-y-1.5">
                  <div className="skeleton h-4 w-36 rounded" />
                  <div className="skeleton h-3 w-20 rounded" />
                </div>
              </div>
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, j) => (
                  <div key={j} className="skeleton h-10 w-full rounded" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tarjetas de docentes */}
      {!loading && grupos.length > 0 && (
        <div className="space-y-4">
          {grupos.map(g => (
            <DocenteCard key={g.docente_id} grupo={g} />
          ))}
        </div>
      )}
    </div>
  )
}

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Calendar, AlertCircle, Users, BookOpen,
  GraduationCap, RefreshCw, Clock, Info,
} from 'lucide-react'
import { api } from '../api/client'
import type { ClaseDocenteResponse } from '../types/api'
import { Badge } from '../components/ui/Badge'

function getSemestre(): string {
  const now = new Date()
  return `${now.getFullYear()}-${now.getMonth() + 1 <= 7 ? '1' : '2'}`
}

const DIAS_KEY = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes']
const DIAS_LABEL = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes']

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

interface PaletaItem {
  bg: string
  border: string
  text: string
  sub: string
}

const PALETA: PaletaItem[] = [
  {
    bg: 'rgba(29, 158, 117, 0.12)',
    border: 'var(--h-teal-border)',
    text: 'var(--h-teal-hover)',
    sub: 'var(--h-text-secondary)',
  },
  {
    bg: 'rgba(139, 92, 246, 0.12)',
    border: 'rgba(139, 92, 246, 0.45)',
    text: '#a78bfa',
    sub: 'var(--h-text-secondary)',
  },
  {
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'var(--h-sem-warning-border)',
    text: 'var(--h-sem-warning-text)',
    sub: 'var(--h-text-secondary)',
  },
  {
    bg: 'rgba(244, 63, 94, 0.12)',
    border: 'var(--h-sem-danger-border)',
    text: 'var(--h-sem-danger-text)',
    sub: 'var(--h-text-secondary)',
  },
  {
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'var(--h-sem-success-border)',
    text: 'var(--h-sem-success-text)',
    sub: 'var(--h-text-secondary)',
  },
]

function getColor(asignatura_id: number): PaletaItem {
  return PALETA[asignatura_id % PALETA.length]
}

function ClaseBloque({ clase }: { clase: ClaseDocenteResponse }) {
  const c = getColor(clase.asignatura_id)
  return (
    <div
      className={`rounded-lg p-2 mb-1 last:mb-0 border ${!clase.activa ? 'opacity-50' : ''}`}
      style={{ background: c.bg, borderColor: c.border }}
    >
      <p className="text-xs font-bold leading-tight truncate text-h-primary"
        title={clase.asignatura_nombre}
        style={{ color: c.text }}>
        {clase.asignatura_nombre}
      </p>
      <p className="text-xs font-mono mt-0.5 text-h-tertiary">
        {clase.asignatura_codigo} · {clase.seccion}
      </p>
      {clase.hora_inicio && clase.hora_fin && (
        <p className="text-xs mt-1 flex items-center gap-1 text-h-tertiary">
          <Clock size={9} />
          {clase.hora_inicio}–{clase.hora_fin}
        </p>
      )}
    </div>
  )
}

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
    <div className="bg-h-surface rounded-xl border border-h-subtle overflow-hidden">

      <div className="flex items-center justify-between px-5 py-4 border-b border-h-subtle">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--h-teal-subtle)' }}>
            <GraduationCap size={17} style={{ color: 'var(--h-teal-hover)' }} />
          </div>
          <div>
            <p className="font-bold text-h-primary text-sm">
              {grupo.docente_nombre}
            </p>
            <p className="text-xs text-h-tertiary">
              {grupo.clases.length}{' '}
              {grupo.clases.length === 1 ? 'clase' : 'clases'}
              {totalEst > 0 && ` · ${totalEst} estudiantes`}
            </p>
          </div>
        </div>
        {inactivas > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
            style={{
              background: 'var(--h-sem-danger-bg)',
              color: 'var(--h-sem-danger-text)',
              border: '1px solid var(--h-sem-danger-border)',
            }}>
            {inactivas} inactiva{inactivas > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {tieneDias && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-xs">
            <thead>
              <tr className="border-b border-h-subtle">
                {DIAS_LABEL.map(d => (
                  <th
                    key={d}
                    className="px-3 py-2 text-left text-[10px] font-semibold
                               text-h-tertiary uppercase tracking-widest w-1/5 bg-h-elevated"
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
                    className="px-3 py-2 border-r last:border-r-0 border-h-subtle w-1/5"
                  >
                    {(porDia.get(dia) ?? []).length > 0 ? (
                      (porDia.get(dia) ?? []).map(c => (
                        <ClaseBloque key={c.id} clase={c} />
                      ))
                    ) : (
                      <div className="h-10 rounded-lg bg-h-elevated" />
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {sinDia.length > 0 && (
        <div className="px-5 py-3">
          {!tieneDias && (
            <div className="flex items-center gap-2 mb-3 text-xs text-h-tertiary">
              <Info size={13} />
              Sin horario registrado. Importa el horario con los campos
              <span className="font-mono">dia_semana</span>,
              <span className="font-mono">hora_inicio</span> y
              <span className="font-mono">hora_fin</span>.
            </div>
          )}
          <div className="divide-y divide-h-subtle">
            {sinDia.map(c => (
              <div
                key={c.id}
                className={`flex items-center justify-between py-2
                  ${!c.activa ? 'opacity-50' : ''}`}
              >
                <div>
                  <p className="font-semibold text-sm text-h-primary">
                    {c.asignatura_nombre}
                  </p>
                  <p className="text-xs text-h-tertiary font-mono">
                    {c.asignatura_codigo}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-h-secondary text-sm">
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
      setError('No se pudo cargar el horario academico.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { cargar(getSemestre()) }, [cargar])

  function consultar() {
    if (semestre.trim()) cargar(semestre.trim())
  }

  const grupos = useMemo(() => agruparPorDocente(clases), [clases])
  const totalActivas = clases.filter(c => c.activa).length
  const totalEst = clases.reduce((s, c) => s + (c.num_estudiantes ?? 0), 0)
  const tieneDatosHorario = clases.some(c => c.dia_semana)

  const inputCls = `px-3 py-2 text-sm rounded-lg border border-h-visible
    bg-h-elevated text-h-primary focus:outline-none focus:border-h-strong
    placeholder:text-h-tertiary transition-colors w-40`
  const labelCls = `block text-[10px] font-semibold text-h-tertiary
    uppercase tracking-widest mb-1.5`

  return (
    <div className="p-8 w-full">

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-h-primary flex items-center gap-2">
            <Calendar size={22} className="text-h-accent" />
            Horario Academico
          </h1>
          <p className="text-h-secondary text-sm mt-0.5">
            Visualiza el horario cargado por semestre.
            {consultado && (
              <span className="ml-1 font-semibold text-h-primary">
                Semestre {consultado}
              </span>
            )}
          </p>
        </div>
        {consultado && (
          <button
            onClick={() => cargar(consultado)}
            disabled={loading}
            className="p-2 rounded-lg border border-h-subtle text-h-tertiary
                       transition-colors disabled:opacity-50"
            style={{ background: 'var(--h-bg-elevated)' }}
            onMouseEnter={e => {
              if (!loading) {
                e.currentTarget.style.background = 'var(--h-bg-highlight)'
                e.currentTarget.style.color = 'var(--h-text-secondary)'
              }
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--h-bg-elevated)'
              e.currentTarget.style.color = ''
            }}
            title="Actualizar">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      <div className="bg-h-surface rounded-xl border border-h-subtle p-4 mb-6
                      flex flex-wrap items-end gap-3">
        <div>
          <label className={labelCls}>Semestre</label>
          <input
            value={semestre}
            onChange={e => setSemestre(e.target.value)}
            placeholder="Ej: 2026-1"
            className={inputCls}
            onKeyDown={e => e.key === 'Enter' && consultar()}
          />
        </div>
        <button
          onClick={consultar}
          disabled={!semestre.trim() || loading}
          className="px-4 py-2 text-white text-sm font-semibold rounded-lg
                     disabled:opacity-50 transition-colors"
          style={{ background: 'var(--h-teal-rest)' }}
          onMouseEnter={e => {
            if (!loading && semestre.trim()) {
              e.currentTarget.style.background = 'var(--h-teal-hover)'
            }
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'var(--h-teal-rest)'
          }}>
          {loading ? 'Cargando...' : 'Consultar'}
        </button>
      </div>

      {!loading && consultado && clases.length > 0 && !tieneDatosHorario && (
        <div className="flex items-start gap-3 rounded-xl px-4 py-3 mb-6 text-sm"
          style={{
            background: 'var(--h-sem-warning-bg)',
            border: '1px solid var(--h-sem-warning-border)',
            color: 'var(--h-sem-warning-text)',
          }}>
          <Info size={16} className="flex-shrink-0 mt-0.5" />
          <span>
            Las clases de este semestre no tienen horario asignado.
            Vuelve a importar el archivo de horario con las columnas
            <strong className="font-mono mx-1">dia_semana</strong>,
            <strong className="font-mono mx-1">hora_inicio</strong> y
            <strong className="font-mono mx-1">hora_fin</strong> para ver
            la grilla semanal.
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-xl px-4 py-3 mb-6 text-sm"
          style={{
            background: 'var(--h-sem-danger-bg)',
            border: '1px solid var(--h-sem-danger-border)',
            color: 'var(--h-sem-danger-text)',
          }}>
          <AlertCircle size={16} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {!loading && consultado && clases.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[
            {
              icon: Users,
              label: 'Docentes',
              value: grupos.length,
              iconBg: 'var(--h-teal-subtle)',
              iconColor: 'var(--h-teal-hover)',
            },
            {
              icon: BookOpen,
              label: 'Clases activas',
              value: totalActivas,
              iconBg: 'var(--h-sem-success-bg)',
              iconColor: 'var(--h-sem-success-text)',
            },
            {
              icon: GraduationCap,
              label: 'Total estudiantes',
              value: totalEst > 0 ? totalEst : null,
              iconBg: 'rgba(139, 92, 246, 0.15)',
              iconColor: '#a78bfa',
            },
          ].map(({ icon: Icon, label, value, iconBg, iconColor }) => (
            <div key={label}
              className="bg-h-surface rounded-xl border border-h-subtle p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg" style={{ background: iconBg }}>
                  <Icon size={16} style={{ color: iconColor }} />
                </div>
                <p className="text-[10px] font-semibold text-h-tertiary uppercase tracking-widest">
                  {label}
                </p>
              </div>
              <p className="text-2xl font-bold text-h-primary">
                {value ?? <span className="text-h-tertiary text-lg">N/D</span>}
              </p>
            </div>
          ))}
        </div>
      )}

      {!loading && consultado && clases.length === 0 && (
        <div className="text-center py-16 text-h-tertiary">
          <Calendar size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-semibold text-h-secondary">
            Sin horario cargado para el semestre {consultado}.
          </p>
          <p className="text-sm mt-1 text-h-tertiary">
            Usa "Importar Horario" para cargar el archivo de clases.
          </p>
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}
              className="bg-h-surface rounded-xl border border-h-subtle p-5">
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

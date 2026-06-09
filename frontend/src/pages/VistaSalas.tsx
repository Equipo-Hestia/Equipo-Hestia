import { useState, useEffect, useRef, useCallback } from 'react'
import { MapPin, RefreshCw, CheckCircle2, Clock,
         ClipboardList, ChevronDown, AlertCircle,
         ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '../api/client'
import { useAuthStore } from '../store/auth'
import type {
  ProgramacionTallerResponse,
  RevisionResumenResponse,
  RevisionSalaResponse,
} from '../types/api'

// ---------------------------------------------------------------------------
// Tipos locales
// ---------------------------------------------------------------------------

type Zona = 'piso-1' | 'odontologia'

type EstadoSala =
  | 'sin_actividad'
  | 'próxima'
  | 'en_clase'
  | 'pendiente_revision'
  | 'en_revision'
  | 'revisada'

interface SalaInfo {
  numero: string
  zona:   Zona
  estado: EstadoSala
  prog:   ProgramacionTallerResponse | null
  rev:    RevisionResumenResponse | null
}

// ---------------------------------------------------------------------------
// Helpers de fecha
// ---------------------------------------------------------------------------

function fechaISO(d: Date): string {
  return d.toISOString().split('T')[0]
}

function sumarDias(base: Date, dias: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + dias)
  return d
}

function formatearFechaLabel(d: Date): string {
  const hoy   = fechaISO(new Date())
  const manana = fechaISO(sumarDias(new Date(), 1))
  const ayer   = fechaISO(sumarDias(new Date(), -1))
  const iso    = fechaISO(d)
  if (iso === hoy)    return 'Hoy'
  if (iso === manana) return 'Mañana'
  if (iso === ayer)   return 'Ayer'
  return d.toLocaleDateString('es-CL', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

// ---------------------------------------------------------------------------
// Helpers de tiempo
// ---------------------------------------------------------------------------

function parseHHMM(h: string | null | undefined): number | null {
  if (!h) return null
  const [hh, mm] = h.split(':').map(Number)
  if (isNaN(hh) || isNaN(mm)) return null
  return hh * 60 + mm
}

function minutosActuales(): number {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

function calcularEstado(
  prog:     ProgramacionTallerResponse | null,
  rev:      RevisionResumenResponse | null,
  esFecha:  boolean,  // true si la fecha visualizada es hoy
): EstadoSala {
  if (rev?.estado === 'completada')  return 'revisada'
  if (rev?.estado === 'en_revision') return 'en_revision'
  if (!prog) return 'sin_actividad'

  // Para dias que no son hoy mostramos el estado estatico
  if (!esFecha) {
    return prog.hora_inicio ? 'próxima' : 'sin_actividad'
  }

  const inicio = parseHHMM(prog.hora_inicio)
  const fin    = parseHHMM(prog.hora_fin)
  const ahora  = minutosActuales()

  if (inicio !== null && ahora < inicio) return 'próxima'
  if (fin    !== null && ahora >= fin)   return 'pendiente_revisión'
  return 'en_clase'
}

function fmtCountdown(totalSecs: number): string {
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  if (h > 0)
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function segsHastaFin(horaFin: string | null): number {
  const fin = parseHHMM(horaFin)
  if (fin === null) return 0
  const now = new Date()
  const finDate = new Date(now)
  finDate.setHours(Math.floor(fin / 60), fin % 60, 0, 0)
  return Math.max(0, Math.floor((finDate.getTime() - now.getTime()) / 1000))
}

// ---------------------------------------------------------------------------
// Estilos por estado
// ---------------------------------------------------------------------------

const ESTADO_STYLE: Record<EstadoSala, {
  fill: string; stroke: string; text: string; label: string
}> = {
  sin_actividad:      { fill: 'var(--h-bg-elevated)',   stroke: 'var(--h-border-subtle)',
                        text: 'var(--h-text-tertiary)',  label: 'Disponible' },
  próxima:            { fill: 'var(--h-bg-elevated)',   stroke: 'var(--h-border-visible)',
                        text: 'var(--h-text-secondary)', label: 'Próxima clase' },
  en_clase:           { fill: '#0a2e22', stroke: '#1D9E75',
                        text: '#5dcaa5', label: 'En clase' },
  pendiente_revision: { fill: '#2e1f08', stroke: '#BA7517',
                        text: '#EF9F27', label: 'Pendiente revisión' },
  en_revision:        { fill: '#0d1e2e', stroke: '#378ADD',
                        text: '#85B7EB', label: 'En revisión' },
  revisada:           { fill: '#0a2035', stroke: '#185FA5',
                        text: '#378ADD', label: 'Revisada' },
}

// ---------------------------------------------------------------------------
// Geometria SVG (sin cambios respecto a tu version)
// ---------------------------------------------------------------------------

const W = 82
const H = 100
const GAP = 2
const TOP_Y = 20
const BOT_Y = TOP_Y + H + 60

const FILA_SUP     = ['019','018','017','016','015','014','013','012']
const FILA_INF_IZQ = ['020','021','022']
const ESPECIALES   = [
  { num: 'Oficina', clickable: false },
  { num: 'Bodega',  clickable: false },
]

function xSup(idx: number) { return 10 + idx * (W + GAP) }
function xInf(idx: number) { return 10 + idx * (W + GAP) }

const X_010  = 10 + 7 * (W + GAP)
const Y_011  = TOP_Y
const Y_010  = BOT_Y
const H_011  = (BOT_Y - TOP_Y) + H

const ODO_SALAS = ['07','08','09']

// ---------------------------------------------------------------------------
// SalaRect
// ---------------------------------------------------------------------------

interface SalaRectProps {
  x: number; y: number; w: number; h: number
  numero:       string
  estado:       EstadoSala
  seleccionada: boolean
  clickable?:   boolean
  onClick?:     () => void
  pulsar?:      boolean
}

function SalaRect(
  { x, y, w, h, numero, estado, seleccionada,
    clickable = true, onClick, pulsar }: SalaRectProps,
) {
  const st      = ESTADO_STYLE[estado]
  const strokeW = seleccionada ? 2.5 : 1
  const strokeC = seleccionada ? '#5dcaa5' : st.stroke
  return (
    <g style={{ cursor: clickable ? 'pointer' : 'default' }}
      onClick={clickable ? onClick : undefined}>
      <rect x={x} y={y} width={w} height={h} rx={4}
        fill={st.fill} stroke={strokeC} strokeWidth={strokeW}
        opacity={clickable ? 1 : 0.55} />
      {pulsar && (
        <circle cx={x + w - 10} cy={y + 12} r={5} fill={st.stroke}
          style={{ animation: 'hestia-pulse 1.4s ease-in-out infinite' }} />
      )}
      <text x={x + w / 2} y={y + h / 2}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={14} fontWeight={500}
        fill={clickable ? st.text : 'var(--h-text-tertiary)'}>
        {numero}
      </text>
    </g>
  )
}

// ---------------------------------------------------------------------------
// PuertaSVG (tu implementacion sin cambios)
// ---------------------------------------------------------------------------

interface PuertaProps {
  x: number; y: number
  haciaArriba?: boolean
  direccionLateral?: boolean
}

function PuertaSVG(
  { x, y, haciaArriba = false, direccionLateral = false }: PuertaProps,
) {
  const L = 16
  const color = 'var(--h-border-visible)'

  if (direccionLateral) {
    const xB = x
    const centro = (TOP_Y + H) + (BOT_Y - (TOP_Y + H)) / 2
    const yB = centro + (L / 2) - 2
    const xA = xB - L
    const path = `M ${xA} ${yB} A ${L} ${L} 0 0 1 ${xB} ${yB - L}`
    return (
      <g opacity={0.85}>
        <line x1={xB} y1={yB} x2={xA} y2={yB}
          stroke={color} strokeWidth={1.2} strokeLinecap="round" />
        <path d={path} fill="none" stroke={color}
          strokeWidth={1} strokeDasharray="3 3" />
      </g>
    )
  }

  const off = 12
  const xB  = x + off
  const yB  = haciaArriba ? y : y + H
  const xA  = xB
  const yA  = haciaArriba ? yB - L : yB + L
  const xC  = xB + L
  const yC  = yB
  const path = haciaArriba
    ? `M ${xA} ${yA} A ${L} ${L} 0 0 1 ${xC} ${yC}`
    : `M ${xA} ${yA} A ${L} ${L} 0 0 0 ${xC} ${yC}`
  return (
    <g opacity={0.85}>
      <line x1={xB} y1={yB} x2={xA} y2={yA}
        stroke={color} strokeWidth={1.2} strokeLinecap="round" />
      <path d={path} fill="none" stroke={color}
        strokeWidth={1} strokeDasharray="3 3" />
    </g>
  )
}

// ---------------------------------------------------------------------------
// Mapas SVG
// ---------------------------------------------------------------------------

interface MapaPisoProps {
  salas:        Map<string, SalaInfo>
  seleccionada: string | null
  onSelect:     (num: string) => void
}

function MapaPisoMenos1({ salas, seleccionada, onSelect }: MapaPisoProps) {
  const get = (num: string): SalaInfo =>
    salas.get(num) ??
    { numero: num, zona: 'piso-1', estado: 'sin_actividad', prog: null, rev: null }

  return (
    <svg viewBox="-40 0 820 280" style={{ width: '100%', maxHeight: '260px' }}
      role="img" aria-label="Plano piso -1 Escuela de Salud">
      <defs>
        <style>{`
          @keyframes hestia-pulse {
            0%,100% { opacity:1; r:5; } 50% { opacity:0.4; r:7; }
          }
        `}</style>
      </defs>

      {FILA_SUP.map((num, i) => {
        const s = get(num)
        return (
          <g key={num}>
            <SalaRect x={xSup(i)} y={TOP_Y} w={W} h={H} numero={num}
              estado={s.estado} seleccionada={seleccionada === num}
              onClick={() => onSelect(num)}
              pulsar={s.estado === 'pendiente_revision'} />
            <PuertaSVG x={xSup(i)} y={TOP_Y} haciaArriba={false} />
          </g>
        )
      })}

      {FILA_INF_IZQ.map((num, i) => {
        const s = get(num)
        return (
          <g key={num}>
            <SalaRect x={xInf(i)} y={BOT_Y} w={W} h={H} numero={num}
              estado={s.estado} seleccionada={seleccionada === num}
              onClick={() => onSelect(num)}
              pulsar={s.estado === 'pendiente_revision'} />
            <PuertaSVG x={xInf(i)} y={BOT_Y} haciaArriba={true} />
          </g>
        )
      })}

      {ESPECIALES.map((esp, i) => (
        <g key={esp.num}>
          <SalaRect x={xInf(3 + i)} y={BOT_Y} w={W} h={H}
            numero={esp.num} estado="sin_actividad"
            seleccionada={false} clickable={false} />
          <PuertaSVG x={xInf(3 + i)} y={BOT_Y} haciaArriba={true} />
        </g>
      ))}

      {/* Salida principal */}
      <g transform={`translate(${xInf(5)}, ${BOT_Y})`}>
        <rect x={0} y={0} width={W} height={H}
          fill="rgba(29,158,117,0.03)" stroke="rgba(29,158,117,0.4)"
          strokeWidth={1} strokeDasharray="4 3" rx={4} />
        <g transform={`translate(${W / 2}, ${H / 2 - 10})`}>
          <circle cx={0} cy={0} r={14} fill="#0a2e22"
            stroke="#1D9E75" strokeWidth={1.5} />
          <path d="M-5 0 L5 0 M1 -4 L5 0 L1 4"
            stroke="#1D9E75" strokeWidth={1.5} fill="none"
            strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <text x={W / 2} y={H - 22} textAnchor="middle"
          fontSize={8} fontWeight="bold" fill="#1D9E75" letterSpacing={0.5}>
          SALIDA
        </text>
        <text x={W / 2} y={H - 10} textAnchor="middle"
          fontSize={7} fill="#5dcaa5">PRINCIPAL</text>
      </g>

      {(() => {
        const s = get('010')
        return (
          <g>
            <SalaRect x={xInf(6)} y={BOT_Y} w={W} h={H} numero="010"
              estado={s.estado} seleccionada={seleccionada === '010'}
              onClick={() => onSelect('010')}
              pulsar={s.estado === 'pendiente_revision'} />
            <PuertaSVG x={xInf(6)} y={BOT_Y} haciaArriba={true} />
          </g>
        )
      })()}

      {(() => {
        const s = get('011')
        return (
          <g>
            <SalaRect x={xInf(7)} y={Y_011} w={W} h={H_011} numero="011"
              estado={s.estado} seleccionada={seleccionada === '011'}
              onClick={() => onSelect('011')}
              pulsar={s.estado === 'pendiente_revision'} />
            <PuertaSVG x={xInf(7)} y={TOP_Y} direccionLateral={true} />
          </g>
        )
      })()}

      {/* Salida secundaria */}
      {(() => {
        const cy = (TOP_Y + H) + (BOT_Y - (TOP_Y + H)) / 2
        const wS = 34; const hS = 48
        const xS = -38; const yS = cy - hS / 2
        return (
          <g transform={`translate(${xS}, ${yS})`}>
            <rect x={0} y={0} width={wS} height={hS}
              fill="rgba(29,158,117,0.03)" stroke="rgba(29,158,117,0.5)"
              strokeWidth={1.2} strokeDasharray="4 2" rx={4} />
            <g transform={`translate(${wS / 2}, ${hS / 2 - 6})`}>
              <path d="M4 0 L-4 0 M-1 -4 L-4 0 L-1 4"
                stroke="#1D9E75" strokeWidth={1.5} fill="none"
                strokeLinecap="round" strokeLinejoin="round" />
            </g>
            <text x={wS / 2} y={hS - 16} textAnchor="middle"
              fontSize={7} fontWeight="bold" fill="#1D9E75"
              letterSpacing={0.4}>SALIDA</text>
            <text x={wS / 2} y={hS - 7} textAnchor="middle"
              fontSize={6.5} fontWeight="bold" fill="#5dcaa5"
              letterSpacing={0.4}>SEC.</text>
          </g>
        )
      })()}

      <text x={10} y={12} fontSize={10} fontWeight={500}
        fill="var(--h-text-tertiary)">Piso -1</text>
    </svg>
  )
}

function MapaOdontologia({ salas, seleccionada, onSelect }: MapaPisoProps) {
  const get = (num: string): SalaInfo =>
    salas.get(num) ??
    { numero: num, zona: 'odontologia', estado: 'sin_actividad',
      prog: null, rev: null }
  const W_ODO   = 85; const GAP_ODO = 10
  const X_START = (400 - (ODO_SALAS.length * W_ODO
    + (ODO_SALAS.length - 1) * GAP_ODO)) / 2
  return (
    <svg viewBox="0 0 400 280"
      style={{ width: '100%', height: '100%', maxHeight: '260px' }}
      role="img" aria-label="Salas de odontologia">
      <defs>
        <style>{`
          @keyframes hestia-pulse {
            0%,100% { opacity:1; r:5; } 50% { opacity:0.4; r:7; }
          }
        `}</style>
      </defs>
      <text x={15} y={20} fontSize={10} fontWeight={600}
        fill="var(--h-text-tertiary)">Odontologia</text>
      <text x={15} y={32} fontSize={8} fill="var(--h-text-tertiary)"
        opacity={0.7}>Edificio anexo</text>
      <rect x={X_START - 15} y={60}
        width={(ODO_SALAS.length * W_ODO
          + (ODO_SALAS.length - 1) * GAP_ODO) + 30}
        height={H + 30}
        fill="rgba(255,255,255,0.01)" stroke="var(--h-border-subtle)"
        strokeWidth={0.5} strokeDasharray="4 4" rx={8} />
      {ODO_SALAS.map((num, i) => {
        const s = get(num)
        return (
          <SalaRect key={num}
            x={X_START + i * (W_ODO + GAP_ODO)} y={75}
            w={W_ODO} h={H}
            numero={`Sala ${num}`}
            estado={s.estado}
            seleccionada={seleccionada === num}
            onClick={() => onSelect(num)}
            pulsar={s.estado === 'pendiente_revision'} />
        )
      })}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Panel lateral
// ---------------------------------------------------------------------------

interface PanelProps {
  info:           SalaInfo | null
  revision:       RevisionSalaResponse | null
  cargandoRev:    boolean
  onIniciarRev:   () => void
  onItemChange:   (itemId: number, conforme: boolean, cantidad?: number) => void
  onCompletarRev: () => void
  puedeOperar:    boolean
  esHoy:          boolean
}

function PanelSala(
  { info, revision, cargandoRev, onIniciarRev,
    onItemChange, onCompletarRev, puedeOperar, esHoy }: PanelProps,
) {
  const [segs, setSegs] = useState(0)

  useEffect(() => {
    if (!info?.prog || info.estado !== 'en_clase') {
      setSegs(0); return
    }
    const tick = () => setSegs(segsHastaFin(info.prog!.hora_fin))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [info])

  if (!info) {
    return (
      <div className="flex flex-col items-center justify-center h-full
                      gap-3 text-h-tertiary">
        <MapPin size={32} strokeWidth={1.2} />
        <p className="text-sm text-center leading-relaxed">
          Selecciona una sala<br />para ver su informacion
        </p>
      </div>
    )
  }

  const st   = ESTADO_STYLE[info.estado]
  const prog = info.prog
  const labelCls = 'text-[10px] font-semibold text-h-tertiary uppercase tracking-widest mb-1'
  const valCls   = 'text-sm font-semibold text-h-primary'
  const totalItems    = revision?.items.length ?? 0
  const itemsOk       = revision?.items.filter(it => it.conforme === true).length ?? 0
  const progChecklist = totalItems > 0 ? Math.round((itemsOk / totalItems) * 100) : 0

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto pr-1">
      {/* Badge + nombre */}
      <div>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold
                         px-2.5 py-1 rounded-full mb-2"
          style={{
            background: st.fill, color: st.text,
            border: `1px solid ${st.stroke}`,
          }}>
          <span className="w-2 h-2 rounded-full"
            style={{ background: st.stroke }} />
          {st.label}
        </span>
        <h2 className="text-xl font-bold text-h-primary">
          Sala {info.numero}
        </h2>
      </div>

      {info.estado === 'sin_actividad' && (
        <p className="text-sm text-h-secondary">
          No hay actividad programada para este dia en esta sala.
        </p>
      )}

      {prog && (
        <div className="space-y-3">
          <div><p className={labelCls}>Taller</p>
            <p className={valCls}>{prog.taller_nombre ?? '\u2014'}</p></div>
          {prog.asignatura_nombre && (
            <div><p className={labelCls}>Asignatura</p>
              <p className={valCls}>{prog.asignatura_nombre}</p></div>
          )}
          <div><p className={labelCls}>Docente</p>
            <p className={valCls}>{prog.docente_nombre ?? '\u2014'}</p></div>
          <div><p className={labelCls}>Sección</p>
            <p className={valCls}>{prog.seccion ?? '\u2014'}</p></div>
          <div><p className={labelCls}>Horario</p>
            <p className={valCls}>
              {prog.hora_inicio ?? '?'} – {prog.hora_fin ?? '?'}
            </p></div>
        </div>
      )}

      {/* Countdown (solo si es hoy y esta en clase) */}
      {info.estado === 'en_clase' && esHoy && (
        <div className="rounded-xl p-3 text-center"
          style={{
            background: 'var(--h-bg-elevated)',
            border: '1px solid var(--h-border-subtle)',
          }}>
          <p className="text-[10px] text-h-tertiary uppercase
                         tracking-widest mb-1">Tiempo restante</p>
          <p className="text-3xl font-bold font-mono"
            style={{ color: segs < 300 ? '#EF9F27' : '#1D9E75' }}>
            {fmtCountdown(segs)}
          </p>
          <p className="text-[10px] text-h-tertiary mt-1">
            Termina a las {prog?.hora_fin}
          </p>
        </div>
      )}

      {/* Próxima clase */}
      {info.estado === 'proxima' && (
        <div className="rounded-xl p-3 flex items-center gap-2"
          style={{
            background: 'var(--h-bg-elevated)',
            border: '1px solid var(--h-border-subtle)',
          }}>
          <Clock size={16} className="text-h-tertiary flex-shrink-0" />
          <p className="text-xs text-h-secondary">
            Clase{esHoy ? ' comienza a las' : ' programada:'}{' '}
            {esHoy
              ? <span className="font-bold text-h-primary">
                  {prog?.hora_inicio}
                </span>
              : <span className="font-bold text-h-primary">
                  {prog?.hora_inicio} – {prog?.hora_fin}
                </span>
            }
          </p>
        </div>
      )}

      {/* Flujo de revision: solo disponible si es hoy */}
      {['pendiente_revision','en_revision','revisada'].includes(info.estado)
        && esHoy && (
        <div className="space-y-3">
          {info.estado === 'pendiente_revision' && !revision && (
            <div className="rounded-xl p-3 flex items-start gap-2"
              style={{ background: '#2e1f08', border: '1px solid #BA7517' }}>
              <AlertCircle size={15}
                style={{ color: '#EF9F27', flexShrink: 0, marginTop: 1 }} />
              <p className="text-xs" style={{ color: '#EF9F27' }}>
                El taller finaliz. Esta sala necesita revisión.
              </p>
            </div>
          )}

          {puedeOperar && info.estado === 'pendiente_revision'
            && !revision && !cargandoRev && (
            <button onClick={onIniciarRev}
              className="w-full flex items-center justify-center gap-2
                         py-2.5 rounded-xl text-sm font-semibold text-white
                         transition-colors"
              style={{ background: 'var(--h-teal-rest)' }}
              onMouseEnter={e =>
                (e.currentTarget.style.background = 'var(--h-teal-hover)')}
              onMouseLeave={e =>
                (e.currentTarget.style.background = 'var(--h-teal-rest)')}
            >
              <ClipboardList size={15} /> Iniciar revision de sala
            </button>
          )}

          {cargandoRev && (
            <div className="flex justify-center py-4">
              <RefreshCw size={18} className="animate-spin text-h-tertiary" />
            </div>
          )}

          {revision && revision.estado !== 'completada' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold text-h-tertiary
                               uppercase tracking-widest">
                  Checklist ({itemsOk}/{totalItems})
                </p>
                <span className="text-xs font-bold"
                  style={{
                    color: progChecklist === 100 ? '#1D9E75' : '#EF9F27',
                  }}>
                  {progChecklist}%
                </span>
              </div>
              <div className="w-full rounded-full h-1.5"
                style={{ background: 'var(--h-bg-highlight)' }}>
                <div className="h-1.5 rounded-full transition-all" style={{
                  width: `${progChecklist}%`,
                  background: progChecklist === 100 ? '#1D9E75' : '#EF9F27',
                }} />
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {revision.items.map(item => (
                  <div key={item.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{
                      background: item.conforme === true
                        ? 'rgba(29,158,117,0.08)'
                        : item.conforme === false
                          ? 'rgba(186,117,23,0.08)'
                          : 'var(--h-bg-elevated)',
                      border: '0.5px solid var(--h-border-subtle)',
                    }}>
                    <button
                      onClick={() => onItemChange(
                        item.id, item.conforme !== true,
                        item.cantidad_esperada ?? undefined,
                      )}
                      className="w-5 h-5 rounded flex-shrink-0 flex items-center
                                 justify-center border transition-colors"
                      style={{
                        borderColor: item.conforme === true
                          ? '#1D9E75' : 'var(--h-border-visible)',
                        background: item.conforme === true
                          ? '#1D9E75' : 'transparent',
                      }}
                      title={item.conforme === true
                        ? 'Marcar no conforme' : 'Marcar conforme'}
                    >
                      {item.conforme === true && (
                        <CheckCircle2 size={12} color="white"
                          strokeWidth={2.5} />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-h-primary truncate">
                        {item.nombre}
                      </p>
                      {item.cantidad_esperada !== null
                        && item.cantidad_esperada !== undefined && (
                        <p className="text-[10px] text-h-tertiary">
                          Esperado: {item.cantidad_esperada} unidades
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded
                                     font-semibold flex-shrink-0"
                      style={{
                        background: item.tipo === 'activo_fijo'
                          ? 'rgba(55,138,221,0.15)' : 'rgba(29,158,117,0.15)',
                        color: item.tipo === 'activo_fijo'
                          ? '#85B7EB' : '#5dcaa5',
                      }}>
                      {item.tipo === 'activo_fijo' ? 'AF'
                        : item.tipo === 'implemento' ? 'IMP' : 'INS'}
                    </span>
                  </div>
                ))}
              </div>
              {progChecklist === 100 && puedeOperar && (
                <button onClick={onCompletarRev}
                  className="w-full flex items-center justify-center gap-2
                             py-2.5 rounded-xl text-sm font-semibold text-white
                             transition-colors mt-2"
                  style={{ background: '#1D9E75' }}
                  onMouseEnter={e =>
                    (e.currentTarget.style.background = '#0F6E56')}
                  onMouseLeave={e =>
                    (e.currentTarget.style.background = '#1D9E75')}
                >
                  <CheckCircle2 size={15} /> Marcar sala como revisada
                </button>
              )}
            </div>
          )}

          {info.estado === 'revisada' && (
            <div className="rounded-xl p-3 flex items-center gap-2"
              style={{
                background: 'rgba(29,158,117,0.08)',
                border: '1px solid rgba(29,158,117,0.3)',
              }}>
              <CheckCircle2 size={16}
                style={{ color: '#1D9E75', flexShrink: 0 }} />
              <div>
                <p className="text-xs font-semibold"
                  style={{ color: '#5dcaa5' }}>Sala revisada</p>
                {revision?.operador_nombre && (
                  <p className="text-[10px] text-h-tertiary">
                    por {revision.operador_nombre}
                    {revision.hora_fin_rev
                      && ` a las ${revision.hora_fin_rev}`}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Si no es hoy y hay taller, no mostrar flujo de revision */}
      {['pendiente_revision','en_revision','revisada'].includes(info.estado)
        && !esHoy && prog && (
        <div className="rounded-xl p-3"
          style={{
            background: 'var(--h-bg-elevated)',
            border: '1px solid var(--h-border-subtle)',
          }}>
          <p className="text-xs text-h-tertiary">
            La revision de sala solo esta disponible en la vista del dia actual.
          </p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pagina principal
// ---------------------------------------------------------------------------

const ROLES_OPERADOR   = ['admin', 'operador_coordinador', 'operador']
const TODAS_SALAS_PISO1 = [
  '010','011','012','013','014','015','016','017',
  '018','019','020','021','022',
]
const TODAS_SALAS_ODO = ['07','08','09']

function normalizarNumeroSala(nombreBD: string): string {
  const m = nombreBD.match(/(\d+)$/)
  return m ? m[1].replace(/^0*(\d{2,})$/, '$1').padStart(3, '0') : nombreBD
}

export function VistaSalas() {
  const { user }    = useAuthStore()
  const puedeOperar = user?.rol ? ROLES_OPERADOR.includes(user.rol) : false

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const [fechaVista,    setFechaVista]    = useState<Date>(new Date(hoy))
  const [zona,          setZona]          = useState<Zona>('piso-1')
  const [programaciones, setProgramaciones] =
    useState<ProgramacionTallerResponse[]>([])
  const [revisiones,    setRevisiones]    =
    useState<RevisionResumenResponse[]>([])
  const [cargando,      setCargando]      = useState(true)
  const [seleccionada,  setSeleccionada]  = useState<string | null>(null)
  const [revision,      setRevision]      =
    useState<RevisionSalaResponse | null>(null)
  const [cargandoRev,   setCargandoRev]   = useState(false)
  const [zonaDrop,      setZonaDrop]      = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  const esHoy = fechaISO(fechaVista) === fechaISO(new Date())

  // Cerrar dropdown al click fuera
  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node))
        setZonaDrop(false)
    }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [])

  const cargarDatos = useCallback(async () => {
    setCargando(true)
    try {
      const isoFecha = fechaISO(fechaVista)
      const [pRes, rRes] = await Promise.all([
        // Para hoy usamos /hoy; para otras fechas usamos el filtro por fecha
        esHoy
          ? api.get<ProgramacionTallerResponse[]>('/programacion/hoy')
          : api.get<ProgramacionTallerResponse[]>(
              '/programacion/', { params: { fecha: isoFecha, limit: 200 } }
            ),
        esHoy
          ? api.get<RevisionResumenResponse[]>('/revisiones/hoy')
          : api.get<RevisionResumenResponse[]>(
              '/revisiones/', { params: { fecha: isoFecha } }
            ),
      ])
      setProgramaciones(pRes.data)
      setRevisiones(rRes.data)
    } catch { /* silencioso */ }
    finally { setCargando(false) }
  }, [fechaVista, esHoy])

  useEffect(() => { cargarDatos() }, [cargarDatos])

  // Refresco automatico cada 60s solo si es hoy
  useEffect(() => {
    if (!esHoy) return
    const id = setInterval(cargarDatos, 60_000)
    return () => clearInterval(id)
  }, [esHoy, cargarDatos])

  const handleSelect = useCallback((num: string) => {
    setSeleccionada(prev => prev === num ? null : num)
  }, [])

  const salaMap = useCallback((): Map<string, SalaInfo> => {
    const todasSalas = zona === 'piso-1' ? TODAS_SALAS_PISO1 : TODAS_SALAS_ODO
    const map = new Map<string, SalaInfo>()
    todasSalas.forEach(num => {
      const prog = programaciones.find(p =>
        p.sala_nombre
          ? normalizarNumeroSala(p.sala_nombre) === num
          : false
      ) ?? null
      const rev = prog
        ? revisiones.find(r => r.programacion_id === prog.id) ?? null
        : null
      map.set(num, {
        numero: num, zona,
        estado: calcularEstado(prog, rev, esHoy),
        prog, rev,
      })
    })
    return map
  }, [programaciones, revisiones, zona, esHoy])

  const salas           = salaMap()
  const infoSeleccionada = seleccionada ? salas.get(seleccionada) ?? null : null

  useEffect(() => {
    if (!infoSeleccionada?.rev) { setRevision(null); return }
    api.get<RevisionSalaResponse>(`/revisiones/${infoSeleccionada.rev.id}`)
      .then(r => setRevision(r.data)).catch(() => setRevision(null))
  }, [infoSeleccionada?.rev?.id])

  async function handleIniciarRevision() {
    if (!infoSeleccionada?.prog) return
    setCargandoRev(true)
    try {
      const res = await api.post<RevisionSalaResponse>('/revisiones/', {
        programacion_id: infoSeleccionada.prog.id,
      })
      setRevision(res.data); await cargarDatos()
    } catch { /* silencioso */ }
    finally { setCargandoRev(false) }
  }

  async function handleItemChange(
    itemId: number, conforme: boolean, _cantidad?: number,
  ) {
    if (!revision) return
    try {
      const res = await api.patch<RevisionSalaResponse>(
        `/revisiones/${revision.id}/items/${itemId}`, { conforme }
      )
      setRevision(res.data)
    } catch { /* silencioso */ }
  }

  async function handleCompletarRevision() {
    if (!revision) return
    try {
      const res = await api.post<RevisionSalaResponse>(
        `/revisiones/${revision.id}/completar`, {}
      )
      setRevision(res.data); await cargarDatos()
    } catch { /* silencioso */ }
  }

  const numEnClase    = [...salas.values()]
    .filter(s => s.estado === 'en_clase').length
  const numPendientes = [...salas.values()]
    .filter(s => s.estado === 'pendiente_revision').length
  const numRevisadas  = [...salas.values()]
    .filter(s => s.estado === 'revisada').length

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">

      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center
                      justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-h-primary">Vista de Salas</h1>

          {/* Navegador de fecha */}
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => {
                setFechaVista(sumarDias(fechaVista, -1))
                setSeleccionada(null)
              }}
              className="p-1 rounded-md text-h-tertiary transition-colors
                         hover:bg-h-elevated hover:text-h-secondary"
              title="Dia anterior">
              <ChevronLeft size={16} />
            </button>

            <span className="text-sm font-semibold text-h-primary min-w-[120px]
                             text-center">
              {formatearFechaLabel(fechaVista)}
            </span>

            <button
              onClick={() => {
                setFechaVista(sumarDias(fechaVista, 1))
                setSeleccionada(null)
              }}
              className="p-1 rounded-md text-h-tertiary transition-colors
                         hover:bg-h-elevated hover:text-h-secondary"
              title="Dia siguiente">
              <ChevronRight size={16} />
            </button>

            {!esHoy && (
              <button
                onClick={() => {
                  setFechaVista(new Date(hoy))
                  setSeleccionada(null)
                }}
                className="text-[10px] font-semibold px-2 py-1 rounded-md
                           transition-colors"
                style={{
                  background: 'var(--h-bg-elevated)',
                  color:      'var(--h-text-secondary)',
                  border:     '1px solid var(--h-border-subtle)',
                }}
              >
                Volver a hoy
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {numEnClase > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold
                             px-3 py-1.5 rounded-full"
              style={{
                background: 'rgba(29,158,117,0.12)',
                color: '#5dcaa5',
                border: '1px solid rgba(29,158,117,0.3)',
              }}>
              <span className="w-2 h-2 rounded-full bg-[#1D9E75]" />
              {numEnClase} en clase
            </span>
          )}
          {numPendientes > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold
                             px-3 py-1.5 rounded-full"
              style={{
                background: 'rgba(186,117,23,0.12)',
                color: '#EF9F27',
                border: '1px solid rgba(186,117,23,0.3)',
              }}>
              <span className="w-2 h-2 rounded-full bg-[#EF9F27]"
                style={{ animation: 'hestia-pulse 1.4s ease-in-out infinite' }} />
              {numPendientes} pendiente{numPendientes > 1 ? 's' : ''}
            </span>
          )}
          {numRevisadas > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold
                             px-3 py-1.5 rounded-full"
              style={{
                background: 'rgba(24,95,165,0.12)',
                color: '#378ADD',
                border: '1px solid rgba(24,95,165,0.3)',
              }}>
              <CheckCircle2 size={12} />
              {numRevisadas} revisada{numRevisadas > 1 ? 's' : ''}
            </span>
          )}

          {/* Selector de zona */}
          <div ref={dropRef} className="relative">
            <button onClick={() => setZonaDrop(p => !p)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm
                         font-semibold text-h-secondary border border-h-subtle
                         transition-colors hover:bg-h-elevated"
              style={{ background: 'var(--h-bg-elevated)' }}
            >
              <MapPin size={14} />
              {zona === 'piso-1' ? 'Piso -1' : 'Odontologia'}
              <ChevronDown size={13} style={{
                transform: zonaDrop ? 'rotate(180deg)' : 'rotate(0)',
                transition: 'transform 0.2s',
              }} />
            </button>
            {zonaDrop && (
              <div className="absolute right-0 top-full mt-1 rounded-xl shadow-lg
                               border border-h-subtle z-20 overflow-hidden"
                style={{ background: 'var(--h-bg-surface)', minWidth: '180px' }}
              >
                {(['piso-1','odontologia'] as Zona[]).map(z => (
                  <button key={z}
                    onClick={() => {
                      setZona(z); setZonaDrop(false); setSeleccionada(null)
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm font-medium
                               text-h-secondary transition-colors"
                    style={{
                      background: zona === z
                        ? 'var(--h-bg-elevated)' : 'transparent',
                      color: zona === z
                        ? 'var(--h-text-primary)' : undefined,
                    }}
                    onMouseEnter={e =>
                      (e.currentTarget.style.background =
                        'var(--h-bg-highlight)')}
                    onMouseLeave={e =>
                      (e.currentTarget.style.background =
                        zona === z ? 'var(--h-bg-elevated)' : 'transparent')}
                  >
                    {z === 'piso-1'
                      ? 'Piso -1 \u00b7 Simulacion'
                      : 'Odontologia \u00b7 Edificio anexo'}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button onClick={cargarDatos}
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
            <RefreshCw size={14}
              className={cargando ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Layout mapa + panel */}
      <div className="flex gap-0 rounded-2xl border border-h-subtle overflow-hidden"
        style={{ background: 'var(--h-bg-surface)', minHeight: '360px' }}
      >
        <div className="flex-1 p-5 flex flex-col gap-4"
          style={{ borderRight: '0.5px solid var(--h-border-subtle)' }}
        >
          {cargando ? (
            <div className="flex items-center justify-center h-full">
              <RefreshCw size={22}
                className="animate-spin text-h-tertiary" />
            </div>
          ) : zona === 'piso-1' ? (
            <MapaPisoMenos1 salas={salas} seleccionada={seleccionada}
              onSelect={handleSelect} />
          ) : (
            <MapaOdontologia salas={salas} seleccionada={seleccionada}
              onSelect={handleSelect} />
          )}

          {/* Leyenda */}
          <div className="flex flex-wrap gap-3 mt-auto">
            {(Object.entries(ESTADO_STYLE) as
              [EstadoSala, typeof ESTADO_STYLE[EstadoSala]][]).map(
              ([key, val]) => (
                <div key={key}
                  className="flex items-center gap-1.5 text-[10px]
                               text-h-tertiary">
                  <span className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{
                      background: val.fill,
                      border: `1px solid ${val.stroke}`,
                    }} />
                  {val.label}
                </div>
              )
            )}
          </div>
        </div>

        <div className="w-72 flex-shrink-0 p-5"
          style={{ minHeight: '360px' }}
        >
          <PanelSala
            info={infoSeleccionada}
            revision={revision}
            cargandoRev={cargandoRev}
            onIniciarRev={handleIniciarRevision}
            onItemChange={handleItemChange}
            onCompletarRev={handleCompletarRevision}
            puedeOperar={puedeOperar}
            esHoy={esHoy}
          />
        </div>
      </div>
    </div>
  )
}

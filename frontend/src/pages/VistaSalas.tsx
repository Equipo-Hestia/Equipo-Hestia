import { useState, useEffect, useRef, useCallback } from 'react'
import { MapPin, RefreshCw, CheckCircle2, Clock,
         ClipboardList, ChevronDown, AlertCircle } from 'lucide-react'
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
  | 'proxima'       // tiene taller hoy pero aun no empieza
  | 'en_clase'
  | 'pendiente_revision'
  | 'en_revision'
  | 'revisada'

interface SalaInfo {
  numero: string     // '010', '011', ...
  zona:   Zona
  estado: EstadoSala
  prog:   ProgramacionTallerResponse | null
  rev:    RevisionResumenResponse | null
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
  prog: ProgramacionTallerResponse | null,
  rev:  RevisionResumenResponse | null,
): EstadoSala {
  if (rev?.estado === 'completada')    return 'revisada'
  if (rev?.estado === 'en_revision')   return 'en_revision'

  if (!prog) return 'sin_actividad'

  const inicio = parseHHMM(prog.hora_inicio)
  const fin    = parseHHMM(prog.hora_fin)
  const ahora  = minutosActuales()

  if (inicio !== null && ahora < inicio) return 'proxima'
  if (fin    !== null && ahora >= fin)   return 'pendiente_revision'
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
  proxima:            { fill: 'var(--h-bg-elevated)',   stroke: 'var(--h-border-visible)',
                        text: 'var(--h-text-secondary)', label: 'Proxima clase' },
  en_clase:           { fill: '#0a2e22',                stroke: '#1D9E75',
                        text: '#5dcaa5',                 label: 'En clase' },
  pendiente_revision: { fill: '#2e1f08',                stroke: '#BA7517',
                        text: '#EF9F27',                 label: 'Pendiente revision' },
  en_revision:        { fill: '#0d1e2e',                stroke: '#378ADD',
                        text: '#85B7EB',                 label: 'En revision' },
  revisada:           { fill: '#0a2035',                stroke: '#185FA5',
                        text: '#378ADD',                 label: 'Revisada' },
}

// ---------------------------------------------------------------------------
// Geometria del mapa — coordenadas absolutas en viewBox 780x340
// Orientacion: entrada abajo al centro-derecha (igual al plano de Canva)
// Fila superior: 019 018 017 016 015 014 013 012 (de izq a der)
// Fila inferior: 020 021 022 Oficina Bodega  |  010
// 011 al fondo a la derecha del corredor interior
// ---------------------------------------------------------------------------

const W = 82   // ancho celda
const H = 100  // alto celda
const GAP = 2  // separacion entre celdas
const TOP_Y = 20
const BOT_Y = TOP_Y + H + 40  // fila inferior

// Fila superior izq->der: 019...012
const FILA_SUP = ['019','018','017','016','015','014','013','012']
const FILA_INF_IZQ = ['020','021','022']
const ESPECIALES = [
  { num: 'Oficina', clickable: false },
  { num: 'Bodega',  clickable: false },
]

function xSup(idx: number) { return 10 + idx * (W + GAP) }
function xInf(idx: number) { return 10 + idx * (W + GAP) }

// 010 y 011 a la derecha
const X_010 = 10 + 7 * (W + GAP)  // misma columna que 012 (der)
const X_011 = X_010               // justo debajo del corredor
const Y_011 = BOT_Y
const Y_010 = TOP_Y

// Corredor interior (lineas diagonales entre filas)
const CORREDOR_X1 = 10
const CORREDOR_X2 = 10 + 5 * (W + GAP)  // hasta antes de Bodega
const CORREDOR_Y_TOP = TOP_Y + H
const CORREDOR_Y_BOT = BOT_Y

// Odontologia: 3 salas verticales, viewBox propio 260x340
const ODO_SALAS = ['07','08','09']

// ---------------------------------------------------------------------------
// Componente SalaRect (SVG)
// ---------------------------------------------------------------------------

interface SalaRectProps {
  x: number; y: number; w: number; h: number
  numero: string
  estado: EstadoSala
  seleccionada: boolean
  clickable?: boolean
  onClick?: () => void
  pulsar?: boolean
}

function SalaRect(
  { x, y, w, h, numero, estado, seleccionada, clickable = true,
    onClick, pulsar }: SalaRectProps,
) {
  const st = ESTADO_STYLE[estado]
  const strokeW = seleccionada ? 2.5 : 1
  const strokeC = seleccionada ? '#5dcaa5' : st.stroke

  return (
    <g
      style={{ cursor: clickable ? 'pointer' : 'default' }}
      onClick={clickable ? onClick : undefined}
    >
      <rect
        x={x} y={y} width={w} height={h} rx={4}
        fill={st.fill}
        stroke={strokeC}
        strokeWidth={strokeW}
        opacity={clickable ? 1 : 0.55}
      />
      {/* punto pulsante si estado critico */}
      {pulsar && (
        <circle
          cx={x + w - 10} cy={y + 12} r={5}
          fill={st.stroke}
          style={{ animation: 'hestia-pulse 1.4s ease-in-out infinite' }}
        />
      )}
      <text
        x={x + w / 2} y={y + h / 2}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={14} fontWeight={500}
        fill={clickable ? st.text : 'var(--h-text-tertiary)'}
      >
        {numero}
      </text>
    </g>
  )
}

// ---------------------------------------------------------------------------
// Mapa Piso -1
// ---------------------------------------------------------------------------

interface MapaPisoProps {
  salas:        Map<string, SalaInfo>
  seleccionada: string | null
  onSelect:     (num: string) => void
}

function MapaPisoMenos1({ salas, seleccionada, onSelect }: MapaPisoProps) {
  const getSala = (num: string): SalaInfo => (
    salas.get(num) ?? {
      numero: num, zona: 'piso-1',
      estado: 'sin_actividad', prog: null, rev: null,
    }
  )

  return (
    <svg
      viewBox="0 0 780 280"
      style={{ width: '100%', maxHeight: '260px' }}
      role="img"
      aria-label="Plano piso -1 Escuela de Salud"
    >
      <defs>
        <style>{`
          @keyframes hestia-pulse {
            0%,100% { opacity:1; r:5; }
            50%      { opacity:0.4; r:7; }
          }
        `}</style>
      </defs>

      {/* ── Corredor interior (lineas) ── */}
      <line
        x1={CORREDOR_X1} y1={CORREDOR_Y_TOP}
        x2={CORREDOR_X2} y2={CORREDOR_Y_BOT}
        stroke="var(--h-border-subtle)" strokeWidth={0.5}
        strokeDasharray="4 3"
      />
      <line
        x1={CORREDOR_X2} y1={CORREDOR_Y_TOP}
        x2={CORREDOR_X2} y2={CORREDOR_Y_BOT}
        stroke="var(--h-border-subtle)" strokeWidth={0.5}
        strokeDasharray="4 3"
      />

      {/* ── Fila superior: 019 – 012 ── */}
      {FILA_SUP.map((num, i) => {
        const s = getSala(num)
        return (
          <SalaRect key={num}
            x={xSup(i)} y={TOP_Y} w={W} h={H}
            numero={num}
            estado={s.estado}
            seleccionada={seleccionada === num}
            onClick={() => onSelect(num)}
            pulsar={s.estado === 'pendiente_revision'}
          />
        )
      })}

      {/* ── Fila inferior izquierda: 020 021 022 ── */}
      {FILA_INF_IZQ.map((num, i) => {
        const s = getSala(num)
        return (
          <SalaRect key={num}
            x={xInf(i)} y={BOT_Y} w={W} h={H}
            numero={num}
            estado={s.estado}
            seleccionada={seleccionada === num}
            onClick={() => onSelect(num)}
            pulsar={s.estado === 'pendiente_revision'}
          />
        )
      })}

      {/* ── Oficina y Bodega (no clicables) ── */}
      {ESPECIALES.map((esp, i) => (
        <SalaRect key={esp.num}
          x={xInf(3 + i)} y={BOT_Y} w={W} h={H}
          numero={esp.num}
          estado="sin_actividad"
          seleccionada={false}
          clickable={false}
        />
      ))}

      {/* ── 010 (esquina superior derecha) ── */}
      {(() => {
        const s = getSala('010')
        return (
          <SalaRect
            x={X_010} y={Y_010} w={W} h={H}
            numero="010"
            estado={s.estado}
            seleccionada={seleccionada === '010'}
            onClick={() => onSelect('010')}
            pulsar={s.estado === 'pendiente_revision'}
          />
        )
      })()}

      {/* ── 011 (fila inferior derecha) ── */}
      {(() => {
        const s = getSala('011')
        return (
          <SalaRect
            x={X_011} y={Y_011} w={W} h={H}
            numero="011"
            estado={s.estado}
            seleccionada={seleccionada === '011'}
            onClick={() => onSelect('011')}
            pulsar={s.estado === 'pendiente_revision'}
          />
        )
      })()}

      {/* ── Marcadores de entrada (2 puertas) ── */}
      {/* Entrada principal inferior-centro */}
      <g transform={`translate(${xInf(2) + W / 2},${BOT_Y + H + 6})`}>
        <line x1={0} y1={0} x2={0} y2={16}
          stroke="#1D9E75" strokeWidth={1.5} />
        <polygon points="-6,16 6,16 0,24"
          fill="#1D9E75" />
        <text x={0} y={36} textAnchor="middle"
          fontSize={9} fill="var(--h-text-tertiary)">Entrada</text>
      </g>
      {/* Entrada secundaria derecha (junto a 010) */}
      <g transform={`translate(${X_010 + W + 10},${TOP_Y + H / 2})`}>
        <line x1={0} y1={0} x2={16} y2={0}
          stroke="var(--h-border-visible)" strokeWidth={1}
          strokeDasharray="3 2" />
        <text x={20} y={4} textAnchor="start"
          fontSize={9} fill="var(--h-text-tertiary)">Entrada
sec.</text>
      </g>

      {/* Etiqueta de piso */}
      <text
        x={10} y={12}
        fontSize={10} fontWeight={500}
        fill="var(--h-text-tertiary)"
      >Piso -1</text>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Mapa Odontologia
// ---------------------------------------------------------------------------

function MapaOdontologia({ salas, seleccionada, onSelect }: MapaPisoProps) {
  const getSala = (num: string): SalaInfo => (
    salas.get(num) ?? {
      numero: num, zona: 'odontologia',
      estado: 'sin_actividad', prog: null, rev: null,
    }
  )
  return (
    <svg
      viewBox="0 0 300 280"
      style={{ width: '100%', maxWidth: '260px', maxHeight: '260px' }}
      role="img"
      aria-label="Salas de odontologia"
    >
      <defs>
        <style>{`
          @keyframes hestia-pulse {
            0%,100% { opacity:1; r:5; }
            50%      { opacity:0.4; r:7; }
          }
        `}</style>
      </defs>
      <text x={10} y={14} fontSize={10} fontWeight={500}
        fill="var(--h-text-tertiary)">Odontologia</text>
      <text x={10} y={26} fontSize={8}
        fill="var(--h-text-tertiary)">Edificio anexo</text>
      {ODO_SALAS.map((num, i) => {
        const s = getSala(num)
        return (
          <SalaRect key={num}
            x={10} y={35 + i * (H + GAP)} w={W + 20} h={H}
            numero={`Sala ${num}`}
            estado={s.estado}
            seleccionada={seleccionada === num}
            onClick={() => onSelect(num)}
            pulsar={s.estado === 'pendiente_revision'}
          />
        )
      })}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Panel lateral de informacion
// ---------------------------------------------------------------------------

interface PanelProps {
  info:         SalaInfo | null
  revision:     RevisionSalaResponse | null
  cargandoRev:  boolean
  onIniciarRev: () => void
  onItemChange: (itemId: number, conforme: boolean, cantidad?: number) => void
  onCompletarRev: () => void
  puedeOperar:  boolean
}

function PanelSala(
  { info, revision, cargandoRev, onIniciarRev,
    onItemChange, onCompletarRev, puedeOperar }: PanelProps,
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

  const st  = ESTADO_STYLE[info.estado]
  const prog = info.prog

  const labelCls = 'text-[10px] font-semibold text-h-tertiary uppercase tracking-widest mb-1'
  const valCls   = 'text-sm font-semibold text-h-primary'

  // Conteo de items del checklist
  const totalItems   = revision?.items.length ?? 0
  const itemsOk      = revision?.items.filter(it => it.conforme === true).length ?? 0
  const progChecklist = totalItems > 0 ? Math.round((itemsOk / totalItems) * 100) : 0

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto pr-1">

      {/* Encabezado de sala */}
      <div>
        <span
          className="inline-flex items-center gap-1.5 text-xs font-semibold
                     px-2.5 py-1 rounded-full mb-2"
          style={{
            background: st.fill,
            color:      st.text,
            border:     `1px solid ${st.stroke}`,
          }}
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: st.stroke }}
          />
          {st.label}
        </span>
        <h2 className="text-xl font-bold text-h-primary">
          Sala {info.numero}
        </h2>
      </div>

      {/* Sin actividad */}
      {(info.estado === 'sin_actividad') && (
        <p className="text-sm text-h-secondary">
          No hay actividad programada para hoy en esta sala.
        </p>
      )}

      {/* Con programacion */}
      {prog && (
        <div className="space-y-3">
          <div>
            <p className={labelCls}>Taller</p>
            <p className={valCls}>{prog.taller_nombre ?? '—'}</p>
          </div>
          {prog.asignatura_nombre && (
            <div>
              <p className={labelCls}>Asignatura</p>
              <p className={valCls}>{prog.asignatura_nombre}</p>
            </div>
          )}
          <div>
            <p className={labelCls}>Docente</p>
            <p className={valCls}>{prog.docente_nombre ?? '—'}</p>
          </div>
          <div>
            <p className={labelCls}>Seccion</p>
            <p className={valCls}>{prog.seccion ?? '—'}</p>
          </div>
          <div>
            <p className={labelCls}>Horario</p>
            <p className={valCls}>
              {prog.hora_inicio ?? '?'} – {prog.hora_fin ?? '?'}
            </p>
          </div>
        </div>
      )}

      {/* Countdown en clase */}
      {info.estado === 'en_clase' && (
        <div
          className="rounded-xl p-3 text-center"
          style={{
            background: 'var(--h-bg-elevated)',
            border:     '1px solid var(--h-border-subtle)',
          }}
        >
          <p className="text-[10px] text-h-tertiary uppercase tracking-widest mb-1">
            Tiempo restante
          </p>
          <p
            className="text-3xl font-bold font-mono"
            style={{ color: segs < 300 ? '#EF9F27' : '#1D9E75' }}
          >
            {fmtCountdown(segs)}
          </p>
          <p className="text-[10px] text-h-tertiary mt-1">
            Termina a las {prog?.hora_fin}
          </p>
        </div>
      )}

      {/* Proxima clase */}
      {info.estado === 'proxima' && (
        <div
          className="rounded-xl p-3 flex items-center gap-2"
          style={{
            background: 'var(--h-bg-elevated)',
            border:     '1px solid var(--h-border-subtle)',
          }}
        >
          <Clock size={16} className="text-h-tertiary flex-shrink-0" />
          <p className="text-xs text-h-secondary">
            Clase comienza a las{' '}
            <span className="font-bold text-h-primary">{prog?.hora_inicio}</span>
          </p>
        </div>
      )}

      {/* Pendiente revision / en revision / revisada */}
      {(['pendiente_revision','en_revision','revisada']
        .includes(info.estado)) && (
        <div className="space-y-3">

          {/* Alerta pendiente */}
          {info.estado === 'pendiente_revision' && !revision && (
            <div
              className="rounded-xl p-3 flex items-start gap-2"
              style={{
                background: '#2e1f08',
                border:     '1px solid #BA7517',
              }}
            >
              <AlertCircle size={15} style={{ color: '#EF9F27', flexShrink: 0, marginTop: 1 }} />
              <p className="text-xs" style={{ color: '#EF9F27' }}>
                El taller finalizo. Esta sala necesita revision.
              </p>
            </div>
          )}

          {/* Boton iniciar revision */}
          {puedeOperar
            && info.estado === 'pendiente_revision'
            && !revision
            && !cargandoRev && (
            <button
              onClick={onIniciarRev}
              className="w-full flex items-center justify-center gap-2
                         py-2.5 rounded-xl text-sm font-semibold text-white
                         transition-colors"
              style={{ background: 'var(--h-teal-rest)' }}
              onMouseEnter={e =>
                (e.currentTarget.style.background = 'var(--h-teal-hover)')}
              onMouseLeave={e =>
                (e.currentTarget.style.background = 'var(--h-teal-rest)')}
            >
              <ClipboardList size={15} />
              Iniciar revision de sala
            </button>
          )}

          {cargandoRev && (
            <div className="flex justify-center py-4">
              <RefreshCw size={18} className="animate-spin text-h-tertiary" />
            </div>
          )}

          {/* Checklist */}
          {revision && revision.estado !== 'completada' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold text-h-tertiary
                               uppercase tracking-widest">
                  Checklist ({itemsOk}/{totalItems})
                </p>
                <span className="text-xs font-bold"
                  style={{ color: progChecklist === 100 ? '#1D9E75' : '#EF9F27' }}>
                  {progChecklist}%
                </span>
              </div>

              {/* Barra de progreso */}
              <div
                className="w-full rounded-full h-1.5"
                style={{ background: 'var(--h-bg-highlight)' }}
              >
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width:      `${progChecklist}%`,
                    background: progChecklist === 100 ? '#1D9E75' : '#EF9F27',
                  }}
                />
              </div>

              {/* Items */}
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
                    }}
                  >
                    <button
                      onClick={() =>
                        onItemChange(
                          item.id,
                          item.conforme !== true,
                          item.cantidad_esperada ?? undefined,
                        )
                      }
                      className="w-5 h-5 rounded flex-shrink-0 flex items-center
                                 justify-center border transition-colors"
                      style={{
                        borderColor: item.conforme === true
                          ? '#1D9E75' : 'var(--h-border-visible)',
                        background: item.conforme === true
                          ? '#1D9E75' : 'transparent',
                      }}
                      title={item.conforme === true ? 'Marcar no conforme' : 'Marcar conforme'}
                    >
                      {item.conforme === true && (
                        <CheckCircle2 size={12} color="white" strokeWidth={2.5} />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-h-primary truncate">
                        {item.nombre}
                      </p>
                      {item.cantidad_esperada !== null &&
                       item.cantidad_esperada !== undefined && (
                        <p className="text-[10px] text-h-tertiary">
                          Esperado: {item.cantidad_esperada} unidades
                        </p>
                      )}
                    </div>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0"
                      style={{
                        background: item.tipo === 'activo_fijo'
                          ? 'rgba(55,138,221,0.15)'
                          : 'rgba(29,158,117,0.15)',
                        color: item.tipo === 'activo_fijo' ? '#85B7EB' : '#5dcaa5',
                      }}
                    >
                      {item.tipo === 'activo_fijo' ? 'AF' : item.tipo === 'implemento' ? 'IMP' : 'INS'}
                    </span>
                  </div>
                ))}
              </div>

              {/* Boton completar */}
              {progChecklist === 100 && puedeOperar && (
                <button
                  onClick={onCompletarRev}
                  className="w-full flex items-center justify-center gap-2
                             py-2.5 rounded-xl text-sm font-semibold text-white
                             transition-colors mt-2"
                  style={{ background: '#1D9E75' }}
                  onMouseEnter={e =>
                    (e.currentTarget.style.background = '#0F6E56')}
                  onMouseLeave={e =>
                    (e.currentTarget.style.background = '#1D9E75')}
                >
                  <CheckCircle2 size={15} />
                  Marcar sala como revisada
                </button>
              )}
            </div>
          )}

          {/* Estado revisada */}
          {info.estado === 'revisada' && (
            <div
              className="rounded-xl p-3 flex items-center gap-2"
              style={{
                background: 'rgba(29,158,117,0.08)',
                border:     '1px solid rgba(29,158,117,0.3)',
              }}
            >
              <CheckCircle2 size={16} style={{ color: '#1D9E75', flexShrink: 0 }} />
              <div>
                <p className="text-xs font-semibold" style={{ color: '#5dcaa5' }}>
                  Sala revisada
                </p>
                {revision?.operador_nombre && (
                  <p className="text-[10px] text-h-tertiary">
                    por {revision.operador_nombre}
                    {revision.hora_fin_rev && ` a las ${revision.hora_fin_rev}`}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pagina principal
// ---------------------------------------------------------------------------

const ROLES_OPERADOR = ['admin', 'operador_coordinador', 'operador']

const TODAS_SALAS_PISO1 = [
  '010','011','012','013','014','015','016','017','018','019','020','021','022',
]
const TODAS_SALAS_ODO = ['07','08','09']

function normalizarNumeroSala(nombreBD: string): string {
  // 'Sala 010' -> '010', 'Sala 07' -> '07'
  const m = nombreBD.match(/(\d+)$/)
  return m ? m[1].replace(/^0*(\d{2,})$/, '$1').padStart(3, '0') : nombreBD
}

export function VistaSalas() {
  const { user } = useAuthStore()
  const puedeOperar = user?.rol ? ROLES_OPERADOR.includes(user.rol) : false

  const [zona,            setZona]            = useState<Zona>('piso-1')
  const [programaciones,  setProgramaciones]  =
    useState<ProgramacionTallerResponse[]>([])
  const [revisiones,      setRevisiones]      =
    useState<RevisionResumenResponse[]>([])
  const [cargando,        setCargando]        = useState(true)
  const [seleccionada,    setSeleccionada]    = useState<string | null>(null)
  const [revision,        setRevision]        =
    useState<RevisionSalaResponse | null>(null)
  const [cargandoRev,     setCargandoRev]     = useState(false)
  const [zonaDrop,        setZonaDrop]        = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node))
        setZonaDrop(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  const cargarDatos = useCallback(async () => {
    setCargando(true)
    try {
      const [pRes, rRes] = await Promise.all([
        api.get<ProgramacionTallerResponse[]>('/programacion/hoy'),
        api.get<RevisionResumenResponse[]>('/revisiones/hoy'),
      ])
      setProgramaciones(pRes.data)
      setRevisiones(rRes.data)
    } catch { /* silencioso */ }
    finally { setCargando(false) }
  }, [])

  useEffect(() => { cargarDatos() }, [cargarDatos])

  // Refresco automatico cada 60s
  useEffect(() => {
    const id = setInterval(cargarDatos, 60_000)
    return () => clearInterval(id)
  }, [cargarDatos])

  // Construir mapa de SalaInfo
  const salaMap = useCallback((): Map<string, SalaInfo> => {
    const todasSalas = zona === 'piso-1' ? TODAS_SALAS_PISO1 : TODAS_SALAS_ODO
    const map = new Map<string, SalaInfo>()

    todasSalas.forEach(num => {
      const prog = programaciones.find(p => {
        if (!p.sala_nombre) return false
        return normalizarNumeroSala(p.sala_nombre) === num
      }) ?? null

      const rev = prog
        ? revisiones.find(r => r.programacion_id === prog.id) ?? null
        : null

      map.set(num, {
        numero: num,
        zona:   zona,
        estado: calcularEstado(prog, rev),
        prog,
        rev,
      })
    })
    return map
  }, [programaciones, revisiones, zona])

  const salas = salaMap()
  const infoSeleccionada = seleccionada ? salas.get(seleccionada) ?? null : null

  // Cargar detalle de revision al seleccionar sala
  useEffect(() => {
    if (!infoSeleccionada?.rev) { setRevision(null); return }
    api.get<RevisionSalaResponse>(`/revisiones/${infoSeleccionada.rev.id}`)
      .then(r => setRevision(r.data))
      .catch(() => setRevision(null))
  }, [infoSeleccionada?.rev?.id])

  async function handleIniciarRevision() {
    if (!infoSeleccionada?.prog) return
    setCargandoRev(true)
    try {
      const res = await api.post<RevisionSalaResponse>('/revisiones/', {
        programacion_id: infoSeleccionada.prog.id,
      })
      setRevision(res.data)
      await cargarDatos()
    } catch { /* silencioso */ }
    finally { setCargandoRev(false) }
  }

  async function handleItemChange(
    itemId: number, conforme: boolean, _cantidad?: number,
  ) {
    if (!revision) return
    try {
      const res = await api.patch<RevisionSalaResponse>(
        `/revisiones/${revision.id}/items/${itemId}`,
        { conforme },
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
      setRevision(res.data)
      await cargarDatos()
    } catch { /* silencioso */ }
  }

  // Contadores de resumen
  const numEnClase    = [...salas.values()].filter(s => s.estado === 'en_clase').length
  const numPendientes = [...salas.values()].filter(
    s => s.estado === 'pendiente_revision'
  ).length
  const numRevisadas  = [...salas.values()].filter(s => s.estado === 'revisada').length

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">

      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-h-primary">Vista de Salas</h1>
          <p className="text-sm text-h-secondary mt-0.5">
            {new Date().toLocaleDateString('es-CL', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            })}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Chips de resumen */}
          {numEnClase > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold
                             px-3 py-1.5 rounded-full"
              style={{
                background: 'rgba(29,158,117,0.12)',
                color:      '#5dcaa5',
                border:     '1px solid rgba(29,158,117,0.3)',
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
                color:      '#EF9F27',
                border:     '1px solid rgba(186,117,23,0.3)',
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
                color:      '#378ADD',
                border:     '1px solid rgba(24,95,165,0.3)',
              }}>
              <CheckCircle2 size={12} />
              {numRevisadas} revisada{numRevisadas > 1 ? 's' : ''}
            </span>
          )}

          {/* Selector de zona */}
          <div ref={dropRef} className="relative">
            <button
              onClick={() => setZonaDrop(p => !p)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm
                         font-semibold text-h-secondary border border-h-subtle
                         transition-colors hover:bg-h-elevated"
              style={{ background: 'var(--h-bg-elevated)' }}
            >
              <MapPin size={14} />
              {zona === 'piso-1' ? 'Piso -1' : 'Odontologia'}
              <ChevronDown size={13}
                style={{
                  transform: zonaDrop ? 'rotate(180deg)' : 'rotate(0)',
                  transition: 'transform 0.2s',
                }} />
            </button>
            {zonaDrop && (
              <div
                className="absolute right-0 top-full mt-1 rounded-xl shadow-lg
                           border border-h-subtle z-20 overflow-hidden"
                style={{ background: 'var(--h-bg-surface)', minWidth: '180px' }}
              >
                {(['piso-1','odontologia'] as Zona[]).map(z => (
                  <button key={z}
                    onClick={() => { setZona(z); setZonaDrop(false); setSeleccionada(null) }}
                    className="w-full text-left px-4 py-2.5 text-sm font-medium
                               text-h-secondary transition-colors"
                    style={{
                      background: zona === z
                        ? 'var(--h-bg-elevated)' : 'transparent',
                      color: zona === z
                        ? 'var(--h-text-primary)' : undefined,
                    }}
                    onMouseEnter={e =>
                      (e.currentTarget.style.background = 'var(--h-bg-highlight)')}
                    onMouseLeave={e =>
                      (e.currentTarget.style.background =
                        zona === z ? 'var(--h-bg-elevated)' : 'transparent')}
                  >
                    {z === 'piso-1' ? 'Piso -1 · Simulacion' : 'Odontologia · Edificio anexo'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Boton refrescar */}
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
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Layout mapa + panel */}
      <div
        className="flex gap-0 rounded-2xl border border-h-subtle overflow-hidden"
        style={{ background: 'var(--h-bg-surface)', minHeight: '360px' }}
      >
        {/* Mapa */}
        <div
          className="flex-1 p-5 flex flex-col gap-4"
          style={{ borderRight: '0.5px solid var(--h-border-subtle)' }}
        >
          {cargando ? (
            <div className="flex items-center justify-center h-full">
              <RefreshCw size={22} className="animate-spin text-h-tertiary" />
            </div>
          ) : zona === 'piso-1' ? (
            <MapaPisoMenos1
              salas={salas}
              seleccionada={seleccionada}
              onSelect={setSeleccionada}
            />
          ) : (
            <MapaOdontologia
              salas={salas}
              seleccionada={seleccionada}
              onSelect={setSeleccionada}
            />
          )}

          {/* Leyenda */}
          <div className="flex flex-wrap gap-3 mt-auto">
            {(Object.entries(ESTADO_STYLE) as [EstadoSala, typeof ESTADO_STYLE[EstadoSala]][]).map(
              ([key, val]) => (
                <div key={key}
                  className="flex items-center gap-1.5 text-[10px] text-h-tertiary">
                  <span
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{
                      background: val.fill,
                      border:     `1px solid ${val.stroke}`,
                    }}
                  />
                  {val.label}
                </div>
              )
            )}
          </div>
        </div>

        {/* Panel lateral */}
        <div
          className="w-72 flex-shrink-0 p-5"
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
          />
        </div>
      </div>
    </div>
  )
}

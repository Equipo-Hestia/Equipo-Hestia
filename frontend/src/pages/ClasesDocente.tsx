import { useEffect, useState, useCallback, Fragment } from 'react'
import {
  GraduationCap, Plus, Pencil, CheckCircle,
  ToggleLeft, ToggleRight, ChevronDown, ChevronRight,
  RefreshCw, MessageSquare, AlertTriangle, X,
  ThumbsUp, ThumbsDown, Minus,
} from 'lucide-react'
import { api } from '../api/client'
import type {
  ClaseDocenteResponse, AsignaturaResponse,
  DocenteResponse, ComentarioDocenteResponse, TipoComentario,
} from '../types/api'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { TableRowSkeleton } from '../components/ui/Skeleton'
import { HSelect } from '../components/ui/HSelect'
import { useLastUpdated } from '../hooks/useLastUpdated'
import { useAuthStore } from '../store/auth'

function semestreActual(): string {
  const now = new Date()
  const s = now.getMonth() + 1 <= 7 ? '1' : '2'
  return `${now.getFullYear()}-${s}`
}

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const TIPO_COM_OPTS: { value: TipoComentario; label: string }[] = [
  { value: 'positivo', label: 'Positivo' },
  { value: 'negativo', label: 'Negativo' },
  { value: 'neutro',   label: 'Neutro'   },
]

const TIPO_COM_VARIANT: Record<TipoComentario, 'success' | 'danger' | 'info'> = {
  positivo: 'success',
  negativo: 'danger',
  neutro:   'info',
}

const TIPO_COM_ICON: Record<TipoComentario, React.ReactElement> = {
  positivo: <ThumbsUp  size={12} />,
  negativo: <ThumbsDown size={12} />,
  neutro:   <Minus size={12} />,
}

// ---------------------------------------------------------------------------
// Tipos de formulario
// ---------------------------------------------------------------------------

interface FormClase {
  docente_id:    string
  asignatura_id: string
  seccion:       string
  semestre:      string
}

interface FormDocente {
  nombre:   string
  email:    string
  rut:      string
  telefono: string
}

const CLASE_VACIA: FormClase = {
  docente_id: '', asignatura_id: '',
  seccion: '', semestre: semestreActual(),
}

const DOCENTE_VACIO: FormDocente = {
  nombre: '', email: '', rut: '', telefono: '',
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function ClasesDocente() {
  const { user } = useAuthStore()
  const esCoord = user?.rol === 'operador_coordinador'

  // -- Docentes --
  const [docentes, setDocentes]               = useState<DocenteResponse[]>([])
  const [loadingDocentes, setLoadingDocentes] = useState(true)
  const [inclInactivos, setInclInactivos]     = useState(false)
  const [rowHoverDoc, setRowHoverDoc]         = useState<number | null>(null)

  // -- Clases --
  const [clases, setClases]         = useState<ClaseDocenteResponse[]>([])
  const [loadingClases, setLoading] = useState(true)
  const [asignaturas, setAsig]      = useState<AsignaturaResponse[]>([])
  const [soloActivas, setSoloAct]   = useState(true)
  const [filtroDocente, setFilDoc]  = useState<string>('')
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set())
  const [rowHoverClase, setRowHoverClase] = useState<number | null>(null)

  // -- Modales --
  const [showModalDocente, setShowModalDocente] = useState(false)
  const [editDocente, setEditDocente]           = useState<DocenteResponse | null>(null)
  const [showModalClase, setShowModalClase]     = useState(false)
  const [editClase, setEditClase]               = useState<ClaseDocenteResponse | null>(null)
  const [showModalComentarios, setShowModalCom] = useState(false)
  const [comentDocente, setComentDocente]       = useState<DocenteResponse | null>(null)
  const [comentarios, setComentarios]           = useState<ComentarioDocenteResponse[]>([])
  const [loadingCom, setLoadingCom]             = useState(false)

  // -- Formularios --
  const [formDoc, setFormDoc]     = useState<FormDocente>(DOCENTE_VACIO)
  const [formClase, setFormClase] = useState<FormClase>(CLASE_VACIA)
  const [formCom, setFormCom]     = useState<{ tipo: TipoComentario; contenido: string }>({
    tipo: 'neutro', contenido: '',
  })
  const [saving, setSaving]         = useState(false)
  const [savingCom, setSavingCom]   = useState(false)
  const [formError, setFormError]   = useState<string | null>(null)
  const [toast, setToast]           = useState<string | null>(null)

  const { labelTiempo, marcarActualizado } = useLastUpdated()

  function showToast(msg: string) {
    setToast(msg); setTimeout(() => setToast(null), 3500)
  }

  // -- Cargas --

  const loadDocentes = useCallback(async () => {
    setLoadingDocentes(true)
    try {
      const { data } = await api.get<DocenteResponse[]>('/docentes/', {
        params: { incluir_inactivos: inclInactivos },
      })
      setDocentes(data)
      marcarActualizado()
    } finally { setLoadingDocentes(false) }
  }, [inclInactivos, marcarActualizado])

  const loadClases = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = { solo_activas: soloActivas }
      if (filtroDocente) params.docente_id = parseInt(filtroDocente)
      const { data } = await api.get<ClaseDocenteResponse[]>('/clases-docente/', { params })
      setClases(data)
    } finally { setLoading(false) }
  }, [soloActivas, filtroDocente])

  useEffect(() => { loadDocentes() }, [loadDocentes])
  useEffect(() => { loadClases()   }, [loadClases])

  useEffect(() => {
    api.get<AsignaturaResponse[]>('/asignaturas/')
      .then(r => setAsig(r.data))
      .catch(() => {})
  }, [])

  // -- Agrupacion de clases por docente --
  interface DocenteGrupo {
    docente_id: number
    docente_nombre: string
    clases: ClaseDocenteResponse[]
  }

  const grupos: DocenteGrupo[] = []
  for (const c of clases) {
    let g = grupos.find(x => x.docente_id === c.docente_id)
    if (!g) {
      g = { docente_id: c.docente_id, docente_nombre: c.docente_nombre, clases: [] }
      grupos.push(g)
    }
    g.clases.push(c)
  }
  grupos.sort((a, b) => a.docente_nombre.localeCompare(b.docente_nombre, 'es'))

  function toggleExpandido(id: number) {
    setExpandidos(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ---------------------------------------------------------------------------
  // Docentes: abrir/cerrar modal
  // ---------------------------------------------------------------------------

  function abrirCrearDocente() {
    setFormDoc(DOCENTE_VACIO); setFormError(null)
    setEditDocente(null); setShowModalDocente(true)
  }

  function abrirEditarDocente(d: DocenteResponse) {
    setFormDoc({
      nombre: d.nombre, email: d.email,
      rut: d.rut ?? '', telefono: d.telefono ?? '',
    })
    setFormError(null); setEditDocente(d); setShowModalDocente(true)
  }

  async function handleSubmitDocente(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setFormError(null)
    try {
      if (editDocente) {
        await api.put(`/docentes/${editDocente.id}`, {
          nombre: formDoc.nombre,
          email: formDoc.email,
          rut: formDoc.rut || null,
          telefono: formDoc.telefono || null,
        })
        showToast('Docente actualizado')
      } else {
        await api.post('/docentes/', {
          nombre: formDoc.nombre,
          email: formDoc.email,
          rut: formDoc.rut || null,
          telefono: formDoc.telefono || null,
        })
        showToast('Docente creado')
      }
      setShowModalDocente(false); loadDocentes()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        .response?.data?.detail
      setFormError(msg ?? 'Error al guardar.')
    } finally { setSaving(false) }
  }

  async function toggleActivoDocente(d: DocenteResponse) {
    try {
      await api.put(`/docentes/${d.id}`, { activo: !d.activo })
      showToast(d.activo ? 'Docente desactivado' : 'Docente reactivado')
      loadDocentes()
    } catch { showToast('Error al cambiar el estado.') }
  }

  // ---------------------------------------------------------------------------
  // Comentarios
  // ---------------------------------------------------------------------------

  async function abrirComentarios(d: DocenteResponse) {
    setComentDocente(d)
    setFormCom({ tipo: 'neutro', contenido: '' })
    setShowModalCom(true)
    setLoadingCom(true)
    try {
      const { data } = await api.get<ComentarioDocenteResponse[]>(
        `/docentes/${d.id}/comentarios`
      )
      setComentarios(data)
    } catch { setComentarios([]) }
    finally { setLoadingCom(false) }
  }

  async function handleSubmitComentario(e: React.FormEvent) {
    e.preventDefault()
    if (!formCom.contenido.trim() || !comentDocente) return
    setSavingCom(true)
    try {
      const { data } = await api.post<ComentarioDocenteResponse>(
        `/docentes/${comentDocente.id}/comentarios`,
        { tipo: formCom.tipo, contenido: formCom.contenido.trim() }
      )
      setComentarios(prev => [data, ...prev])
      setFormCom({ tipo: 'neutro', contenido: '' })
      showToast('Comentario registrado')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        .response?.data?.detail
      showToast(msg ?? 'Error al guardar el comentario.')
    } finally { setSavingCom(false) }
  }

  // ---------------------------------------------------------------------------
  // Clases: abrir/cerrar modal
  // ---------------------------------------------------------------------------

  function abrirCrearClase() {
    setFormClase(CLASE_VACIA); setFormError(null)
    setEditClase(null); setShowModalClase(true)
  }

  function abrirEditarClase(c: ClaseDocenteResponse) {
    setFormClase({
      docente_id: String(c.docente_id),
      asignatura_id: String(c.asignatura_id),
      seccion: c.seccion,
      semestre: c.semestre,
    })
    setFormError(null); setEditClase(c); setShowModalClase(true)
  }

  async function handleSubmitClase(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setFormError(null)
    try {
      if (editClase) {
        await api.put(`/clases-docente/${editClase.id}`, {
          seccion: formClase.seccion,
          semestre: formClase.semestre,
        })
        showToast('Clase actualizada')
      } else {
        await api.post('/clases-docente/', {
          docente_id:    parseInt(formClase.docente_id),
          asignatura_id: parseInt(formClase.asignatura_id),
          seccion:       formClase.seccion,
          semestre:      formClase.semestre,
        })
        showToast('Clase asignada')
      }
      setShowModalClase(false); loadClases()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        .response?.data?.detail
      setFormError(msg ?? 'Error al guardar.')
    } finally { setSaving(false) }
  }

  async function toggleActivaClase(e: React.MouseEvent, c: ClaseDocenteResponse) {
    e.stopPropagation()
    try {
      await api.put(`/clases-docente/${c.id}`, { activa: !c.activa })
      showToast(c.activa ? 'Clase desactivada' : 'Clase reactivada')
      loadClases()
    } catch { showToast('Error al cambiar el estado') }
  }

  // ---------------------------------------------------------------------------
  // Opciones para HSelect
  // ---------------------------------------------------------------------------

  const docenteOpts = docentes.map(d => ({ value: String(d.id), label: d.nombre }))
  const asigOpts    = asignaturas.map(a => ({ value: String(a.id), label: `${a.nombre} (${a.codigo})` }))

  const inputCls = `
    w-full px-3 py-2.5 rounded-lg border border-h-visible
    text-h-primary text-sm bg-h-elevated
    placeholder:text-h-tertiary
    focus:outline-none transition-all
  `

  return (
    <div className="p-8 w-full">

      {/* Toast */}
      {toast && (
        <div
          className="
            fixed top-6 right-6 z-50 flex items-center gap-2
            px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white
          "
          style={{ background: 'var(--h-teal-rest)' }}
        >
          <CheckCircle size={16} />{toast}
        </div>
      )}

      {/* ================================================================
          SECCION 1: DOCENTES
      ================================================================ */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-black text-h-primary flex items-center gap-2">
            <GraduationCap size={22} className="text-h-accent" />
            Docentes
          </h1>
          <p className="text-h-secondary text-sm mt-0.5">
            {loadingDocentes
              ? '...'
              : `${docentes.length} docente${docentes.length !== 1 ? 's' : ''} registrado${docentes.length !== 1 ? 's' : ''}`
            }
          </p>
          <p className="text-xs text-h-tertiary mt-1">{labelTiempo}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { loadDocentes(); loadClases() }}
            title="Actualizar"
            className="p-2 rounded-lg border border-h-subtle bg-h-elevated
                       text-h-tertiary transition-colors duration-150"
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-bg-highlight)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--h-bg-elevated)')}
          >
            <RefreshCw size={15} />
          </button>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox" checked={inclInactivos}
              onChange={e => setInclInactivos(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm font-semibold text-h-secondary">
              Mostrar inactivos
            </span>
          </label>
          <button
            onClick={abrirCrearDocente}
            className="flex items-center gap-2 text-white font-bold
                       px-4 py-2.5 rounded-xl text-sm transition-colors duration-150"
            style={{ background: 'var(--h-teal-rest)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-teal-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--h-teal-rest)')}
          >
            <Plus size={16} /> Nuevo docente
          </button>
        </div>
      </div>

      <div className="bg-h-surface rounded-xl border border-h-subtle overflow-hidden mb-10">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-h-subtle bg-h-elevated">
                {['Nombre', 'Email', 'RUT', 'Tel\u00e9fono', 'Clases activas', 'Estado', 'Acciones'].map(h => (
                  <th key={h}
                    className="text-left px-4 py-3 text-xs font-bold
                               text-h-tertiary uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingDocentes ? (
                Array.from({ length: 4 }).map((_, i) =>
                  <TableRowSkeleton key={i} cols={7} />
                )
              ) : docentes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-14">
                    <GraduationCap size={28}
                      className="mx-auto mb-2 text-h-tertiary opacity-40" />
                    <p className="font-semibold text-h-secondary">
                      Sin docentes registrados
                    </p>
                    <p className="text-xs text-h-tertiary mt-1">
                      Crea el primer docente con el botón de arriba.
                    </p>
                  </td>
                </tr>
              ) : docentes.map(d => (
                <tr
                  key={d.id}
                  style={{
                    background: rowHoverDoc === d.id
                      ? 'var(--h-bg-highlight)' : 'transparent',
                    opacity: d.activo ? 1 : 0.55,
                  }}
                  className="border-b border-h-subtle transition-colors"
                  onMouseEnter={() => setRowHoverDoc(d.id)}
                  onMouseLeave={() => setRowHoverDoc(null)}
                >
                  <td className="px-4 py-3 font-semibold text-h-primary">
                    {d.nombre}
                  </td>
                  <td className="px-4 py-3 text-h-secondary text-xs">
                    {d.email}
                  </td>
                  <td className="px-4 py-3 text-h-secondary font-mono text-xs">
                    {d.rut ?? <span className="text-h-tertiary">—</span>}
                  </td>
                  <td className="px-4 py-3 text-h-secondary text-xs">
                    {d.telefono ?? <span className="text-h-tertiary">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="
                        font-mono text-xs text-h-secondary
                        bg-h-elevated border border-h-subtle
                        px-2 py-0.5 rounded-full
                      "
                    >
                      {d.num_clases}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {d.activo
                      ? <Badge variant="success">Activo</Badge>
                      : <Badge variant="danger">Inactivo</Badge>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => abrirEditarDocente(d)}
                        title="Editar"
                        className="p-1.5 rounded-lg text-h-tertiary transition-colors duration-150"
                        onMouseEnter={e => {
                          e.currentTarget.style.background = 'var(--h-teal-subtle)'
                          e.currentTarget.style.color = 'var(--h-teal-hover)'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.color = 'var(--h-text-tertiary)'
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                      {esCoord && (
                        <button
                          onClick={() => abrirComentarios(d)}
                          title="Ver comentarios"
                          className="p-1.5 rounded-lg text-h-tertiary transition-colors duration-150"
                          onMouseEnter={e => {
                            e.currentTarget.style.background = 'var(--h-teal-subtle)'
                            e.currentTarget.style.color = 'var(--h-teal-hover)'
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = 'transparent'
                            e.currentTarget.style.color = 'var(--h-text-tertiary)'
                          }}
                        >
                          <MessageSquare size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => toggleActivoDocente(d)}
                        title={d.activo ? 'Desactivar' : 'Reactivar'}
                        className="p-1.5 rounded-lg text-h-tertiary transition-colors duration-150"
                        onMouseEnter={e => {
                          e.currentTarget.style.background = d.activo
                            ? 'var(--h-sem-danger-bg)'
                            : 'var(--h-sem-success-bg)'
                          e.currentTarget.style.color = d.activo
                            ? 'var(--h-sem-danger-text)'
                            : 'var(--h-sem-success-text)'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.color = 'var(--h-text-tertiary)'
                        }}
                      >
                        {d.activo ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================================================================
          SECCION 2: CLASES
      ================================================================ */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-xl font-black text-h-primary flex items-center gap-2">
            Clases asignadas
          </h2>
          <p className="text-h-secondary text-sm mt-0.5">
            {loadingClases ? '...' : `${clases.length} clases`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <HSelect
            value={filtroDocente}
            onChange={v => setFilDoc(v)}
            options={docenteOpts}
            placeholder="Todos los docentes"
            size="sm"
          />
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox" checked={!soloActivas}
              onChange={e => setSoloAct(!e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm font-semibold text-h-secondary">
              Mostrar inactivas
            </span>
          </label>
          <button
            onClick={abrirCrearClase}
            className="flex items-center gap-2 text-white font-bold
                       px-4 py-2.5 rounded-xl text-sm transition-colors duration-150"
            style={{ background: 'var(--h-teal-rest)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-teal-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--h-teal-rest)')}
          >
            <Plus size={16} /> Asignar clase
          </button>
        </div>
      </div>

      <div className="bg-h-surface rounded-xl border border-h-subtle overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-h-subtle bg-h-elevated">
              {[
                { label: 'Docente / Asignatura', align: 'left'   },
                { label: 'Secci\u00f3n',         align: 'center' },
                { label: 'Semestre',              align: 'center' },
                { label: 'Horario',               align: 'center' },
                { label: 'Estado',                align: 'center' },
                { label: 'Acciones',              align: 'center' },
              ].map(({ label, align }) => (
                <th key={label}
                  className={`
                    px-4 py-3 text-xs font-bold text-h-tertiary uppercase tracking-wide
                    ${align === 'left' ? 'text-left' : 'text-center'}
                  `}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loadingClases ? (
              Array.from({ length: 4 }).map((_, i) =>
                <TableRowSkeleton key={i} cols={6} />
              )
            ) : grupos.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12">
                  <GraduationCap size={28}
                    className="mx-auto mb-2 text-h-tertiary opacity-40" />
                  <p className="font-semibold text-h-secondary">
                    Sin clases asignadas
                  </p>
                </td>
              </tr>
            ) : grupos.map(g => {
              const abierto = expandidos.has(g.docente_id)
              const inact   = g.clases.filter(c => !c.activa).length
              return (
                <Fragment key={g.docente_id}>
                  {/* Fila de grupo */}
                  <tr
                    onClick={() => toggleExpandido(g.docente_id)}
                    style={{ background: 'var(--h-bg-elevated)' }}
                    className="border-b border-h-subtle cursor-pointer
                               select-none transition-colors"
                    onMouseEnter={e =>
                      (e.currentTarget.style.background = 'var(--h-bg-highlight)')
                    }
                    onMouseLeave={e =>
                      (e.currentTarget.style.background = 'var(--h-bg-elevated)')
                    }
                  >
                    <td colSpan={6} className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {abierto
                          ? <ChevronDown size={14}
                              style={{ color: 'var(--h-teal-hover)' }}
                              className="flex-shrink-0" />
                          : <ChevronRight size={14}
                              className="text-h-tertiary flex-shrink-0" />
                        }
                        <span className="font-bold text-h-primary">
                          {g.docente_nombre}
                        </span>
                        <span className="text-xs text-h-tertiary font-semibold">
                          {g.clases.length} {g.clases.length === 1 ? 'clase' : 'clases'}
                          {inact > 0 && (
                            <span
                              className="ml-1"
                              style={{ color: 'var(--h-sem-danger-text)' }}
                            >
                              · {inact} inactiva{inact > 1 ? 's' : ''}
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                  </tr>

                  {/* Sub-filas */}
                  {abierto && g.clases.map(c => (
                    <tr
                      key={c.id}
                      style={{
                        background: rowHoverClase === c.id
                          ? 'var(--h-bg-highlight)' : 'transparent',
                        opacity: c.activa ? 1 : 0.55,
                      }}
                      className="border-b border-h-subtle transition-colors"
                      onMouseEnter={() => setRowHoverClase(c.id)}
                      onMouseLeave={() => setRowHoverClase(null)}
                    >
                      <td className="px-4 py-3 pl-10">
                        <div className="font-semibold text-h-primary">
                          {c.asignatura_nombre}
                        </div>
                        <div className="text-xs text-h-tertiary font-mono">
                          {c.asignatura_codigo}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-bold font-mono text-h-primary">
                        {c.seccion}
                      </td>
                      <td className="px-4 py-3 text-center text-h-secondary">
                        {c.semestre}
                      </td>
                      <td className="px-4 py-3 text-center text-h-secondary text-xs">
                        {c.dia_semana && c.hora_inicio
                          ? `${c.dia_semana} ${c.hora_inicio}–${c.hora_fin ?? '?'}`
                          : <span className="text-h-tertiary">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-center">
                        {c.activa
                          ? <Badge variant="success">Activa</Badge>
                          : <Badge variant="danger">Inactiva</Badge>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={e => { e.stopPropagation(); abrirEditarClase(c) }}
                            title="Editar"
                            className="p-1.5 rounded-lg text-h-tertiary
                                       transition-colors duration-150"
                            onMouseEnter={e => {
                              e.currentTarget.style.background = 'var(--h-teal-subtle)'
                              e.currentTarget.style.color = 'var(--h-teal-hover)'
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = 'transparent'
                              e.currentTarget.style.color = 'var(--h-text-tertiary)'
                            }}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={e => toggleActivaClase(e, c)}
                            title={c.activa ? 'Desactivar' : 'Reactivar'}
                            className="p-1.5 rounded-lg text-h-tertiary
                                       transition-colors duration-150"
                            onMouseEnter={e => {
                              e.currentTarget.style.background = c.activa
                                ? 'var(--h-sem-danger-bg)'
                                : 'var(--h-sem-success-bg)'
                              e.currentTarget.style.color = c.activa
                                ? 'var(--h-sem-danger-text)'
                                : 'var(--h-sem-success-text)'
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = 'transparent'
                              e.currentTarget.style.color = 'var(--h-text-tertiary)'
                            }}
                          >
                            {c.activa
                              ? <ToggleRight size={16} />
                              : <ToggleLeft  size={16} />
                            }
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ================================================================
          MODAL: Crear / Editar Docente
      ================================================================ */}
      {showModalDocente && (
        <Modal
          title={editDocente ? 'Editar docente' : 'Nuevo docente'}
          onClose={() => setShowModalDocente(false)}
          size="sm"
        >
          <form onSubmit={handleSubmitDocente} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-h-tertiary
                               uppercase tracking-wide mb-1.5">
                Nombre *
              </label>
              <input
                type="text" required value={formDoc.nombre}
                onChange={e => setFormDoc(f => ({ ...f, nombre: e.target.value }))}
                className={inputCls}
                placeholder="Ej: Ana García" autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-h-tertiary
                               uppercase tracking-wide mb-1.5">
                Email *
              </label>
              <input
                type="email" required value={formDoc.email}
                onChange={e => setFormDoc(f => ({ ...f, email: e.target.value }))}
                className={inputCls}
                placeholder="docente@duoc.cl"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-h-tertiary
                               uppercase tracking-wide mb-1.5">
                RUT
              </label>
              <input
                type="text" value={formDoc.rut}
                onChange={e => setFormDoc(f => ({ ...f, rut: e.target.value }))}
                className={inputCls}
                placeholder="12.345.678-9"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-h-tertiary
                               uppercase tracking-wide mb-1.5">
                Teléfono
              </label>
              <input
                type="text" value={formDoc.telefono}
                onChange={e => setFormDoc(f => ({ ...f, telefono: e.target.value }))}
                className={inputCls}
                placeholder="+56 9 1234 5678"
              />
            </div>
            {formError && (
              <p
                className="text-sm px-3 py-2 rounded-lg border"
                style={{
                  background: 'var(--h-sem-danger-bg)',
                  borderColor: 'var(--h-sem-danger-border)',
                  color: 'var(--h-sem-danger-text)',
                }}
              >
                {formError}
              </p>
            )}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowModalDocente(false)}
                className="flex-1 py-2.5 rounded-xl border border-h-visible
                           text-h-secondary font-bold transition-colors duration-150"
                onMouseEnter={e =>
                  (e.currentTarget.style.background = 'var(--h-bg-highlight)')
                }
                onMouseLeave={e =>
                  (e.currentTarget.style.background = 'transparent')
                }
              >
                Cancelar
              </button>
              <button
                type="submit" disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-white font-bold
                           disabled:opacity-50"
                style={{ background: 'var(--h-teal-rest)' }}
                onMouseEnter={e =>
                  (e.currentTarget.style.background = 'var(--h-teal-hover)')
                }
                onMouseLeave={e =>
                  (e.currentTarget.style.background = 'var(--h-teal-rest)')
                }
              >
                {saving ? 'Guardando...' : editDocente ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ================================================================
          MODAL: Comentarios (solo operador_coordinador)
      ================================================================ */}
      {showModalComentarios && comentDocente && (
        <Modal
          title={`Comentarios \u2014 ${comentDocente.nombre}`}
          onClose={() => setShowModalCom(false)}
          size="md"
        >
          {/* Aviso de responsabilidad */}
          <div
            className="flex items-start gap-3 rounded-xl px-4 py-3 mb-5 border"
            style={{
              background: 'var(--h-sem-warning-bg)',
              borderColor: 'var(--h-sem-warning-border)',
            }}
          >
            <AlertTriangle
              size={16}
              className="flex-shrink-0 mt-0.5"
              style={{ color: 'var(--h-sem-warning-text)' }}
            />
            <p
              className="text-xs leading-relaxed"
              style={{ color: 'var(--h-sem-warning-text)' }}
            >
              <strong>Aviso de responsabilidad:</strong> Los comentarios registrados en
              esta sección son de carácter interno y confidencial. Solo el
              Operador Coordinador puede gestionarlos y son de su exclusiva
              responsabilidad. Deben usarse únicamente para fines operativos
              legítimos dentro de la Escuela de Salud.
            </p>
          </div>

          {/* Formulario nuevo comentario */}
          <form onSubmit={handleSubmitComentario} className="mb-6 space-y-3">
            <div className="flex items-center gap-3">
              <HSelect
                value={formCom.tipo}
                onChange={v => setFormCom(f => ({ ...f, tipo: v as TipoComentario }))}
                options={TIPO_COM_OPTS}
                size="sm"
              />
              <span className="text-xs text-h-tertiary">Tipo del comentario</span>
            </div>
            <textarea
              required
              value={formCom.contenido}
              onChange={e => setFormCom(f => ({ ...f, contenido: e.target.value }))}
              rows={3}
              placeholder="Escribe el comentario aquí..."
              className={`${inputCls} resize-none`}
            />
            <div className="flex justify-end">
              <button
                type="submit" disabled={savingCom || !formCom.contenido.trim()}
                className="px-4 py-2 rounded-xl text-white text-sm font-bold
                           disabled:opacity-50 transition-colors duration-150"
                style={{ background: 'var(--h-teal-rest)' }}
                onMouseEnter={e =>
                  (e.currentTarget.style.background = 'var(--h-teal-hover)')
                }
                onMouseLeave={e =>
                  (e.currentTarget.style.background = 'var(--h-teal-rest)')
                }
              >
                {savingCom ? 'Guardando...' : 'Registrar comentario'}
              </button>
            </div>
          </form>

          {/* Historial */}
          <div className="space-y-3">
            {loadingCom ? (
              <p className="text-h-tertiary text-sm text-center py-4">
                Cargando comentarios...
              </p>
            ) : comentarios.length === 0 ? (
              <p className="text-h-tertiary text-sm text-center py-4">
                Sin comentarios aún.
              </p>
            ) : comentarios.map(c => (
              <div
                key={c.id}
                className="rounded-xl border border-h-subtle p-4"
                style={{ background: 'var(--h-bg-elevated)' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={TIPO_COM_VARIANT[c.tipo as TipoComentario]}>
                      <span className="flex items-center gap-1">
                        {TIPO_COM_ICON[c.tipo as TipoComentario]}
                        {c.tipo.charAt(0).toUpperCase() + c.tipo.slice(1)}
                      </span>
                    </Badge>
                    <span className="text-xs text-h-tertiary">
                      {c.creado_por_nombre ?? 'Coordinador'}
                    </span>
                  </div>
                  <span className="text-xs text-h-tertiary">
                    {formatFecha(c.created_at)}
                  </span>
                </div>
                <p className="text-h-secondary text-sm leading-relaxed">
                  {c.contenido}
                </p>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* ================================================================
          MODAL: Crear / Editar Clase
      ================================================================ */}
      {showModalClase && (
        <Modal
          title={editClase ? 'Editar clase' : 'Asignar clase a docente'}
          onClose={() => setShowModalClase(false)}
          size="sm"
        >
          <form onSubmit={handleSubmitClase} className="space-y-4">
            {!editClase && (
              <>
                <div>
                  <label className="block text-xs font-bold text-h-tertiary
                                   uppercase tracking-wide mb-1.5">
                    Docente *
                  </label>
                  <HSelect
                    required
                    value={formClase.docente_id}
                    onChange={v => setFormClase(f => ({ ...f, docente_id: v }))}
                    options={docenteOpts}
                    placeholder="Seleccionar docente..."
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-h-tertiary
                                   uppercase tracking-wide mb-1.5">
                    Asignatura *
                  </label>
                  <HSelect
                    required
                    value={formClase.asignatura_id}
                    onChange={v => setFormClase(f => ({ ...f, asignatura_id: v }))}
                    options={asigOpts}
                    placeholder="Seleccionar asignatura..."
                    className="w-full"
                  />
                </div>
              </>
            )}
            <div>
              <label className="block text-xs font-bold text-h-tertiary
                               uppercase tracking-wide mb-1.5">
                Sección *
              </label>
              <input
                type="text" required value={formClase.seccion}
                onChange={e => setFormClase(f => ({
                  ...f, seccion: e.target.value.toUpperCase()
                }))}
                className={inputCls}
                placeholder="Ej: 001D" maxLength={10}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-h-tertiary
                               uppercase tracking-wide mb-1.5">
                Semestre *
              </label>
              <input
                type="text" required value={formClase.semestre}
                onChange={e => setFormClase(f => ({ ...f, semestre: e.target.value }))}
                className={inputCls}
                placeholder="Ej: 2025-1" maxLength={10}
              />
              <p className="text-xs text-h-tertiary mt-1">
                Formato: Año-Semestre (ej: 2026-1, 2026-2)
              </p>
            </div>
            {formError && (
              <p
                className="text-sm px-3 py-2 rounded-lg border"
                style={{
                  background: 'var(--h-sem-danger-bg)',
                  borderColor: 'var(--h-sem-danger-border)',
                  color: 'var(--h-sem-danger-text)',
                }}
              >
                {formError}
              </p>
            )}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowModalClase(false)}
                className="flex-1 py-2.5 rounded-xl border border-h-visible
                           text-h-secondary font-bold transition-colors duration-150"
                onMouseEnter={e =>
                  (e.currentTarget.style.background = 'var(--h-bg-highlight)')
                }
                onMouseLeave={e =>
                  (e.currentTarget.style.background = 'transparent')
                }
              >
                Cancelar
              </button>
              <button
                type="submit" disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-white font-bold
                           disabled:opacity-50"
                style={{ background: 'var(--h-teal-rest)' }}
                onMouseEnter={e =>
                  (e.currentTarget.style.background = 'var(--h-teal-hover)')
                }
                onMouseLeave={e =>
                  (e.currentTarget.style.background = 'var(--h-teal-rest)')
                }
              >
                {saving ? 'Guardando...' : editClase ? 'Guardar cambios' : 'Asignar'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

# CLAUDE.md — Contexto tecnico de Hestia

Este archivo es el punto de entrada para cualquier asistente de IA que trabaje en este
repositorio. Contiene el estado real del proyecto, las convenciones establecidas y las
reglas que hay que respetar.

**Al inicio de cada sesion:**
- Leer este archivo (CLAUDE.md) siempre.
- Si la sesion involucra trabajo de frontend, leer tambien DESIGN.md.

---

## 1. Que es Hestia

Sistema web de gestion de stock de insumos medicos para la Escuela de Salud de DuocUC,
sede San Bernardo. Desarrollado por estudiantes de Informatica Biomedica como proyecto
de Ruta IE. El sistema corre en red LAN interna; no tiene IP publica ni dominio.

**Stack completo:**
- Backend: Python 3.11 · FastAPI · PostgreSQL 16 · SQLAlchemy 2.0 · Pydantic v2
- Frontend: React 19 · Vite · TypeScript · Tailwind CSS · Zustand · Axios ·
  lucide-react ^0.396 · @zxing/browser ^0.1.4
- Tipografia: Nunito (Google Fonts)
- Infra: Docker Compose (5 servicios: `db`, `api`, `frontend`, `nginx`, `backup`)
- Auth: JWT (python-jose) · bcrypt · TOTP 2FA **obligatorio** (pyotp + QR) · recuperacion
  de contrasena por email (TokenRecuperacion)
- CI: GitHub Actions con flake8 en push/PR a `main` y `develop`

---

## 2. Arquitectura Docker

```
[Navegador LAN] -> nginx :443/:80 -> frontend :3000 (Vite) -> api :8000 (FastAPI) -> db :5432
```

**Servicios en `docker-compose.yml`:**

| Servicio   | Puerto expuesto al host | Alcanzable desde LAN |
|---|---|---|
| `db`       | ninguno                 | No, solo red interna |
| `api`      | 127.0.0.1:8000          | No, solo localhost   |
| `frontend` | 127.0.0.1:3000          | No, solo localhost   |
| `nginx`    | 0.0.0.0:80, :443        | Si, punto de entrada |
| `backup`   | ninguno                 | No, solo red interna |

**Comandos de ciclo de vida:**
```bash
docker compose up --build     # primera vez o tras cambios en Dockerfile
docker compose up             # levantar sin reconstruir
docker compose restart api    # recargar backend
docker compose exec api python seed_demo.py  # datos de demo
```

---

## 3. Backend

### 3.1 Modelos SQLAlchemy relevantes

**`Insumo`** — insumos desechables e implementos retornables.
`tipo` (insumo|implemento), `sala_id` es campo legado (no usar en nueva logica).

**`UnidadImplemento`** — unidad fisica de un implemento con subcódigo unico.
`sala_id=NULL` = en Bodega; `sala_id=X` = asignada a sala clinica X.
`estado` (disponible|en_uso|dado_de_baja). Las unidades `dado_de_baja` no cuentan
como stock operativo ni en los conteos de la pagina.

**`ActivoFijo`** — mueble o phantoma. Relaciones `sala` y `proveedor` con `joinedload`
obligatorio en todos los endpoints para poblar `sala_nombre` y `proveedor_nombre`.
`proveedor_id` presente en `ActivoFijoCreate` y `ActivoFijoUpdate`.

**`Asignatura`** · **`Taller`** · **`PaqueteInsumo`** · **`PaqueteItem`** —
jerarquia academica. `Asignatura` tiene lazy relationships a `Taller` y `PaqueteInsumo`;
importar ambos modelos antes de la primera query ORM en cualquier script.

**`TokenRecuperacion`** — token de recuperacion de contrasena de un solo uso.
Email + hash SHA256 del token + fecha de expiracion (1 hora). Usado por
`/auth/recuperar-password` y `/auth/confirmar-reset`.

**`OrdenMantenimiento`** — orden de mantenimiento de un activo fijo.
Campos: `tipo_mantenimiento` (preventivo|correctivo|validacion_tecnica),
`fecha_retorno_estimada`, estados: enviado|en_proceso|completado|cancelado.

**`ProgramacionTaller`** (programacion_talleres): instancia concreta de un
taller en sala+fecha. Importador xlsx en POST /programacion/importar-xlsx.

**`RevisionSala`** (revisiones_sala) + RevisionSalaItem (revisiones_sala_items):
checklist operativo post-taller. Items generados automaticamente desde
PaqueteInsumo + ActivosFijo de la sala al momento de crear la revision.

**`Incidencia`** (incidencias) — incidencia sobre un activo fijo.
`tipo` (dano_fisico|pieza_perdida|mal_funcionamiento|otro),
`severidad` (leve|moderada|critica), `estado` (abierta|en_revision|resuelta).
Entidad independiente de `OrdenMantenimiento`; incluye foto opcional en base64.

**`OrdenEntrada`** (ordenes_entrada) + `OrdenEntradaItem` (orden_entrada_items):
orden de compra/entrada de mercaderia al inventario.
`tipo` (semanal|semestral|emergencia), estados: borrador|confirmada|en_recepcion|cerrada|cancelada.
El stock solo se actualiza cuando op_coord/admin cierra la orden.
Items referencian insumos o activos_fijos existentes, o crean nuevos al cierre.

### 3.2 Flujo de autenticacion

**2FA es obligatorio para todos los usuarios.** No puede desactivarse.

**Flujo A — usuario con 2FA ya configurado:**
1. `POST /auth/login` → credenciales validas → `{requires_2fa: true, pre_token}` (5 min)
2. `POST /auth/2fa/completar-login` con `{pre_token, codigo}` → JWT completo

**Flujo B — usuario sin 2FA (primer login o tras usar recovery code):**
1. `POST /auth/login` → `{requires_2fa_setup: true, pre_token: setup_token}` (15 min)
2. `POST /auth/2fa/setup-inicial` con `{setup_token}` → QR base64 + secret manual
3. `POST /auth/2fa/activar-inicial` con `{setup_token, codigo}` → JWT + 10 recovery codes

**Flujo C — recuperacion con recovery code (en lugar de TOTP en paso 2A):**
1. `POST /auth/2fa/recuperar-acceso` con `{pre_token, recovery_code}` → consume el codigo,
   deshabilita 2FA, devuelve `{requires_2fa_setup: true, setup_token}` → continua en Flujo B.

**Recuperacion de contrasena (sin admin):**
1. `POST /auth/recuperar-password` con `{email}` → genera TokenRecuperacion, envia link por email
2. `POST /auth/confirmar-reset` con `{token, nueva_password}` → actualiza password (token 1 uso, 1h)

**Politica de passwords:** minimo 8 chars, mayuscula + minuscula + numero + caracter especial.

### 3.3 Endpoints relevantes

**`/unidades-implemento`**
- `POST /generar-lote` — crea N unidades en Bodega (require_operador). Tope: 500.
- Rutas estaticas ANTES de `/{id}` (e.g., `/generar-lote` antes de `/{unidad_id}`).

**`/activos-fijos`**
- `_to_response` incluye `proveedor_id` y `proveedor_nombre` via `joinedload(proveedor)`.
- Todos los endpoints usan `_cargar(db, id)` que hace `joinedload(sala, proveedor)`.

### 3.4 RBAC

```python
get_usuario_actual   # cualquier JWT valido
require_operador     # admin, operador u operador_coordinador
require_admin        # solo admin
require_reportes     # admin, operador_coordinador o visor
```

### 3.5 Reglas de migraciones

Siempre SQL idempotente en `MIGRACIONES_COLUMNAS` / `MIGRACIONES_ENUM` de `database.py`.
Nunca Alembic. Enum migrations con `psycopg2` + `autocommit=True`.
`create_type=False` en `SAEnum` cuando el tipo ya existe en PostgreSQL.

### 3.6 Reglas de estilo Python

- Flake8: `max-line-length=100`. Prohibidos E221, E241, E261 (alineacion vertical).
- Rutas estaticas ANTES de dinamicas: `/buscar`, `/generar-lote`, `/exportar` antes de `/{id}`.
- Importar `taller` y `paquete_insumo` antes de la primera query ORM (ver mapper bug).

---

## 4. Frontend

### 4.1 Estructura de paginas

```
frontend/src/pages/
  Dashboard, Alertas, Insumos, Movimientos, Salas, VistaSalas, Categorias
  ActivosFijos, UnidadesImplemento, OrdenesMantenimiento, Incidencias
  Paquetes, PrepararTaller, OrdenesEntrada
  Asignaturas, ClasesDocente, VerHorario, ImportarHorario, ImportarProgramacion
  Reportes, Importaciones (hub), ImportarInsumos
  Proveedores
  Perfil, Configuracion2FA, Usuarios, AuditLog
  Login, ResetPassword
```

Nota: `SolicitudDocente.tsx`, `SolicitudOperador.tsx`, `RetornosOperador.tsx` existen como
archivos pero NO estan en el router (paginas huerfanas, no navegar a ellas).

### 4.2 Componentes UI reutilizables

```
frontend/src/components/ui/
  HSelect.tsx         — dropdown custom con tokens h-*
  Badge.tsx           — badges semanticos
  Card.tsx            — tarjeta base con tokens h-*
  Modal.tsx           — modal base
  Skeleton.tsx        — skeletons de carga
  TotpInput.tsx       — input de 6 digitos para TOTP
  SearchSuggestions.tsx
  BarcodeScanner.tsx
  Logo.tsx

frontend/src/hooks/
  useLastUpdated.ts   — hook de timestamp reactivo para paginas con refresh
```

### 4.3 Estandares de componentes

**HSelect** — obligatorio para cualquier dropdown visible al usuario.
Nunca `<select>` nativo en filtros o formularios. Ver DESIGN.md seccion 5.1.

**useLastUpdated** — obligatorio en toda pagina con boton de actualizar.
Estandar: label `text-xs text-h-tertiary mt-1` bajo el subtitulo del header;
boton solo icono `<RefreshCw size={15} />`.

**Hover de filas de tabla** — siempre con `onMouseEnter/Leave` usando
`var(--h-bg-highlight)`. No usar `hover:` de Tailwind en filas (interferencia dark mode).

**Modales** — fondo `bg-h-surface`, borde `border-h-subtle`, `rounded-2xl`,
`max-h-[90vh] flex flex-col overflow-y-auto` para scroll interno.

### 4.4 Proxy Vite

Prefijos registrados: `/auth`, `/insumos`, `/importar`, `/resumen`, `/salas`,
`/categorias`, `/usuarios`, `/movimientos`, `/audit-log`, `/solicitudes`,
`/retornos`, `/asignaturas`, `/clases-docente`, `/docentes`, `/reportes`,
`/activos-fijos`, `/unidades-implemento`, `/talleres`, `/paquetes`,
`/ordenes-mantenimiento`, `/ordenes-entrada`, `/proveedores`,
`/programacion`, `/revisiones`, `/incidencias`.

---

## 5. Reglas para trabajar en este repositorio

1. **Leer el codigo real antes de escribir.** Usar MCP de GitHub. Para frontend, leer DESIGN.md.
2. **Flake8 primero.** No usar espacios de alineacion visual (E221). Lineas <= 100 chars.
3. **Proxy de Vite.** Al agregar un router FastAPI, agregar su prefix en `vite.config.ts`.
4. **Importar modelos en `main.py`, `crear_admin.py` Y `seed_demo.py` en orden de FK.**
5. **Rutas estaticas antes que dinamicas.**
6. **Try/catch en fetches del frontend.**
7. **Sincronizar tipos.** Al modificar un schema Pydantic, actualizar `frontend/src/types/api.ts`.
8. **No exponer puertos 5432, 8000 ni 3000 a la LAN.**
9. **SKU auto-generado.** `db.flush()` para obtener ID, luego `sku = f"HST-{id:05d}"`.
10. **Enum `carreraasignatura`.** Valores: `TENS|TQF|TLCBS|TONS|preparador_fisico`.
11. **Enum `rolusuario`.** Sin `docente`.
12. **Dark mode.** Nuevos componentes deben usar tokens `h-*`. Ver DESIGN.md.
13. **Blob error parsing.** Peticiones con `responseType: 'blob'` que fallan: convertir
    con `.text()` y parsear JSON para obtener el `detail` real.
14. **Sin rutas Solicitudes/Retornos.** Paginas eliminadas. Modelos existen en BD.
15. **Logica de ubicacion fisica:**
    - Insumos: siempre en Bodega (`sala_id=NULL` en `Insumo`).
    - Implementos: unidades fisicas en `UnidadImplemento.sala_id`.
    - `dado_de_baja` excluido de conteos operativos y comparacion de stock.
16. **HTTP 403 para segundo factor incorrecto** (no 401, evita logout automatico).
17. **ActivoFijo `proveedor_id`** presente en Create y Update schemas. Siempre
    `joinedload(proveedor)` en las queries para poblar `proveedor_nombre`.
18. **Conteos de tabs en ActivosFijos:** usar lista `todos` (sin filtro de tipo) para
    los conteos; `activos` (lista filtrada) solo para la tabla.

---

## 6. Estado de funcionalidades

| Area          | Funcionalidad                                      | Estado         |
|---|---|---|
| Inventario    | CRUD insumos/implementos con filtros y HSelect     | OK             |
| Inventario    | Exportacion CSV/XLSX e importacion                 | OK             |
| Implementos   | Unidades fisicas con subcódigo, generar lote       | OK junio 2026  |
| Implementos   | Banner faltantes/sobrantes, conteo operativo       | OK junio 2026  |
| Activos fijos | CRUD con proveedor_id funcionando correctamente    | OK junio 2026  |
| Activos fijos | Tabs con conteos correctos (lista todos separada)  | OK junio 2026  |
| Alertas       | Stock activas y resueltas (Vencimientos eliminado) | OK junio 2026  |
| Academico     | Talleres, Paquetes, ClasesDocente                  | OK             |
| Auth          | Login + JWT + TOTP 2FA obligatorio + recovery codes | OK junio 2026  |
| Auth          | Recuperacion de contrasena autoservicio por email  | OK junio 2026  |
| Usuarios      | RBAC admin/operador_coordinador/operador/visor     | OK             |
| UI            | HSelect en Insumos, ActivosFijos, UnidadesImplemento | OK junio 2026|
| UI            | useLastUpdated en Alertas, ActivosFijos, Movimientos, AuditLog, OrdenesMantenimiento, Reportes | OK junio 2026 |
| UI            | Dark mode completo en paginas internas (mayoría)   | OK junio 2026  |
| Mantenimiento | Ordenes CRUD con tipo, estado, proveedor, fechas   | OK             |
| Incidencias   | Registro de daños/mal funcionamiento en activos    | OK junio 2026  |
| Ordenes entrada | Flujo borrador→cerrada, actualiza stock al cierre | OK junio 2026  |
| Proveedores   | CRUD de proveedores (coord/admin)                  | OK junio 2026  |
| Vista Salas   | Mapa SVG interactivo con estados en tiempo real    | OK junio 2026  |
| Reportes      | Valorizacion PDF/XLSX, consumo carreras            | OK             |

### Pendiente

| Funcionalidad                                    | Complejidad |
|---|---|
| Vista movil de Operadoras — Guia del dia por sala| Media       |
| Reporte de conflictos de recursos                | Media       |
| Extraer ShimmerButton a componente reutilizable  | Media       |
| Fade-in de paginas al navegar entre rutas        | Media       |
| Gradiente/aurora leve en header del Sidebar      | Baja        |
| Permisos diferenciados del operador_coordinador  | Baja        |

# CLAUDE.md — Contexto técnico de Hestia

Este archivo es el punto de entrada para cualquier asistente de IA que trabaje en este repositorio. Contiene el estado real del proyecto, las convenciones establecidas y las reglas que hay que respetar.

---

## 1. Qué es Hestia

Sistema web de gestión de stock de insumos médicos para la Escuela de Salud de DuocUC, sede San Bernardo. Desarrollado por estudiantes de Informática Biomédica como proyecto de Ruta IE. El sistema corre en red LAN interna; no tiene IP pública ni dominio.

**Stack completo:**
- Backend: Python 3.11 · FastAPI · PostgreSQL 16 · SQLAlchemy 2.0 · Pydantic v2
- Frontend: React 19 · Vite · TypeScript · Tailwind CSS · Zustand · Axios · lucide-react ^0.396 · @zxing/browser ^0.1.4
- Tipografía: Nunito (Google Fonts)
- Infra: Docker Compose (3 servicios: `db`, `api`, `frontend`)
- Auth: JWT (python-jose) · bcrypt · TOTP 2FA (pyotp + QR)
- CI: GitHub Actions con flake8 en push/PR a `main` y `develop`

---

## 2. Arquitectura Docker

```
[Navegador] → :3000 (frontend/Vite) → proxy → :8000 (api/FastAPI) → db:5432 (PostgreSQL)
```

**Servicios en `docker-compose.yml`:**

| Servicio | Imagen | Puerto expuesto | Volumen |
|---|---|---|---|
| `db` | postgres:16 | ninguno (solo red interna) | `postgres_data` (named) |
| `api` | Dockerfile propio | 8000 | `./backend:/app` (bind mount dev) |
| `frontend` | Dockerfile propio | 3000 | `./frontend:/app` + `/app/node_modules` |

**Regla crítica:** el puerto 5432 de la BD NO está expuesto al host ni a la LAN.

**Comandos de ciclo de vida:**
```bash
docker compose up --build     # primera vez o tras cambios en Dockerfile
docker compose up             # levantar sin reconstruir
docker compose restart api    # recargar backend
docker compose restart frontend  # recargar Vite
docker compose down           # apagar (datos persisten en named volume)
docker compose down -v        # apagar Y borrar la BD
```

**Datos de demo:**
```bash
docker compose exec api python seed_demo.py
```
Genera 18 salas (numeración real piso -1 + odontología), 10 categorías, 5 usuarios (sin rol docente), 19 asignaturas de las 5 carreras, 8 clases, 88 insumos (con tipo/unidad_medida/SKU), y ~560 movimientos distribuidos en 60 días.

---

## 3. Backend

### 3.1 Estructura

```
backend/
├── app/
│   ├── main.py
│   ├── database.py
│   ├── models/
│   │   ├── usuario.py
│   │   ├── sala.py
│   │   ├── categoria.py
│   │   ├── insumo.py
│   │   ├── movimiento.py
│   │   ├── solicitud.py
│   │   ├── retorno_implemento.py
│   │   ├── asignatura.py
│   │   ├── clase_docente.py
│   │   ├── audit_log.py
│   │   ├── activo_fijo.py
│   │   ├── unidad_implemento.py
│   │   ├── taller.py            <- Taller (clase practica de una asignatura)
│   │   └── paquete_insumo.py    <- PaqueteInsumo + PaqueteItem (Guia de Taller)
│   ├── schemas/
│   │   ├── ...
│   │   ├── taller.py
│   │   └── paquete_insumo.py
│   ├── routes/
│   │   ├── ...
│   │   ├── talleres.py          <- GET/POST/PUT/DELETE /talleres
│   │   └── paquetes_insumo.py   <- GET/POST/PUT /paquetes + items
│   └── utils/
├── seed_demo.py
├── crear_admin.py
├── .flake8
└── requirements.txt
```

### 3.2 Modelos SQLAlchemy

**`Usuario`** (`usuarios`)
```
id · nombre · email (unique) · password_hash
rol (Enum: admin|operador_coordinador|operador|visor)
    ← El rol 'docente' fue eliminado.
totp_secret · totp_habilitado · recovery_codes
avatar_b64 · activo (soft-delete)
```

**`Insumo`** (`insumos`)
```
id · nombre · descripcion
sku (VARCHAR 20, unique index parcial)
codigo_barras (VARCHAR 100, unique index parcial)
tipo (Enum PG: insumo|implemento)
unidad_medida (VARCHAR 60, nullable)  <- NUEVO: ej. 'caja x100', 'frasco 500 mL'
costo_unitario (NUMERIC 10,2, nullable - para reportes internos)
fecha_vencimiento (DATE, nullable)
stock_actual · stock_minimo
activo (Boolean, soft-delete)
sala_id (FK nullable) · categoria_id (FK nullable)
```

> **Nota UI:** `costo_unitario` sigue existiendo en el modelo y schemas para reportes
> de valorización, pero fue eliminado de la tabla y formulario de la página Insumos
> por indicación de Maritza (no necesario en la vista cotidiana).

**`Asignatura`** (`asignaturas`)
```
id · nombre · codigo (VARCHAR 20, unique)
activa (Boolean)
carrera (Enum PG: TENS|TQF|TLCBS|TONS|preparador_fisico)
Relaciones: clases → · talleres →
```

**`Taller`** (`talleres`)
```
id · nombre (VARCHAR 200) · descripcion (Text nullable)
asignatura_id (FK asignaturas, nullable)
activo (Boolean, soft-delete)
Relaciones: asignatura ← · paquetes →
```
Representa el tipo de clase práctica (ej: “Taller de venopunción”). Reutilizable entre semestres.

**`PaqueteInsumo`** (`paquetes_insumo`) — Guía de Taller digital
```
id · taller_id (FK, ondelete=CASCADE) · semestre (VARCHAR 10, ej: '2026-1')
creado_por_id (FK usuarios, ondelete=SET NULL)
fecha_creacion (DateTime timezone, server_default=now())
bloqueado (Boolean, default false)  <- congela el paquete al iniciar el semestre
notas (Text nullable)
Relaciones: taller ← · creado_por ← · items →
Unicidad: (taller_id, semestre) — validada en el router
```

**`PaqueteItem`** (`paquetes_items`)
```
id · paquete_id (FK, ondelete=CASCADE)
insumo_id (FK insumos, ondelete=CASCADE)
cantidad_requerida (Integer) · notas (Text nullable)
Relaciones: paquete ← · insumo ←
```

**`ClaseDocente`** (`clases_docente`)
```
id · docente_id (FK usuarios) · asignatura_id (FK)
seccion · semestre · activa · num_estudiantes
dia_semana · hora_inicio · hora_fin
```

**`SolicitudRetiro`** / **`RetornoImplemento`** — modelos conservados en BD por trazabilidad
historica, pero las rutas y páginas de Solicitudes y Retornos fueron **eliminadas del
frontend**. Maritza gestiona los insumos a través de los Paquetes de insumos.

### 3.3 Registro de modelos en `main.py`

Orden de importación obligatorio (por FKs):
```python
from app.models import asignatura         # antes de taller
from app.models import clase_docente      # FK a asignatura
from app.models import solicitud          # FK a clase_docente
from app.models import taller             # FK a asignatura
from app.models import paquete_insumo     # FK a taller e insumo
```
Esto mismo debe replicarse en `crear_admin.py`.

### 3.4 Endpoints relevantes (nuevos)

**`/talleres`**
```
GET  /talleres/                ?asignatura_id= ?incluir_inactivos=
GET  /talleres/{id}
POST /talleres/                (operador+)
PUT  /talleres/{id}            (operador+)
DELETE /talleres/{id}          (admin) — soft-delete
```

**`/paquetes`** — /paquetes/{id}/items ANTES de /{paquete_id}
```
GET  /paquetes/                ?taller_id= ?semestre=
GET  /paquetes/{id}
POST /paquetes/                crea paquete; unicidad (taller_id, semestre)
PUT  /paquetes/{id}            actualiza notas y bloqueado
POST /paquetes/{id}/items      upsert de item (actualiza si ya existe el insumo)
DELETE /paquetes/{id}/items/{item_id}
```
Cuando `bloqueado=true`, PUT y los endpoints de items devuelven 409.

### 3.5 RBAC

```python
get_usuario_actual   # cualquier JWT válido
require_operador     # admin, operador u operador_coordinador
require_admin        # solo admin
require_reportes     # admin, operador_coordinador o visor
```

### 3.6 Migraciones pendientes

En `database.py`, `MIGRACIONES_COLUMNAS` incluye:
```sql
ALTER TABLE IF EXISTS insumos ADD COLUMN IF NOT EXISTS unidad_medida VARCHAR(60)
```
Se ejecuta automáticamente al arrancar. Sin downtime ni pérdida de datos.

---

## 4. Frontend

### 4.1 Estructura de páginas

```
frontend/src/pages/
  Dashboard, Alertas, Insumos, Movimientos, Salas, Categorias
  ActivosFijos, UnidadesImplemento
  Paquetes             <- NUEVA: tabla con filtros carrera→asignatura→taller→semestre
  Asignaturas, ClasesDocente, VerHorario, ImportarHorario
  Reportes, ImportarInsumos
  Perfil, Configuracion2FA, Usuarios, AuditLog
  Login, ResetPassword
```

### 4.2 Rutas en App.tsx

```
/insumos      → Insumos (todos los roles)
/paquetes     → Paquetes (admin, operador_coordinador, operador)
/asignaturas  → Asignaturas (solo admin)
...
```

**Rutas eliminadas:** `/solicitudes` y `/retornos` — ya no existen en el sistema.

### 4.3 Sidebar

Menú actual (por orden de aparición):
1. Dashboard
2. Alertas
3. **Insumos e Implementos** (renombrado desde “Insumos”)
4. Activos Fijos
5. Movimientos
6. Salas
7. Categorías
8. Reportes
9. **Paquetes de insumos** (nuevo, FlaskConical, operador+)
10. Asignaturas (admin)
11. Clases Docentes (admin)
12. Ver Horario (admin)
13. Importar Horario (admin)
14. Importar Insumos (admin)
15. Usuarios (admin)
16. Audit Log (admin)

**Eliminados del sidebar:** Solicitudes y Retornos.

### 4.4 Página Insumos (`/insumos`)

- Título: **“Insumos e Implementos”**
- Columnas tabla: Nombre | **Unidad de medida** | Stock | Mínimo | Vencimiento | Estado | Acciones
- Columna **Costo/u eliminada** de la tabla (el campo sigue en el modelo para reportes)
- Formulario: campo **Unidad de medida** (placeholder: “Ej: caja x100, frasco 500 mL, unidad, par, rollo 5 m”)

### 4.5 Página Paquetes (`/paquetes`)

Tabla con filtros en cascada:
1. **Carrera** → filtra las asignaturas disponibles
2. **Asignatura** → filtra los talleres disponibles
3. **Taller** → filtra los paquetes en el backend
4. **Semestre** → filtra adicional en el backend

Cada fila es expandible (ChevronDown/Up) para ver los items del paquete con su tipo y cantidad. Botón Lock/Unlock para bloquear/desbloquear el paquete.

### 4.6 Proxy Vite

Prefijos registrados: `/auth`, `/insumos`, `/importar`, `/resumen`, `/salas`, `/categorias`, `/usuarios`, `/movimientos`, `/audit-log`, `/asignaturas`, `/clases-docente`, `/reportes`, `/activos-fijos`, `/unidades-implemento`, `/talleres`, `/paquetes`.

**Eliminados del proxy:** `/solicitudes`, `/retornos`.

### 4.7 Badge

Variantes disponibles: `default` | `warning` | `danger` | `success` | `info` | `purple`.
- `purple` → Preparador Físico en Asignaturas y Paquetes.

---

## 5. Reglas para trabajar en este repositorio

1. **Leer el código real antes de escribir.** Usar MCP de GitHub para ver los archivos actuales.
2. **Flake8 primero.** No usar espacios de alineación visual (E221). Líneas ≤ 100 chars.
3. **Proxy de Vite.** Al agregar un router FastAPI, agregar su prefix en `vite.config.ts`.
4. **Importar modelos en `main.py` Y `crear_admin.py` en orden de FK.**
5. **Rutas estáticas antes que dinámicas.** `/alertas`, `/exportar`, `/mis-clases` van ANTES de `/{id}`.
6. **Try/catch en fetches del frontend.**
7. **Sincronizar tipos.** Al modificar un schema Pydantic, actualizar `frontend/src/types/api.ts`.
8. **No exponer el puerto 5432.**
9. **`hashear_password()` de `security.py`.**
10. **`registrar()` tiene commit propio.**
11. **SKU auto-generado.** `db.flush()` para obtener ID, luego `sku = f"HST-{id:05d}"`.
12. **`datetime-local` usa hora local.**
13. **Enum `carreraasignatura`.** Valores: `TENS|TQF|TLCBS|TONS|preparador_fisico`.
14. **Enum `rolusuario`.** Valores: `admin|operador_coordinador|operador|visor`. Sin `docente`.
15. **Dark mode.** Nuevos componentes deben incluir variantes `dark:` de Tailwind.
16. **Sidebar colapsado.** Clave localStorage: `hestia-sidebar-collapsed`.
17. **Blob error parsing.** Ver sección anterior de CLAUDE.md para el patrón correcto.
18. **`require_reportes`.** Endpoints `/reportes/*` usan esta dependencia. `operador` no accede.
19. **Sin `require_docente`.** Eliminada. No referenciarla.
20. **Paquete bloqueado.** Si `bloqueado=true`, PUT y endpoints de items devuelven 409. No modificar.
21. **`costo_unitario` oculto en UI.** El campo existe en BD y schemas (necesario para reportes de
    valorización), pero no se muestra en la tabla ni en el formulario de Insumos.
22. **Sin rutas Solicitudes/Retornos.** Las páginas `/solicitudes` y `/retornos` fueron eliminadas.
    Los modelos `SolicitudRetiro` y `RetornoImplemento` existen en BD por trazabilidad, pero no
    tienen UI activa.

---

## 6. Estado de funcionalidades

| Área | Funcionalidad | Estado |
|---|---|---|
| Inventario | CRUD insumos/implementos con filtros | ✅ |
| Inventario | Unidad de medida | ✅ mayo 2026 |
| Inventario | Tipo insumo/implemento | ✅ |
| Inventario | SKU + código de barras | ✅ |
| Inventario | Fecha de vencimiento | ✅ |
| Inventario | Exportación CSV/XLSX | ✅ |
| Inventario | Importación CSV/XLSX | ✅ |
| Académico | Asignaturas agrupadas por carrera | ✅ mayo 2026 |
| Académico | 5 carreras: TENS/TQF/TLCBS/TONS/preparador_fisico | ✅ |
| Académico | Talleres CRUD | ✅ mayo 2026 |
| Académico | Paquetes de insumos (Guía de Taller) | ✅ mayo 2026 |
| Académico | Vista Paquetes con filtros carrera→asig→taller→semestre | ✅ mayo 2026 |
| Académico | Clases (asig+sección+semestre) | ✅ |
| Académico | Importar horario CSV | ✅ |
| Auth | Login + JWT + TOTP 2FA | ✅ |
| Usuarios | RBAC admin/operador_coordinador/operador/visor | ✅ |
| Usuarios | Rol docente eliminado | ✅ |
| Solicitudes | Página y rutas eliminadas del frontend | ✅ mayo 2026 |
| Retornos | Página y rutas eliminadas del frontend | ✅ mayo 2026 |
| Dashboard | Métricas + gráfico + feed | ✅ |
| Audit log | Historial de acciones | ✅ |
| UI | Sidebar colapsable | ✅ |
| UI | Modo oscuro/claro | ✅ (layout; páginas internas pendiente) |
| Reportes | Valorización del stock | ✅ |
| Reportes | Costo por carrera | ✅ |

### Pendiente

| Funcionalidad | Complejidad |
|---|---|
| CRUD de Talleres desde el frontend (UI completa) | Media |
| Vista móvil de Operadoras — Guía del día por sala | Media |
| Reporte de conflictos de recursos (phantomas sobredemandados) | Media |
| Reportes exportables en Excel con filtros | Media |
| Dark mode en páginas internas | Media |
| Permisos diferenciados del operador_coordinador | Baja |

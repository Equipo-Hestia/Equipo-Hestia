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
- Auth: JWT (python-jose) · bcrypt · TOTP 2FA (pyotp + QR)
- CI: GitHub Actions con flake8 en push/PR a `main` y `develop`

---

## 2. Arquitectura Docker

```
[Navegador LAN] -> nginx :443/:80 -> frontend :3000 (Vite) -> api :8000 (FastAPI) -> db :5432
```

**Servicios en `docker-compose.yml`:**

| Servicio | Imagen | Puerto expuesto al host | Alcanzable desde LAN |
|---|---|---|---|
| `db` | postgres:16 | ninguno | No, solo red Docker interna |
| `api` | Dockerfile propio | 127.0.0.1:8000 | No, solo localhost del servidor |
| `frontend` | Dockerfile propio | 127.0.0.1:3000 | No, solo localhost del servidor |
| `nginx` | Dockerfile propio | 0.0.0.0:80, 0.0.0.0:443 | Si, punto de entrada LAN |
| `backup` | Dockerfile propio | ninguno | No, solo red Docker interna |

**Regla critica de puertos:** los puertos 5432, 8000 y 3000 NO estan expuestos a la LAN.
Todo el trafico externo entra unicamente por nginx (443/80). Los bindings `127.0.0.1:8000:8000`
y `127.0.0.1:3000:3000` garantizan que solo el propio servidor puede acceder a esos puertos.

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
Genera 18 salas, 10 categorias, 5 usuarios (sin rol docente), 20 asignaturas de las 5
curreras, 8 clases, 88 insumos todos en Bodega (sin sala), unidades de implementos con
algunas asignadas a salas clinicas demo, 4 talleres y 2 paquetes de insumos, y ~560
movimientos en 60 dias.

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
    <- El rol 'docente' fue eliminado.
totp_secret · totp_habilitado · recovery_codes
avatar_b64 · activo (soft-delete)
```

**`Insumo`** (`insumos`)
```
id · nombre · descripcion
sku (VARCHAR 20, unique index parcial)
codigo_barras (VARCHAR 100, unique index parcial)
tipo (Enum PG: insumo|implemento)
unidad_medida (VARCHAR 60, nullable)  <- ej. 'caja x100', 'frasco 500 mL'
costo_unitario (NUMERIC 10,2, nullable - para reportes internos)
fecha_vencimiento (DATE, nullable)
stock_actual · stock_minimo
activo (Boolean, soft-delete)
sala_id (FK nullable) · categoria_id (FK nullable)
```

> **Nota de ubicacion:** `sala_id` en `Insumo` es un campo legado que ya NO se usa en la UI.
> Todos los insumos e implementos viven en **Bodega** (sala_id = NULL en la practica).
> La ubicacion fisica de las unidades de implemento se gestiona en `UnidadImplemento.sala_id`.
> Ver Regla 23.

**`UnidadImplemento`** (`unidades_implemento`)
```
id · implemento_id (FK insumos) · codigo (VARCHAR 15, unique, auto-generado)
sala_id (FK salas, nullable)  <- NULL = en Bodega; valor = sala asignada permanentemente
estado (Enum: disponible|en_uso|dado_de_baja)
notas (Text nullable) · activo (Boolean, soft-delete)
```

El stock total del implemento = suma de todas sus unidades (en salas + en bodega).
Ejemplo: 50 gafas = 10 sala 010 + 10 sala 011 + 30 bodega.

**`Asignatura`** (`asignaturas`)
```
id · nombre · codigo (VARCHAR 20, unique)
activa (Boolean)
carrera (Enum PG: TENS|TQF|TLCBS|TONS|preparador_fisico)
Relaciones: clases -> · talleres ->
```

**`Taller`** (`talleres`)
```
id · nombre (VARCHAR 200) · descripcion (Text nullable)
asignatura_id (FK asignaturas, nullable)
activo (Boolean, soft-delete)
Relaciones: asignatura <- · paquetes ->
```
Representa el tipo de clase practica (ej: "Taller de venopuncion"). Reutilizable entre
semestres.

**`PaqueteInsumo`** (`paquetes_insumo`) — Guia de Taller digital
```
id · taller_id (FK, ondelete=CASCADE) · semestre (VARCHAR 10, ej: '2026-1')
creado_por_id (FK usuarios, ondelete=SET NULL)
fecha_creacion (DateTime timezone, server_default=now())
bloqueado (Boolean, default false)  <- congela el paquete al iniciar el semestre
notas (Text nullable)
Relaciones: taller <- · creado_por <- · items ->
Unicidad: (taller_id, semestre) — validada en el router
```

**`PaqueteItem`** (`paquetes_items`)
```
id · paquete_id (FK, ondelete=CASCADE)
insumo_id (FK insumos, ondelete=CASCADE)
cantidad_requerida (Integer) · notas (Text nullable)
Relaciones: paquete <- · insumo <-
```

**`ClaseDocente`** (`clases_docente`)
```
id · docente_id (FK usuarios) · asignatura_id (FK)
seccion · semestre · activa · num_estudiantes
dia_semana · hora_inicio · hora_fin
```

**`SolicitudRetiro`** / **`RetornoImplemento`** — modelos conservados en BD por trazabilidad
historica, pero las rutas y paginas de Solicitudes y Retornos fueron **eliminadas del
frontend**. Maritza gestiona los insumos a traves de los Paquetes de insumos.

### 3.3 Registro de modelos en `main.py` Y `crear_admin.py` Y `seed_demo.py`

Orden de importacion obligatorio (por FKs). **Los tres scripts deben tener estos imports:**
```python
from app.models import asignatura         # antes de taller
from app.models import clase_docente      # FK a asignatura
from app.models import solicitud          # FK a clase_docente
from app.models import taller             # FK a asignatura — CRITICO
from app.models import paquete_insumo     # FK a taller e insumo — CRITICO
```

**Regla de oro:** si `Asignatura` tiene `relationship("Taller", ...)` y `Taller` no esta en el
mapper registry al ejecutar la primera query ORM, SQLAlchemy lanza
`InvalidRequestError: 'Taller' failed to locate a name`. Esto ocurre en cualquier script que
use `db.query(...)` sin haber importado todos los modelos relacionados.

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

**`/unidades-implemento`**
```
GET  /unidades-implemento/     ?implemento_id= ?sala_id= ?estado= ?incluir_inactivas=
POST /unidades-implemento/     sala_id=NULL -> bodega; sala_id=X -> sala clinica
GET  /unidades-implemento/{id}
PUT  /unidades-implemento/{id} actualiza estado, sala_id y notas
DELETE /unidades-implemento/{id}  (admin) soft-delete
```

### 3.5 RBAC

```python
get_usuario_actual   # cualquier JWT valido
require_operador     # admin, operador u operador_coordinador
require_admin        # solo admin
require_reportes     # admin, operador_coordinador o visor
```

### 3.6 Migraciones pendientes

En `database.py`, `MIGRACIONES_COLUMNAS` incluye:
```sql
ALTER TABLE IF EXISTS insumos ADD COLUMN IF NOT EXISTS unidad_medida VARCHAR(60)
ALTER TABLE IF EXISTS unidades_implemento ADD COLUMN IF NOT EXISTS sala_id INTEGER
    REFERENCES salas(id) ON DELETE SET NULL
```
Se ejecutan automaticamente al arrancar. Sin downtime ni perdida de datos.

---

## 4. Frontend

### 4.1 Estructura de paginas

```
frontend/src/pages/
  Dashboard, Alertas, Insumos, Movimientos, Salas, Categorias
  ActivosFijos, UnidadesImplemento
  Paquetes             <- tabla con filtros carrera->asignatura->taller->semestre
  Asignaturas, ClasesDocente, VerHorario, ImportarHorario
  Reportes, ImportarInsumos
  Perfil, Configuracion2FA, Usuarios, AuditLog
  Login, ResetPassword
```

### 4.2 Rutas en App.tsx

```
/insumos      -> Insumos (todos los roles)
/paquetes     -> Paquetes (admin, operador_coordinador, operador)
/asignaturas  -> Asignaturas (solo admin)
...
```

**Rutas eliminadas:** `/solicitudes` y `/retornos` — ya no existen en el sistema.

### 4.3 Sidebar

Menu actual (por orden de aparicion):
1. Dashboard
2. Alertas
3. Insumos e Implementos (renombrado desde "Insumos")
4. Activos Fijos
5. Movimientos
6. Salas
7. Categorias
8. Reportes
9. Paquetes de insumos (nuevo, FlaskConical, operador+)
10. Asignaturas (admin)
11. Clases Docentes (admin)
12. Ver Horario (admin)
13. Importar Horario (admin)
14. Importar Insumos (admin)
15. Usuarios (admin)
16. Audit Log (admin)

**Eliminados del sidebar:** Solicitudes y Retornos.

### 4.4 Pagina Insumos (`/insumos`)

- Titulo: "Insumos e Implementos"
- Columnas tabla: Nombre | Unidad de medida | Stock | Minimo | Vencimiento | Estado | Acciones
- Columna Costo/u eliminada (sigue en modelo para reportes)
- Columna Sala eliminada (la ubicacion se gestiona en UnidadImplemento)
- Formulario: campo Unidad de medida; campo Sala eliminado

### 4.5 Pagina UnidadesImplemento (`/insumos/:id/unidades`)

- Header muestra conteo "X en salas, Y en bodega"
- Columna Ubicacion: nombre de sala o badge "Bodega"
- Filtro de ubicacion (todas / bodega / sala especifica)
- Modal: selector "Ubicacion fisica" — opcion por defecto = "Bodega"

### 4.6 Pagina Paquetes (`/paquetes`)

Tabla con filtros en cascada:
1. Carrera -> filtra las asignaturas disponibles
2. Asignatura -> filtra los talleres disponibles
3. Taller -> filtra los paquetes en el backend
4. Semestre -> filtro adicional en el backend

Cada fila es expandible para ver los items del paquete. Boton Lock/Unlock por paquete.

### 4.7 Proxy Vite

Prefijos registrados: `/auth`, `/insumos`, `/importar`, `/resumen`, `/salas`,
`/categorias`, `/usuarios`, `/movimientos`, `/audit-log`, `/asignaturas`,
`/clases-docente`, `/reportes`, `/activos-fijos`, `/unidades-implemento`,
`/talleres`, `/paquetes`.

**Eliminados del proxy:** `/solicitudes`, `/retornos`.

### 4.8 Badge

Variantes disponibles: `default` | `warning` | `danger` | `success` | `info` | `purple`.
- `purple` -> Preparador Fisico en Asignaturas y Paquetes.

---

## 5. Reglas para trabajar en este repositorio

1. **Leer el codigo real antes de escribir.** Usar MCP de GitHub para ver los archivos
   actuales. Para frontend, leer tambien DESIGN.md.
2. **Flake8 primero.** No usar espacios de alineacion visual (E221). Lineas <= 100 chars.
3. **Proxy de Vite.** Al agregar un router FastAPI, agregar su prefix en `vite.config.ts`.
4. **Importar modelos en `main.py`, `crear_admin.py` Y `seed_demo.py` en orden de FK.**
5. **Rutas estaticas antes que dinamicas.** `/alertas`, `/exportar`, `/mis-clases` van
   ANTES de `/{id}`.
6. **Try/catch en fetches del frontend.**
7. **Sincronizar tipos.** Al modificar un schema Pydantic, actualizar
   `frontend/src/types/api.ts`.
8. **No exponer puertos 5432, 8000 ni 3000 a la LAN.** Los puertos 8000 y 3000 usan
   binding `127.0.0.1` en docker-compose.yml. Solo nginx (443/80) es accesible desde
   la red.
9. **`hashear_password()` de `security.py`.**
10. **`registrar()` tiene commit propio.**
11. **SKU auto-generado.** `db.flush()` para obtener ID, luego `sku = f"HST-{id:05d}"`.
12. **`datetime-local` usa hora local.**
13. **Enum `carreraasignatura`.** Valores: `TENS|TQF|TLCBS|TONS|preparador_fisico`.
14. **Enum `rolusuario`.** Valores: `admin|operador_coordinador|operador|visor`. Sin
    `docente`.
15. **Dark mode.** Nuevos componentes deben usar tokens `h-*` del sistema de diseno.
    Ver DESIGN.md para la estrategia completa.
16. **Sidebar colapsado.** Clave localStorage: `hestia-sidebar-collapsed`.
17. **Blob error parsing.** Peticiones con `responseType: 'blob'` que fallan entregan el
    error tambien como Blob. Convertir con `.text()` y parsear JSON para obtener el
    `detail` real.
18. **`require_reportes`.** Endpoints `/reportes/*` usan esta dependencia. `operador` no
    accede.
19. **Sin `require_docente`.** Eliminada. No referenciarla.
20. **Paquete bloqueado.** Si `bloqueado=true`, PUT y endpoints de items devuelven 409.
21. **`costo_unitario` oculto en UI.** Existe en BD/schemas para reportes, no en
    formulario.
22. **Sin rutas Solicitudes/Retornos.** Paginas eliminadas. Modelos existen en BD por
    trazabilidad.
23. **Logica de ubicacion fisica (CRITICO):**
    - Insumos desechables: siempre en Bodega. `sala_id = NULL` en `Insumo`. No asignar
      sala.
    - Implementos: tambien salen de Bodega, pero sus unidades fisicas pueden asignarse
      permanentemente a salas clinicas via `UnidadImplemento.sala_id`.
      - `UnidadImplemento.sala_id = NULL` -> unidad en Bodega.
      - `UnidadImplemento.sala_id = X` -> asignada a sala X (ej: sala 010).
      - El stock total del implemento en `Insumo.stock_actual` = suma de TODAS sus
        unidades.
    - `Insumo.sala_id` es un campo legado conservado en BD. No usarlo en nueva UI/logica.
    - El filtro por sala fue eliminado de la pagina Insumos. Para saber donde esta un
      implemento especifico, usar la pagina de Unidades Fisicas (`/insumos/:id/unidades`).
24. **HTTP 403 para segundo factor incorrecto (CRITICO):**
    Los endpoints `/auth/2fa/completar-login`, `/auth/2fa/activar-inicial` y
    `/auth/2fa/activar` devuelven **403** (no 401) cuando el codigo TOTP es incorrecto.
    Usar 401 dispararia el interceptor de Axios en `client.ts`, que haria logout
    automatico y destruiria el estado del flujo de setup. 403 = "credencial de segundo
    factor incorrecta, la sesion sigue viva". El interceptor tambien excluye URLs que
    contienen `/auth/2fa/` como defensa en profundidad.

---

## 6. Estado de funcionalidades

| Area | Funcionalidad | Estado |
|---|---|---|
| Inventario | CRUD insumos/implementos con filtros | OK |
| Inventario | Unidad de medida | OK mayo 2026 |
| Inventario | Tipo insumo/implemento | OK |
| Inventario | SKU + codigo de barras | OK |
| Inventario | Fecha de vencimiento | OK |
| Inventario | Exportacion CSV/XLSX | OK |
| Inventario | Importacion CSV/XLSX | OK |
| Implementos | sala_id por unidad fisica (Bodega vs sala clinica) | OK mayo 2026 |
| Academico | Asignaturas agrupadas por carrera | OK mayo 2026 |
| Academico | 5 carreras: TENS/TQF/TLCBS/TONS/preparador_fisico | OK |
| Academico | Talleres CRUD | OK mayo 2026 |
| Academico | Paquetes de insumos (Guia de Taller) | OK mayo 2026 |
| Academico | Vista Paquetes con filtros carrera->asig->taller->semestre | OK mayo 2026 |
| Academico | Clases (asig+seccion+semestre) | OK |
| Academico | Importar horario CSV | OK |
| Auth | Login + JWT + TOTP 2FA | OK |
| Auth | Bug TOTP setup: codigo incorrecto ya no reinicia el flujo | OK junio 2026 |
| Seguridad | Puertos 8000/3000 restringidos a localhost (no LAN) | OK junio 2026 |
| Usuarios | RBAC admin/operador_coordinador/operador/visor | OK |
| Usuarios | Rol docente eliminado | OK |
| Solicitudes | Pagina y rutas eliminadas del frontend | OK mayo 2026 |
| Retornos | Pagina y rutas eliminadas del frontend | OK mayo 2026 |
| Dashboard | Metricas + grafico + feed | OK |
| Audit log | Historial de acciones | OK |
| UI | Sidebar colapsable | OK |
| UI | Modo oscuro/claro | OK (layout; paginas internas pendiente) |
| Reportes | Valorizacion del stock | OK |
| Reportes | Costo por carrera | OK |
| Diseno | Sistema de tokens de color (DESIGN.md Layer 1) | OK junio 2026 |
| Diseno | Login dark-first con blob + shimmer + animacion TOTP | OK junio 2026 |

### Pendiente

| Funcionalidad | Complejidad |
|---|---|
| CRUD de Talleres desde el frontend (UI completa) | Media |
| Vista movil de Operadoras — Guia del dia por sala | Media |
| Reporte de conflictos de recursos (phantomas sobredemandados) | Media |
| Reportes exportables en Excel con filtros | Media |
| Dark mode en paginas internas (ver DESIGN.md seccion 6) | Media |
| Extraer ShimmerButton a componente reutilizable | Media |
| Fade-in de paginas al navegar entre rutas (Layer 3) | Media |
| Gradiente/aurora leve en header del Sidebar (Layer 2) | Baja |
| Permisos diferenciados del operador_coordinador | Baja |
| Fijar versiones de dependencias con hashes SHA-256 (pip-tools) | Baja |

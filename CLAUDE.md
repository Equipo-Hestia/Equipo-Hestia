# CLAUDE.md — Contexto técnico de Hestia

Este archivo es el punto de entrada para cualquier asistente de IA que trabaje en este repositorio. Contiene el estado real del proyecto, las convenciones establecidas y las reglas que hay que respetar.

---

## 1. Qué es Hestia

Sistema web de gestión de stock de insumos médicos para la Escuela de Salud de DuocUC, sede San Bernardo. Desarrollado por estudiantes de Informática Biomédica como proyecto de Ruta IE. El sistema corre en red LAN interna; no tiene IP pública ni dominio.

**Stack completo:**
- Backend: Python 3.11 · FastAPI · PostgreSQL 16 · SQLAlchemy 2.0 · Pydantic v2
- Frontend: React 19 · Vite · TypeScript · Tailwind CSS · Zustand · Axios · lucide-react ^0.396 · @zxing/browser ^0.1.4
- Tipografía: Nunito (Google Fonts) — cambiada desde Nunito Sans en mayo 2025
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
Genera 8 salas, 10 categorías, 10 usuarios (5 docentes), 8 asignaturas, 10 clases docentes, 88 insumos (con tipo/costo/SKU), y ~560 movimientos distribuidos en 60 días. Los docentes de demo tienen clases asignadas en semestre 2025-1.

---

## 3. Backend

### 3.1 Estructura

```
backend/
├── app/
│   ├── main.py            # FastAPI app, middleware, registro de routers
│   ├── database.py        # Engine, SessionLocal, Base, get_db(), migraciones
│   ├── models/
│   │   ├── usuario.py
│   │   ├── sala.py
│   │   ├── categoria.py
│   │   ├── insumo.py
│   │   ├── movimiento.py
│   │   ├── solicitud.py        # SolicitudRetiro + SolicitudItem
│   │   ├── retorno_implemento.py  # RetornoImplemento (Fase 2)
│   │   ├── asignatura.py       # Asignatura (Fase 4)
│   │   ├── clase_docente.py    # ClaseDocente (Fase 4)
│   │   └── audit_log.py
│   ├── schemas/
│   │   ├── comun.py            # PaginatedResponse[T]
│   │   ├── usuario.py
│   │   ├── insumo.py           # TipoInsumo enum, sku, codigo_barras, costo_unitario
│   │   ├── movimiento.py
│   │   ├── solicitud.py        # clase_docente_id, asignatura_nombre, seccion, semestre
│   │   ├── retorno.py          # RetornoResponse, MarcarRetornoRequest
│   │   ├── asignatura.py
│   │   ├── clase_docente.py
│   │   ├── sala.py
│   │   ├── categoria.py
│   │   └── audit_log.py
│   ├── routes/
│   │   ├── auth.py             # /auth
│   │   ├── usuarios.py         # /usuarios
│   │   ├── insumos.py          # /insumos
│   │   ├── movimientos.py      # /movimientos
│   │   ├── solicitudes.py      # /solicitudes
│   │   ├── retornos.py         # /retornos (Fase 2)
│   │   ├── asignaturas.py      # /asignaturas (Fase 4)
│   │   ├── clases_docente.py   # /clases-docente (Fase 4)
│   │   ├── salas.py            # /salas
│   │   ├── categorias.py       # /categorias
│   │   ├── resumen.py          # /resumen
│   │   ├── importar.py         # /importar
│   │   └── audit_log.py        # /audit-log
│   └── utils/
│       ├── security.py         # hashing, JWT
│       ├── deps.py             # FastAPI dependencies (RBAC)
│       ├── rate_limit.py
│       └── auditoria.py
├── seed_demo.py
├── crear_admin.py
├── .flake8
└── requirements.txt
```

### 3.2 Modelos SQLAlchemy

**`Usuario`** (`usuarios`)
```
id · nombre · email (unique) · password_hash
rol (Enum: admin|operador_coordinador|operador|visor|docente)
totp_secret · totp_habilitado · recovery_codes (JSON Text)
avatar_b64 (Text, base64 PNG 256×256, nullable)
activo (Boolean, default True — soft-delete)
Relaciones: solicitudes_retiro → · clases_docente →
```

**`Sala`** (`salas`) — `id · nombre · tipo · descripcion`

**`Categoria`** (`categorias`) — `id · nombre`

**`Insumo`** (`insumos`)
```
id · nombre · descripcion · stock_actual · stock_minimo
tipo (Enum PG: insumo|implemento)  ← implemento debe retornar al área común
sku (VARCHAR 20, unique index parcial WHERE NOT NULL, auto-generado HST-XXXXX)
codigo_barras (VARCHAR 100, unique index parcial WHERE NOT NULL)
costo_unitario (NUMERIC 10,2, nullable — para reportes de valorización)
sala_id (FK nullable) · categoria_id (FK nullable)
activo (Boolean, soft-delete)
Relaciones: sala ← · categoria ← · movimientos →
```

**`Movimiento`** (`movimientos`)
```
id · tipo (Enum: entrada|salida) · cantidad · motivo
fecha (DateTime timezone=True, server_default=now())
insumo_id (FK) · usuario_id (FK)
```

**`Asignatura`** (`asignaturas`) ← Fase 4
```
id · nombre · codigo (VARCHAR 20, unique) · activa (Boolean)
Relaciones: clases →
```

**`ClaseDocente`** (`clases_docente`) ← Fase 4
```
id · docente_id (FK usuarios) · asignatura_id (FK asignaturas)
seccion (VARCHAR 10, ej: '001D') · semestre (VARCHAR 10, ej: '2025-1')
activa (Boolean)
Relaciones: docente ← · asignatura ←
```

**`SolicitudRetiro`** (`solicitudes_retiro`)
```
id · docente_id (FK usuarios) · sala_id (FK salas)
clase_docente_id (FK clases_docente, nullable — permite trazabilidad académica)
fecha_clase (DateTime timezone=True)
estado (Enum: pendiente|en_preparacion|completada)
notas (Text nullable) · notas_operador (Text nullable)
fecha_creacion · fecha_completada
Relaciones: docente ← · sala ← · clase_docente ← · items →
```

El stock se descuenta al completar (no al crear). Para items de tipo `implemento`, se crea un `RetornoImplemento` pendiente al completar.

**`SolicitudItem`** (`solicitudes_items`)
```
id · solicitud_id (FK, cascade delete) · insumo_id (FK) · cantidad_solicitada
```

**`RetornoImplemento`** (`retornos_implemento`) ← Fase 2
```
id · insumo_id (FK) · solicitud_id (FK nullable) · docente_id (FK nullable)
sala_id (FK nullable) · cantidad · fecha_retiro · fecha_retorno (nullable)
estado (Enum PG: pendiente|retornado|no_retornado)
operador_id (FK nullable) · notas (Text nullable)
```
- `retornado`: el operador confirmó que volvió al área común; se suma stock
- `no_retornado`: no apareció; se registra como merma sin tocar stock

**`AuditLog`** (`audit_log`)
```
id · fecha · accion · entidad · entidad_id · detalle · ip
usuario_id (FK nullable, ondelete=SET NULL) · usuario_nombre (denormalizado)
```

### 3.3 Registro de modelos en `main.py`

```python
from app.models import sala, categoria, usuario, movimiento, insumo  # noqa
from app.models import audit_log         # noqa
from app.models import asignatura        # noqa  ← importar antes de clase_docente
from app.models import clase_docente     # noqa  ← FK a asignatura y usuario
from app.models import solicitud         # noqa  ← FK a clase_docente
from app.models import token_recuperacion  # noqa
from app.models import retorno_implemento  # noqa
```
**Regla:** al agregar un modelo nuevo, importarlo en `main.py` antes de `create_all()` respetando el orden de FKs.

### 3.4 Endpoints

**`/auth`**
```
POST /auth/login
POST /auth/2fa/completar-login
POST /auth/2fa/recuperar-acceso
POST /auth/2fa/setup
POST /auth/2fa/activar
POST /auth/2fa/desactivar
```

**`/usuarios`** (admin para escritura, /me para cualquier rol)
```
GET  /usuarios/              → PaginatedResponse[UsuarioResponse]
GET  /usuarios/me
POST /usuarios/me/cambiar-password
POST /usuarios/
GET  /usuarios/{id}
PUT  /usuarios/{id}
DELETE /usuarios/{id}
POST /usuarios/{id}/reset-2fa
```

**`/insumos`** — rutas estáticas ANTES de `/{insumo_id}`
```
GET  /insumos/alertas
GET  /insumos/alertas-resueltas    ?dias=30
GET  /insumos/exportar             ?formato=csv|xlsx  ← ambos formatos reales
GET  /insumos/sugerencias          ?q= (autocompletado)
GET  /insumos/                     filtros: nombre, sala_id, categoria_id,
                                            bajo_stock, incluir_inactivos, tipo
GET  /insumos/{id}
POST /insumos/                     auto-genera sku HST-XXXXX si no se provee
PUT  /insumos/{id}
DELETE /insumos/{id}              admin + TOTP
```

**`/movimientos`**
```
GET  /movimientos/exportar         ?formato=csv|xlsx
GET  /movimientos/
POST /movimientos/                 SELECT FOR UPDATE
GET  /movimientos/insumo/{id}
GET  /movimientos/sala/{id}
```

**`/solicitudes`** — ventana [+2h, +7 días] antes de fecha_clase
```
GET  /solicitudes/resumen-recientes
GET  /solicitudes/mis-solicitudes   (docente)
GET  /solicitudes/                  (operador+; ?estado=)
POST /solicitudes/                  valida clase_docente_id si se provee
PUT  /solicitudes/{id}/en-preparacion
POST /solicitudes/{id}/completar    genera RetornoImplemento para implementos
```

**`/retornos`** ← Fase 2
```
GET  /retornos/hoy                  implementos retirados desde medianoche UTC
GET  /retornos/pendientes           todos los pendientes (incluye días anteriores)
PUT  /retornos/{id}/marcar          {estado: retornado|no_retornado, notas?}
                                    retornado → suma stock con SELECT FOR UPDATE
```

**`/asignaturas`** ← Fase 4 (admin escritura, cualquier rol lectura)
```
GET  /asignaturas/                  ?incluir_inactivas=bool
POST /asignaturas/
PUT  /asignaturas/{id}
```

**`/clases-docente`** ← Fase 4 — /mis-clases ANTES de /{clase_id}
```
GET  /clases-docente/mis-clases     clases activas del usuario autenticado
GET  /clases-docente/               admin/operador: todas; docente: las suyas
                                    ?docente_id= ?semestre= ?solo_activas=
POST /clases-docente/               (admin)
PUT  /clases-docente/{id}           (admin)
```

**`/salas`** · **`/categorias`**: CRUD estándar.

**`/resumen`**
```
GET  /resumen/
GET  /resumen/grafico-semana
GET  /resumen/actividad-reciente
GET  /resumen/top-insumos-retirados
```

**`/importar`** (admin + TOTP)
```
GET  /importar/plantilla                           CSV de ejemplo para insumos
GET  /importar/plantilla-horario?formato=csv|xlsx  plantilla de horario académico
POST /importar/insumos                             CSV/XLSX de insumos (form + TOTP)
POST /importar/horario-academico                   JSON {filas:[]} con TOTP en header
                                                   x-totp-code; crea/actualiza ClaseDocente
```

**`/audit-log`** (admin)

### 3.5 RBAC y dependencias

```python
get_usuario_actual   # cualquier JWT válido
require_docente      # solo docente
require_operador     # admin, operador u operador_coordinador
require_admin        # solo admin
```

**Rol `operador_coordinador`:** tiene exactamente los mismos accesos que `operador` a través de `require_operador`. Sus permisos adicionales se definirán tras reunión del 25/05/2026.

### 3.6 Seguridad

- **Hashing:** SHA-256 prehash → bcrypt. Siempre usar `hashear_password()` / `verificar_password()` de `app/utils/security.py`.
- **JWT:** access token + pre_token (5 min, tipo=pre_auth). Los endpoints protegidos rechazan pre_tokens.
- **Rate limiting:** por email, en memoria. 5 intentos / 5 min → bloqueo 15 min.
- **Security headers:** CSP, X-Frame-Options, Permissions-Policy: `camera=(self)` (necesario para escaneo de código de barras desde móvil).
- **Audit log:** `registrar()` hace commit propio e inmediato.

### 3.7 Convenciones flake8

`backend/.flake8`: `max-line-length=100`. Ignorados: E302, W292, W503, E402, F401.

**Errores que causan fallos en CI y hay que evitar:**
- **E221:** múltiples espacios antes de `=` — NO alinear asignaciones de variables o columnas:
  ```python
  # MAL
  id       = Column(...)
  nombre   = Column(...)
  # BIEN
  id = Column(...)
  nombre = Column(...)
  ```
- **E241:** múltiples espacios después de `:` en dicts.
- **E501:** líneas > 100 caracteres.

Nota: los espacios de alineación DENTRO de tuplas o listas (ej: en `INSUMOS` de `seed_demo.py`) no son E221 porque no hay operador `=`.

---

## 4. Frontend

### 4.1 Estructura

```
frontend/src/
├── App.tsx
├── api/client.ts
├── store/
│   ├── auth.ts        → Zustand (autenticación, persiste token+user en localStorage)
│   └── theme.ts       → Zustand (modo oscuro, persiste isDark; clave: 'hestia-theme')
├── types/api.ts          # sincronizado con schemas Pydantic
├── pages/
│   ├── Login.tsx
│   ├── Dashboard.tsx
│   ├── Alertas.tsx
│   ├── Insumos.tsx           # tipo/SKU/barcode/costo + escaneo cámara
│   ├── Movimientos.tsx
│   ├── SolicitudDocente.tsx  # selector de clase, ventana 2h-7d
│   ├── SolicitudOperador.tsx # muestra asignatura/sección en cada tarjeta
│   ├── RetornosOperador.tsx  # tabs Hoy/Pendientes, marcar retornado/merma
│   ├── Asignaturas.tsx       # CRUD (admin)
│   ├── ClasesDocente.tsx     # asignación docente→asignatura+sección (admin)
│   ├── ImportarHorario.tsx   # mapeo de columnas + TOTP; llama /importar/horario-academico
│   ├── Salas.tsx
│   ├── Categorias.tsx
│   ├── Configuracion2FA.tsx
│   ├── ImportarInsumos.tsx
│   ├── Perfil.tsx
│   ├── Usuarios.tsx
│   └── AuditLog.tsx
└── components/
    ├── layout/Layout.tsx
    ├── layout/Sidebar.tsx
    └── ui/
        ├── Badge.tsx
        ├── BarcodeScanner.tsx    # @zxing/browser, importación dinámica
        ├── Card.tsx
        ├── Logo.tsx
        ├── Modal.tsx
        ├── SearchSuggestions.tsx
        └── Skeleton.tsx
```

### 4.2 Rutas

```tsx
/login             → <Login />          (pública)
/dashboard         → <Dashboard />
/alertas           → <Alertas />
/insumos           → <Insumos />
/movimientos       → <Movimientos />
/solicitudes       → <SolicitudDocente /> (docente) | <SolicitudOperador /> (operador+)
/retornos          → <RetornosOperador />  (operador+)
/asignaturas       → <Asignaturas />       (admin)
/clases-docente    → <ClasesDocente />     (admin)
/importar-horario  → <ImportarHorario />   (admin)
/salas             → <Salas />
/categorias        → <Categorias />
/seguridad         → <Configuracion2FA />
/importar          → <ImportarInsumos />   (admin)
/perfil            → <Perfil />
/usuarios          → <Usuarios />          (admin)
/audit-log         → <AuditLog />          (admin)
```

### 4.3 Proxy de Vite — regla crítica

```typescript
proxy: {
  '/auth':           API,
  '/insumos':        API,
  '/importar':       API,
  '/resumen':        API,
  '/salas':          API,
  '/categorias':     API,
  '/usuarios':       API,
  '/movimientos':    API,
  '/audit-log':      API,
  '/solicitudes':    API,
  '/retornos':       API,
  '/asignaturas':    API,
  '/clases-docente': API,
}
```
**Regla:** al agregar un router en FastAPI, agregar su prefix aquí o el frontend devolverá HTML en lugar de JSON.

### 4.4 BarcodeScanner

Usa `@zxing/browser` con importación dinámica (code-splitting). Requiere HTTPS o localhost para acceder a `getUserMedia`. El header `Permissions-Policy: camera=(self)` ya está configurado en el backend. Para LAN con HTTPS se recomienda un proxy inverso (Caddy o nginx + cert autofirmado).

### 4.5 Patrones de componente

```typescript
// 1. Estado con useState
// 2. load() con useCallback
// 3. useEffect con dependencias explícitas
// 4. try/catch/finally en TODOS los fetches
// 5. Loading → skeleton → datos
// 6. Toast 3 segundos para feedback
// 7. Modal para crear/editar/eliminar
```

### 4.6 Store de autenticación

Zustand persiste `token` y `user: {nombre, email, rol}` en localStorage. El interceptor Axios inyecta el JWT. 401 → limpia storage + redirect `/login`.

### 4.7 Tema (modo oscuro / claro)

- **Estrategia Tailwind:** `darkMode: 'class'` en `tailwind.config.js`. El modo se activa añadiendo la clase `dark` al elemento `<html>`.
- **Store:** `store/theme.ts` — Zustand con `persist`. Clave localStorage: `hestia-theme`. Estructura: `{state: {isDark: boolean}, version: 0}`. Light Mode es el valor por defecto (`isDark: false`).
- **Aplicación:** `Layout.tsx` tiene un `useEffect` que sincroniza `document.documentElement.classList` con `isDark` cada vez que cambia.
- **Anti-FOUC:** `index.html` incluye un script inline (antes de que React cargue) que lee `hestia-theme` del localStorage y aplica la clase `dark` inmediatamente para evitar el destello de modo claro en usuarios con dark mode activo.
- **Toggle:** botón Sol/Luna en la parte inferior del Sidebar, visible en ambos estados (colapsado y expandido).
- **Nuevos componentes:** deben incluir variantes `dark:` de Tailwind para los colores de fondo, texto y bordes. Ejemplo: `bg-white dark:bg-slate-800`, `text-slate-900 dark:text-slate-50`.
- **Páginas existentes:** las páginas individuales (Dashboard, Insumos, etc.) aún no tienen variantes `dark:` aplicadas; el fondo general sí cambia via Layout. Cada página deberá recibir su propio tratamiento de dark mode en iteraciones futuras.

### 4.8 Sidebar colapsable

- **Estado:** `useState` inicializado desde `localStorage.getItem('hestia-sidebar-collapsed')`. Se persiste en `localStorage` con clave `hestia-sidebar-collapsed` en cada cambio via `useEffect`.
- **Expandido:** ancho `w-60` (240px). Muestra Logo + nombre del sistema + íconos con etiquetas de texto.
- **Colapsado:** ancho `w-16` (64px). Muestra Logo solo + íconos centrados sin texto. Tooltips CSS (`opacity-0 group-hover:opacity-100`) muestran el nombre de cada ítem al hacer hover.
- **Transición:** `transition-all duration-300 ease-in-out` en el elemento `<aside>`.
- **Botón de toggle:** arriba del sidebar, ícono `ChevronLeft` (para colapsar) / `ChevronRight` (para expandir).

---

## 5. Flujo de autenticación

```
POST /auth/login
  ├─ Sin 2FA: → access_token
  └─ Con 2FA: → pre_token → POST /auth/2fa/completar-login → access_token
```

---

## 6. Flujo de retiro (Fases 1-4)

```
Docente crea solicitud (ventana 2h-7d antes de clase)
  → opcionalmente vincula a ClaseDocente (asignatura+sección)
  → estado: pendiente

Operador ve bandeja → "Marcar en preparación"
  → estado: en_preparacion

Operador completa:
  → descuenta stock (SELECT FOR UPDATE)
  → crea Movimiento(salida) por cada item
  → si item.insumo.tipo == implemento:
      crea RetornoImplemento(estado=pendiente)
  → estado: completada

Operador revisa RetornosOperador (fin del día):
  → retornado   → stock += cantidad
  → no_retornado → merma, stock sin cambio
```

---

## 7. Variables de entorno

`backend/.env`:
```
DATABASE_URL=postgresql://postgres:hestia_pass@db:5432/hestia_db
SECRET_KEY=<clave secreta JWT>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480
```

`frontend/.env` (solo producción/LAN):
```
VITE_API_URL=http://<IP_SERVIDOR>:8000
```

---

## 8. CI/CD

- Trigger: push a `main` o `develop`
- `flake8 app/ --max-line-length=100`
- `seed_demo.py` no es chequeado por CI (está fuera de `app/`)
- No hay CI para TypeScript/ESLint actualmente

---

## 9. Funcionalidades implementadas

| Área | Funcionalidad | Estado |
|---|---|---|
| Inventario | CRUD insumos con filtros server-side | ✅ |
| Inventario | Tipo insumo/implemento | ✅ Fase 1 |
| Inventario | SKU auto-generado + código de barras | ✅ Fase 1 |
| Inventario | Costo unitario | ✅ Fase 1 |
| Inventario | Escaneo por cámara (@zxing/browser) | ✅ Fase 1 |
| Inventario | Alertas stock mínimo (activas + resueltas) | ✅ |
| Inventario | Exportación CSV/XLSX real con filtros | ✅ |
| Inventario | Importación CSV/XLSX + tipo/sku/costo | ✅ |
| Inventario | Autocompletado en búsqueda | ✅ |
| Movimientos | Registro entrada/salida + listado + filtros | ✅ |
| Movimientos | Exportación CSV/XLSX | ✅ |
| Solicitudes | Flujo docente → operador | ✅ |
| Solicitudes | Ventana 2h-7d antes de clase | ✅ Fase 3 |
| Solicitudes | Trazabilidad por asignatura/sección | ✅ Fase 4 |
| Solicitudes | SELECT FOR UPDATE en completar | ✅ |
| Retornos | Flujo retorno de implementos | ✅ Fase 2 |
| Retornos | Restaurar stock al retornar | ✅ Fase 2 |
| Académico | Asignaturas CRUD | ✅ Fase 4 |
| Académico | Clases docentes (asig+sección+semestre) | ✅ Fase 4 |
| Académico | Importar horario CSV con mapeo de columnas | ✅ |
| Auth | Login + JWT + TOTP 2FA + recovery codes | ✅ |
| Auth | Rate limiting | ✅ |
| Auth | Security headers + Permissions-Policy | ✅ |
| Usuarios | RBAC admin/operador_coordinador/operador/visor/docente | ✅ |
| Usuarios | CRUD + perfil + foto + cambiar clave | ✅ |
| Dashboard | Métricas + gráfico + feed + top insumos | ✅ |
| Audit log | Login, CRUD usuarios, insumos y movimientos | ✅ |
| UI | Sidebar colapsable con estado persistente | ✅ |
| UI | Modo oscuro/claro con preferencia persistente | ✅ (layout; páginas internas pendiente) |
| UI | Tipografía Nunito (Google Fonts) | ✅ |

### Pendiente / ideas para versiones futuras

| Funcionalidad | Complejidad |
|---|---|
| Dark mode en páginas internas (Dashboard, Insumos, etc.) | Media — requiere añadir dark: variants por página |
| Solicitud de compra en PDF (Operador Coordinador) | Media — pendiente reunión 25/05/2026 |
| Acceso a Ficha FER desde cada sala | Media — pendiente reunión 25/05/2026 |
| Ajuste permisos rol operador_coordinador | Baja — pendiente reunión 25/05/2026 |
| Recomendación de insumos por asignatura (historial) | Media |
| Reportes PDF: valorización, ABC, costo por estudiante | Media |
| Predicción de desabastecimiento | Media |
| Campo `fecha_vencimiento` en insumos | Media |
| Gestión de lotes | Muy alta |

---

## 10. Reglas para trabajar en este repositorio

1. **Leer el código real antes de escribir.** Usar MCP de GitHub para ver los archivos actuales.

2. **Flake8 primero.** No usar espacios de alineación visual en asignaciones (E221). Líneas ≤ 100 chars.

3. **Proxy de Vite.** Al agregar un router FastAPI, agregar su prefix en `vite.config.ts`.

4. **Importar modelos en `main.py` en orden de FK.** `asignatura` antes de `clase_docente`, `clase_docente` antes de `solicitud`.

5. **Rutas estáticas antes que dinámicas.** `/alertas`, `/exportar`, `/mis-clases` van ANTES de `/{id}`.

6. **Try/catch en fetches del frontend.** Siempre incluir `catch` en funciones `load()` asíncronas.

7. **Sincronizar tipos.** Al modificar un schema Pydantic, actualizar `frontend/src/types/api.ts`.

8. **No exponer el puerto 5432.** El servicio `db` no tiene `ports:` en docker-compose.

9. **`hashear_password()` de `security.py`.** La columna del modelo es `password_hash`. Nunca llamar `bcrypt.hashpw()` directamente.

10. **`registrar()` tiene commit propio.** Llamar después del commit principal; para errores (LOGIN_FALLIDO) antes del `raise HTTPException`.

11. **SKU auto-generado.** Al crear insumos, hacer `db.flush()` para obtener el ID, luego `sku = f"HST-{id:05d}"` si no se proveyó uno.

12. **`datetime-local` usa hora local.** El helper `toDatetimeLocal(date)` del frontend formatea correctamente sin usar `toISOString()` (que daría UTC y desplazaría min/max por la zona horaria).

13. **Nuevo rol `operador_coordinador`.** Al agregar valores a `RolUsuario`, actualizar también `MIGRACIONES_ROL` en `database.py` para que la migración PG idempotente lo agregue al enum de PostgreSQL en el arranque.

14. **Dark mode.** Al crear nuevos componentes o páginas, incluir variantes `dark:` de Tailwind para todos los colores de fondo, texto y bordes. La clase `dark` se gestiona en `document.documentElement` desde `Layout.tsx`. El store está en `store/theme.ts`.

15. **Sidebar colapsado.** El estado de colapso se persiste en `localStorage` con clave `hestia-sidebar-collapsed`. En modo colapsado el sidebar tiene `w-16`; en expandido `w-60`.

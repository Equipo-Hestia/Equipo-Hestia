# Hestia

**Sistema de gestión de insumos médicos — Escuela de Salud DuocUC**

Hestia es una aplicación web para el control de stock de insumos e implementos en las salas clínicas de la Escuela de Salud de DuocUC, sede San Bernardo. Desarrollado por estudiantes de Informática Biomédica como proyecto de título y para una posterior posible implementación en ayuda de los estudiantes de la misma Escuela.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Backend | Python 3.11 · FastAPI · SQLAlchemy · Pydantic v2 |
| Base de datos | PostgreSQL 16 |
| Frontend | React 19 · Vite · TypeScript · Tailwind CSS · Zustand |
| Tipografía | Nunito (Google Fonts) |
| Autenticación | JWT · bcrypt · TOTP 2FA (Google Authenticator) |
| Contenedores | Docker · Docker Compose |
| CI | GitHub Actions (flake8) |

---

## Funcionalidades

- **Inventario** — CRUD de insumos con tipo (insumo desechable / implemento retornable), SKU, código de barras escaneable, costo unitario y filtros por nombre, sala, categoría, tipo y estado de stock
- **Activos Fijos** — gestión de muebles clínicos y phantomas de simulación como unidades físicas individuales, cada una con código de barras propio y código interno auto-generado (MUE-XXXXX / PHN-XXXXX); los phantomas incluyen nivel de fidelidad (baja/media/alta)
- **Escaneo de código de barras** — cámara del móvil desde el navegador (HTTPS/LAN, sin app nativa) usando `@zxing/browser`
- **Movimientos** — registro de entradas y salidas con trazabilidad por usuario; exportación CSV/XLSX con filtros
- **Alertas de stock** — insumos bajo mínimo y alertas resueltas con rango configurable
- **Dashboard** — métricas en tiempo real, gráfico semanal, feed de actividad reciente y top insumos retirados
- **Solicitudes de retiro** — flujo de retiro para docentes: carrito de insumos por clase, sala y asignatura/sección; ventana de 2 horas a 7 días antes de la clase; bandeja de gestión para operadores con indicadores de urgencia
- **Retorno de implementos** — al completar una solicitud, los implementos generan un registro pendiente de retorno; el operador confirma cuáles volvieron al área común (restaurando stock) y cuáles no (registrados como merma)
- **Asignaturas y clases docentes** — el admin asigna docentes a asignaturas y secciones por semestre; el docente selecciona su clase al solicitar, habilitando trazabilidad académica y futuros reportes de costo por estudiante
- **Importación masiva** — carga de insumos desde CSV o XLSX con verificación TOTP
- **Importación de horario académico** — carga de clases docentes desde CSV exportado de DuocUC, con mapeo de columnas interactivo y verificación TOTP
- **Exportación CSV/XLSX** — descarga del inventario con los filtros activos
- **Gestión de usuarios** — CRUD desde la UI con roles admin / operador coordinador / operador / visor / docente
- **Foto de perfil** — upload con redimensionado automático a 256×256
- **2FA** — setup wizard con códigos QR, códigos de recuperación y reset desde admin
- **Soft-delete** — usuarios e insumos se desactivan sin perder trazabilidad histórica
- **Audit log** — historial completo de acciones con filtros
- **Sidebar colapsable** — menú lateral con colapso a banda de íconos y tooltips; estado persistente entre sesiones (localStorage)
- **Modo oscuro / claro** — alternancia con botón en el sidebar; preferencia recordada entre sesiones (localStorage); Light Mode por defecto para usuarios nuevos
- **Seguridad** — rate limiting en login, security headers HTTP, BD no expuesta a la LAN

---

## Roles de usuario

| Rol | Acceso |
|---|---|
| `admin` | Acceso completo — gestión de usuarios, insumos, activos fijos, asignaturas, clases, importar, audit log |
| `operador_coordinador` | Igual que Operador — gestión de insumos, activos fijos, movimientos, salas, solicitudes y retornos. Sus permisos adicionales se definirán próximamente |
| `operador` | Insumos, activos fijos, movimientos, alertas, salas, categorías, bandeja de solicitudes, retornos |
| `visor` | Solo lectura — dashboard, insumos, activos fijos, movimientos, alertas, salas, categorías |
| `docente` | Exclusivo — carrito de retiro de insumos para su clase + historial propio |

---

## Requisitos previos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Git

No se requiere instalar Python, Node.js ni PostgreSQL de forma manual.

---

## Inicio rápido

### 1. Clonar el repositorio

```bash
git clone https://github.com/Hestia-Project-DuocUC/hestia.git
cd hestia
```

### 2. Crear el archivo de variables de entorno

```bash
cp backend/.env.example backend/.env
```

El `.env` generado funciona directamente para desarrollo local. Sin este archivo el contenedor no puede conectarse a la base de datos.

### 3. Levantar el proyecto

```bash
docker compose up --build
```

Esto levanta los tres servicios en orden:

| Servicio | URL local |
|---|---|
| Frontend (React) | http://localhost:3000 |
| API (FastAPI) | http://localhost:8000 |
| Docs interactivos | http://localhost:8000/docs |

La base de datos se crea automáticamente al iniciar la API. Las migraciones de esquema (columnas nuevas, valores de enum) se aplican de forma idempotente en cada arranque — no se pierden datos.

### 4. Cargar datos de demo (opcional)

Para una demo con 88 insumos médicos (incluyendo implementos retornables), 8 asignaturas, 10 clases asignadas a docentes, y ~560 movimientos distribuidos en 60 días:

```bash
docker compose exec api python seed_demo.py
```

El script pide confirmación antes de borrar datos existentes y muestra las credenciales generadas al finalizar.

**Credenciales de demo:**

| Email | Contraseña | Rol |
|---|---|---|
| `admin@hestia.duoc.cl` | `Admin2024!` | Administrador |
| `mgonzalez@hestia.duoc.cl` | `Oper2024!` | Operador |
| `cfuentes@hestia.duoc.cl` | `Oper2024!` | Operador |
| `amartinez@hestia.duoc.cl` | `Visor2024!` | Visor |
| `lperez@hestia.duoc.cl` | `Visor2024!` | Visor |
| `c.moreno@hestia.duoc.cl` | `Doc2024!` | Docente |
| `p.vasquez@hestia.duoc.cl` | `Doc2024!` | Docente |
| `r.ibanez@hestia.duoc.cl` | `Doc2024!` | Docente |
| `s.reyes@hestia.duoc.cl` | `Doc2024!` | Docente |
| `m.tapia@hestia.duoc.cl` | `Doc2024!` | Docente |

> Los 5 docentes ya tienen clases asignadas en el semestre 2025-1, por lo que al iniciar sesión verán el selector de clase al crear solicitudes.

---

## Comandos útiles

```bash
# Ciclo de vida
docker compose up                  # levantar sin reconstruir
docker compose up --build          # reconstruir imágenes y levantar  ← usar tras git pull
docker compose down                # apagar (los datos persisten)
docker compose down -v             # apagar y borrar la base de datos

# Recargar un servicio tras cambios de configuración
docker compose restart api         # tras cambios en variables de entorno
docker compose restart frontend    # tras cambios en vite.config.ts
docker compose restart nginx       # tras cambios en nginx.conf (sin --build)

# Logs en tiempo real
docker compose logs -f api
docker compose logs -f frontend
```

> **Importante:** después de un `git pull` que incluya cambios en el backend, usar siempre
> `docker compose up --build` para que los contenedores reflejen el código nuevo.
> `docker compose restart api` solo reinicia el proceso, no reconstruye la imagen.

---

## Despliegue en red LAN

Hestia está diseñado para correr en un servidor dentro de la red interna de DuocUC. Los clientes acceden únicamente desde su navegador; no instalan nada.

El proyecto incluye un servicio `nginx` con TLS configurado (certificado autofirmado). Los usuarios verán una advertencia de seguridad la primera vez; basta con aceptarla una vez por dispositivo.

```bash
docker compose up --build
```

Los usuarios acceden desde `https://<IP_SERVIDOR>` (puerto 443).

---

## Estructura del proyecto

```
hestia/
├── backend/
│   ├── app/
│   │   ├── models/        → SQLAlchemy (usuario, insumo, sala, categoria,
│   │   │                               movimiento, solicitud, audit_log,
│   │   │                               asignatura, clase_docente,
│   │   │                               retorno_implemento, activo_fijo)
│   │   ├── schemas/       → Pydantic v2
│   │   ├── routes/        → FastAPI routers
│   │   └── utils/         → security, deps (RBAC), rate_limit, auditoria
│   ├── crear_admin.py     → bootstrap del usuario admin al arrancar
│   ├── seed_demo.py       → cargador de datos de demo
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── pages/         → Dashboard, Insumos, Alertas, Movimientos,
│   │   │                    Usuarios, SolicitudDocente, SolicitudOperador,
│   │   │                    RetornosOperador, Asignaturas, ClasesDocente,
│   │   │                    ActivosFijos, Perfil, Configuracion2FA, AuditLog,
│   │   │                    ImportarInsumos, ImportarHorario…
│   │   ├── components/    → Layout, Sidebar, ui/ (Badge, Card, Modal,
│   │   │                    Skeleton, SearchSuggestions, BarcodeScanner,
│   │   │                    Logo)
│   │   ├── api/           → Axios client con interceptor JWT
│   │   ├── store/         → Zustand (auth, theme)
│   │   └── types/         → interfaces TypeScript sincronizadas con el backend
│   └── public/
│       └── logo.png
├── docker/
│   └── nginx/
│       └── nginx.conf     → reverse proxy HTTPS con TLS 1.2/1.3
├── docker-compose.yml
├── CLAUDE.md              → contexto técnico para asistentes IA
└── .github/
    ├── workflows/         → CI (validación flake8)
    ├── CONTRIBUTING.md
    └── PULL_REQUEST_TEMPLATE.md
```

---

## Flujo de trabajo del equipo

- Commits directos a `main` durante la fase de desarrollo activo
- El CI valida automáticamente con flake8 en cada push
- Para funcionalidades grandes o colaboración externa, abrir rama `feat/nombre` y Pull Request

Ver [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md) para más detalles.

---

## Equipo

Desarrollado por estudiantes de Informática Biomédica — DuocUC San Bernardo
Proyecto Ruta IE · Escuela de Salud · 2024–2025

---

**H**ospitalidad · **E**ficacia · **S**ervicio · **T**ransparencia · **I**nsumos · **A**postolado

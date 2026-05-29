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

- **Inventario** — CRUD de insumos e implementos con SKU, código de barras escaneable, unidad de medida (ej: “caja x100”, “frasco 500 mL”) y filtros por nombre, sala, categoría, tipo y estado de stock
- **Activos Fijos** — gestión de muebles clínicos y phantomas de simulación como unidades físicas individuales, cada una con código de barras propio y código interno auto-generado (MUE-XXXXX / PHN-XXXXX); los phantomas incluyen nivel de fidelidad (baja/media/alta)
- **Escaneo de código de barras** — cámara del móvil desde el navegador (HTTPS/LAN, sin app nativa) usando `@zxing/browser`
- **Movimientos** — registro de entradas y salidas con trazabilidad por usuario; exportación CSV/XLSX con filtros
- **Alertas de stock** — insumos bajo mínimo y alertas resueltas con rango configurable
- **Dashboard** — métricas en tiempo real, gráfico semanal, feed de actividad reciente y top insumos retirados
- **Talleres y Paquetes de insumos** — los talleres son las clases prácticas asociadas a cada asignatura; los paquetes definen qué insumos e implementos se necesitan por taller y semestre (Guía de Taller digital); vista con filtros en cascada por carrera → asignatura → taller → semestre
- **Asignaturas y clases** — el admin registra asignaturas por carrera (TENS, TQF, TLCBS, TONS, Preparador Físico) con su código oficial DuocUC; las clases vinculan asignatura, sección y semestre
- **Importación masiva** — carga de insumos desde CSV o XLSX con verificación TOTP
- **Importación de horario académico** — carga de clases desde CSV exportado de DuocUC, con mapeo de columnas interactivo y verificación TOTP
- **Exportación CSV/XLSX** — descarga del inventario con los filtros activos
- **Gestión de usuarios** — CRUD desde la UI con roles admin / operador coordinador / operador / visor
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
| `admin` | Acceso completo — gestión de usuarios, insumos, activos fijos, asignaturas, talleres, paquetes, clases, importar, audit log |
| `operador_coordinador` | Igual que Operador. Sus permisos adicionales se definirán próximamente |
| `operador` | Insumos, activos fijos, movimientos, alertas, salas, categorías, paquetes de insumos |
| `visor` | Solo lectura — dashboard, insumos, activos fijos, movimientos, alertas, salas, categorías |

> El rol `docente` fue eliminado. No hay solicitudes de retiro individuales: Maritza y las operadoras gestionan los paquetes de insumos antes del semestre.

---

## Salas

Hestia gestiona **18 salas** del piso -1 de la Escuela de Salud:

- **Salas 010–022** (13 salas clínicas de simulación)
- **Bodega** y **Oficina**
- **Salas 07, 08 y 09** — Odontología (edificio anexo, conectadas a la escuela)

---

## Carreras gestionadas

| Código | Carrera |
|---|---|
| `TENS` | Técnico en Enfermería |
| `TQF` | Técnico en Química y Farmacia |
| `TLCBS` | Técnico de Laboratorio Clínico y Banco de Sangre |
| `TONS` | Técnico en Odontología |
| `preparador_fisico` | Preparador Físico |

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

Para una demo con 88 insumos médicos, 19 asignaturas de las 5 carreras, 8 clases y ~560 movimientos distribuidos en 60 días:

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
│   │   │                               retorno_implemento, activo_fijo,
│   │   │                               taller, paquete_insumo)
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
│   │   │                    Usuarios, Paquetes, Asignaturas, ClasesDocente,
│   │   │                    ActivosFijos, Perfil, Configuracion2FA,
│   │   │                    AuditLog, ImportarInsumos, ImportarHorario…
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

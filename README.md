# Hestia

**Sistema de gestión de insumos médicos — Escuela de Salud DuocUC**

Hestia es una aplicación web para el control de stock de insumos e implementos en las salas clínicas de la Escuela de Salud de DuocUC, sede San Bernardo. Desarrollado por estudiantes de Informática Biomédica como proyecto de título.

> **Estado del proyecto (octubre 2026):** desarrollo cerrado. El sistema está en su versión final para la demo de defensa; no hay nuevas funcionalidades planificadas ni un despliegue productivo. Ver [`docs/DEMO.md`](docs/DEMO.md) para levantar la demo y [`docs/FLUJOS_USUARIO.md`](docs/FLUJOS_USUARIO.md) para los flujos por rol.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Backend | Python 3.11 · FastAPI · SQLAlchemy · Pydantic v2 |
| Base de datos | PostgreSQL 16 |
| Frontend | React 18.3.1 · Vite · TypeScript · Tailwind CSS · Zustand |
| Tipografía | Nunito (alojada en el proyecto, licencia OFL) |
| Autenticación | JWT · bcrypt · TOTP 2FA (Google Authenticator) |
| Contenedores | Docker · Docker Compose |
| CI | GitHub Actions (flake8, pip-audit, pytest contra PostgreSQL 16, npm audit) |

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
- **2FA obligatorio** — todos los usuarios deben configurar TOTP (Google Authenticator) en su primer login; setup wizard con código QR, 10 códigos de recuperación de un solo uso; solo el administrador puede resetear el 2FA de un usuario desde el panel de usuarios
- **Recuperación de contraseña** — autoservicio por email sin intervención del admin; enlace válido por 1 hora
- **Soft-delete** — usuarios e insumos se desactivan sin perder trazabilidad histórica
- **Audit log** — historial completo de acciones con filtros
- **Sidebar colapsable** — menú lateral con colapso a banda de íconos y tooltips; estado persistente entre sesiones (localStorage)
- **Modo oscuro / claro** — alternancia con botón en el sidebar; preferencia recordada entre sesiones (localStorage); Light Mode por defecto para usuarios nuevos
- **Seguridad** — rate limiting en login, security headers HTTP, BD no expuesta a la LAN
- **Vista de Salas** — mapa SVG interactivo del piso -1 y odontología con estados en tiempo real (en clase, pendiente revisión, revisada). Checklist operativo integrado
- **Incidencias** — registro de daños físicos, piezas perdidas o mal funcionamiento en activos fijos; con severidad (leve/moderada/crítica), estado (abierta/en revisión/resuelta) y foto adjunta opcional
- **Órdenes de Entrada** — flujo de compra de insumos y activos fijos (borrador → confirmada → en recepción → cerrada); el stock se actualiza solo al cerrar la orden; integrado con proveedores y actividades DuocUC
- **Proveedores** — CRUD de proveedores vinculados a activos fijos y órdenes de entrada (acceso coord/admin)
- **Importaciones** — hub unificado para importar insumos (CSV/XLSX), horario académico (CSV DuocUC) y programación semestral (xlsx)
- **Importar Programacion** — carga masiva de los Excel de planificación semestral al modelo ProgramacionTaller

---

## Roles de usuario

| Rol | Acceso |
|---|---|
| `admin` | Acceso completo: usuarios y reset de 2FA, asignaturas y clases, importaciones (insumos, horario, programación), audit log, más todo lo operativo |
| `operador_coordinador` | Operación más gestión: órdenes de entrada (compras), proveedores, docentes y sus comentarios, reportes de valorización, importar programación |
| `operador` | Operación diaria: insumos, unidades de implementos, movimientos, activos fijos, incidencias, mantenimiento, preparar taller, paquetes, revisión de salas. Sin acceso a reportes financieros |
| `visor` | Solo lectura de inventario, activos, movimientos, alertas y Vista de Salas, más reportes de valorización |

La matriz completa de módulos × roles (permiso real del backend y diferencias de la interfaz) está en [`docs/FLUJOS_USUARIO.md`](docs/FLUJOS_USUARIO.md).

> Los docentes no tienen cuenta en Hestia: son registros gestionados por la coordinación. No existen solicitudes de retiro individuales; la coordinación y las operadoras gestionan los paquetes de insumos antes del semestre.

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
git clone https://github.com/Equipo-Hestia/Equipo-Hestia.git hestia
cd hestia
```

### 2. Crear el archivo de variables de entorno

```bash
cp backend/.env.example backend/.env
```

El `.env` generado funciona tal cual para la demo y el desarrollo local (la contraseña de `DATABASE_URL` coincide con la de `docker-compose.yml`). Sin este archivo `docker compose` no arranca.

### 3. Levantar el proyecto

```bash
docker compose up --build
```

Esto levanta los cinco servicios (`db`, `api`, `frontend`, `nginx`, `backup`):

| Servicio | URL |
|---|---|
| Aplicación vía nginx (HTTPS) | https://localhost o `https://<IP-LAN>` |
| Frontend (React, solo este equipo) | http://localhost:3000 |
| API (FastAPI, solo este equipo) | http://localhost:8000 |
| Docs interactivos | http://localhost:8000/docs (solo con `DOCS_HABILITADOS=true` en `backend/.env`) |

La base de datos se crea sola. En cada arranque del contenedor `api` se aplican las migraciones Alembic, se crea el admin definido en `ADMIN_EMAIL`/`ADMIN_PASSWORD` si no existe y luego se levanta el servidor (`backend/start.sh`). No se pierden datos entre arranques.

### 4. Cargar datos de demo

Datos alineados al Centro de Simulación Clínica que cubren el **año académico 2026 completo hasta el momento de ejecutar el seed** (enero y febrero sin clases, semestre 2026-1 de marzo a julio, receso de invierno, semestre 2026-2 de agosto a mediados de diciembre y cierre de año, sin talleres en feriados). A mediados de diciembre incluye: 18 salas, 112 insumos e implementos (14 bajo mínimo, 3 agotados) con 318 unidades físicas operativas, 30 activos fijos en todos sus estados, 37 asignaturas de las 5 carreras que usan el centro (TENS, TQF, TLCBS, TONS y Preparador Físico, todas en ambos semestres) con 90 secciones, 50 talleres y 59 paquetes, ~1.470 talleres programados con su revisión de sala, 17 incidencias, 10 órdenes de mantenimiento, ~60 órdenes de entrada en todos los estados y ~11.200 movimientos de los 11 subtipos, con el stock cuadrado contra los movimientos. Incluye además cinco talleres programados para el día en que se ejecuta el seed, uno por cada estado del mapa de la Vista de Salas. El detalle está en [`docs/DEMO.md`](docs/DEMO.md#11-qué-datos-carga-el-seed).

```bash
docker compose exec api python seed_demo.py
```

El script pide confirmación, **borra todos los datos existentes**, carga los datos en unos 6 segundos, se autoverifica (si alguna garantía de la demo falla, no guarda nada y termina con error) y muestra las credenciales al finalizar. Conviene ejecutarlo el mismo día de la demo, poco antes de presentar.

**Credenciales de demo** (todas con 2FA ya configurado):

| Email | Contraseña | Rol |
|---|---|---|
| `admin@hestia.duoc.cl` | `Admin2024!` | Administrador |
| `psoto@hestia.duoc.cl` | `Coord2024!` | Operador coordinador |
| `mgonzalez@hestia.duoc.cl` | `Oper2024!` | Operador |
| `cfuentes@hestia.duoc.cl` | `Oper2024!` | Operador |
| `amartinez@hestia.duoc.cl` | `Visor2024!` | Visor |
| `lperez@hestia.duoc.cl` | `Visor2024!` | Visor |

Los secretos TOTP (y QR) para cargar estas cuentas en Google Authenticator, los códigos de recuperación y el guion paso a paso por rol están en [`docs/DEMO.md`](docs/DEMO.md). **Esos secretos son exclusivos de demo y no deben usarse en ningún otro entorno.**

> El seed también borra al admin de arranque del `.env` (`admin@hestia.cl` por defecto); se vuelve a crear, sin 2FA, al reiniciar el contenedor `api`.

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

# Migraciones de base de datos (Alembic)
docker compose exec api alembic revision --autogenerate -m "mensaje"  # nueva migracion
docker compose exec api alembic upgrade head                          # aplicar a mano

# Logs en tiempo real
docker compose logs -f api
docker compose logs -f frontend
```

> **Importante:** después de un `git pull` que incluya cambios en el backend, usar siempre
> `docker compose up --build` para que los contenedores reflejen el código nuevo.
> `docker compose restart api` solo reinicia el proceso, no reconstruye la imagen.

---

## Acceso desde la red LAN

Hestia está diseñado para correr en un equipo dentro de una red interna (en la demo, el notebook del equipo). Los clientes acceden solo desde el navegador; no instalan nada. Solo nginx (puertos 80/443) es alcanzable desde la LAN; la BD, la API y el frontend quedan restringidos a `localhost`.

El servicio `nginx` genera un certificado autofirmado en el primer arranque. Los navegadores muestran una advertencia la primera vez; basta con aceptarla una vez por dispositivo. Para incluir la IP real del equipo en el certificado, ejecuta `./generate-cert.sh` y luego `docker compose restart nginx`.

Los usuarios acceden desde `https://<IP-del-equipo>` (puerto 443). La cámara para escanear códigos de barras requiere HTTPS.

**Recuperación de contraseña:** sin `SMTP_HOST` configurado, el enlace no se envía por correo; aparece en `docker compose logs api | grep "Recovery link"`.

---

## Estructura del proyecto

```
hestia/
├── backend/
│   ├── app/
│   │   ├── models/        → SQLAlchemy (usuario, insumo, sala, categoria,
│   │   │                               movimiento, audit_log,
│   │   │                               asignatura, clase_docente,
│   │   │                               activo_fijo, unidad_implemento,
│   │   │                               taller, paquete_insumo,
│   │   │                               programacion_taller, revision_sala,
│   │   │                               orden_mantenimiento, incidencia,
│   │   │                               orden_entrada, proveedor)
│   │   ├── schemas/       → Pydantic v2
│   │   ├── routes/        → FastAPI routers
│   │   └── utils/         → security, deps (RBAC), rate_limit, auditoria
│   ├── alembic/            → migraciones de esquema (Alembic)
│   ├── crear_admin.py     → bootstrap del usuario admin al arrancar
│   ├── seed_demo.py       → cargador de datos de demo
│   ├── start.sh            → entrypoint: alembic upgrade head → crear_admin → uvicorn
│   ├── tests/             → pruebas automáticas (pytest) contra PostgreSQL 16
│   ├── requirements.txt
│   ├── requirements-dev.txt → dependencias de pruebas (pytest, httpx)
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
│   ├── nginx/             → reverse proxy HTTPS (TLS 1.2/1.3) + cert autofirmado
│   └── backup/            → pg_dump diario cifrado (cron)
├── docs/
│   ├── DEMO.md            → guion de demo, credenciales y 2FA de demo, checklist
│   ├── FLUJOS_USUARIO.md  → matriz módulos × roles y flujos principales
│   ├── PRUEBAS.md         → reporte de pruebas automáticas (generado por pytest)
│   └── demo-2fa/          → QR de los secretos TOTP de demo
├── docker-compose.yml
├── DESIGN.md              → sistema de diseño del frontend
├── CLAUDE.md              → contexto técnico para asistentes IA
└── .github/
    ├── workflows/         → CI: flake8, pip-audit, pytest y npm audit
    ├── CONTRIBUTING.md
    └── PULL_REQUEST_TEMPLATE.md
```

---

## Limitaciones conocidas

- **Coordinador en Asignaturas y Clases:** la interfaz le muestra los botones de crear y editar, pero el backend exige rol admin y responde 403. Esas acciones se hacen con la cuenta admin. En Insumos, Movimientos, Categorías y Salas ocurre lo inverso: la interfaz oculta al coordinador los botones de escritura que el backend sí le permitiría. Detalle en [`docs/FLUJOS_USUARIO.md`](docs/FLUJOS_USUARIO.md).
- **Respaldos:** el contenedor `backup` ejecuta `pg_dump` todos los días a las **02:00 hora de Chile** (`TZ=America/Santiago`), lo comprime y lo cifra con AES-256-CBC. Guarda 7 diarios en `/backups/diarios` y 4 semanales (los lunes) en `/backups/semanales`, dentro del volumen `backup_data`. Como `crond` no hereda el entorno del contenedor, `entrypoint.sh` guarda `POSTGRES_*`, `DB_HOST`, `BACKUP_ENCRYPTION_KEY` y `TZ` en `/etc/backup.env`, y `backup.sh` carga ese archivo. El log de cada ejecución programada (cron) queda en `/backups/backup.log` (`docker compose exec backup cat /backups/backup.log`). Respaldo manual: `docker compose exec backup backup.sh`; su salida aparece en la terminal y **no** se agrega a `backup.log`. La clave sale de `BACKUP_ENCRYPTION_KEY` en `backend/.env` (el compose ya no define un valor por defecto). Si falta o sigue siendo un valor de ejemplo, el contenedor lo advierte en `docker compose logs backup` (sin mostrar la clave) y, si falta, el respaldo se aborta. Guarda la clave aparte: sin ella no se puede descifrar ningún respaldo. Para restaurar en una base temporal:
  ```bash
  docker compose exec -T backup sh -c 'openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
    -pass env:BACKUP_ENCRYPTION_KEY -in /backups/diarios/<archivo>.enc | gunzip' > dump.sql
  docker compose exec db createdb -U postgres hestia_restore
  docker compose exec -T db psql -U postgres -d hestia_restore < dump.sql
  ```
- **Escaneo de dependencias en CI:** el workflow instala `backend/requirements.txt` y `backend/requirements-dev.txt` y ejecuta `pip-audit` sobre ambos. El paso es **bloqueante**: falla si encuentra cualquier vulnerabilidad conocida. El frontend tiene dos pasos: `npm audit --omit=dev --audit-level=high` (bloqueante, solo dependencias de runtime) y una auditoría completa informativa (`continue-on-error`) que incluye las herramientas de build.
- **Vulnerabilidades conocidas en dependencias del frontend (noviembre 2026):** la auditoría completa informativa del CI reporta 1 alta y 3 moderadas; el paso bloqueante (solo runtime) no reporta altas.
  - **`vite` 6.4.3 (alta):** avisos de `launch-editor` (GHSA-587h-7wmj-h5pm alta; GHSA-698v-4r3x-3vcv y GHSA-r825-w8mm-5pxw moderadas) y de Vite (GHSA-rq7h-c2jc-7f22 moderada, GHSA-9jrq-w75r-8gcw baja). Está en `devDependencies`, pero **no es solo una herramienta de build en este despliegue**: el contenedor `frontend` sirve la app con el servidor de desarrollo de Vite (`npm run dev`) detrás de nginx, alcanzable desde la LAN. Hay corrección en la misma línea (**6.4.6**), pendiente de aplicar.
  - **`postcss-selector-parser` 6.1.4 (moderada, GHSA-rj75-hqrm-r3gf):** entra por `tailwindcss` 3 (también por `postcss-nested`). Es solo de build: genera el CSS al compilar y no llega al navegador. Tiene corrección (6.1.5 o superior) sin salto mayor.
  - `braces`, `micromatch`, `fast-glob` y `chokidar` (cadena de `tailwindcss` 3) ya no aparecen en la auditoría.
  - Quedan además **2 moderadas de `react-router` 6** (GHSA-wrjc-x8rr-h8h6 y GHSA-337j-9hxr-rhxg), corregidas solo en la versión 7 (salto mayor). No aplican a Hestia: la primera es una redirección abierta al navegar a destinos controlados por el usuario con `<Link>`/`useNavigate`, y la app no navega a rutas tomadas de la URL ni del estado; la segunda afecta la hidratación con SSR, y Hestia usa `BrowserRouter` sin SSR.
- **Revisión de sala:** solo opera sobre el día actual (por diseño). Para la demo, el seed crea talleres para el día en que se ejecuta.
- **Vista de Salas:** el mapa del piso -1 no muestra la Sala 012 (la tapa el rectángulo de la Sala 011), la zona Odontología nunca muestra clases (no reconoce el número de esas salas) y, si una sala tiene varias clases el mismo día, solo se ve la primera. Los datos existen y se ven en Reportes, Ver Horario y Movimientos.
- **Búsquedas con tilde:** las búsquedas por nombre distinguen tildes ("fisiologico" no encuentra "fisiológico").
- **Órdenes de mantenimiento canceladas:** al cancelarlas quedan inactivas y la lista no las muestra, por lo que el filtro "Cancelada" aparece vacío.
- **Esquema en instalación limpia:** las tablas base las crea `Base.metadata.create_all()` al arrancar y no una migración inicial de Alembic. Las migraciones existentes son defensivas y se omiten si la tabla aún no existe.

---

## Flujo de trabajo del equipo

- Rama principal: `main`. El desarrollo de funcionalidades está cerrado; solo se integran correcciones de bugs y documentación mediante Pull Request.
- El CI (GitHub Actions) se ejecuta en cada push o PR a `main`/`develop`: flake8 sobre `backend/app/` y `backend/tests/`, pip-audit (dependencias de runtime y de pruebas), las pruebas automáticas con pytest contra un servicio PostgreSQL 16 (bloqueantes; reporte en [`docs/PRUEBAS.md`](docs/PRUEBAS.md)) y npm audit (bloqueante sobre dependencias de runtime, informativo sobre todas).

Ver [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md) para las convenciones de ramas y commits.

---

## Equipo

Desarrollado por estudiantes de Informática Biomédica — DuocUC San Bernardo
Proyecto Ruta IE · Escuela de Salud · 2026

---

**H**ospitalidad · **E**ficacia · **S**ervicio · **T**ransparencia · **I**nsumos · **A**postolado

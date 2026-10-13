# Flujos de usuario — Hestia

Documento de referencia para el informe de título y para modelar los BPMN.
Describe **qué puede hacer cada rol** y los **flujos principales** del sistema
tal como están implementados (octubre 2026).

- Fuente de verdad de permisos: las dependencias RBAC del backend
  (`backend/app/utils/deps.py` y los routers de `backend/app/routes/`).
- La interfaz (`frontend/src/App.tsx`, `Sidebar.tsx`, cada página) a veces es
  **más restrictiva** que el backend (oculta botones o páginas) y en un caso
  es **más permisiva** (muestra botones que el backend rechaza). Esas
  diferencias se marcan con notas.
- Para el guion de presentación paso a paso, ver [`DEMO.md`](DEMO.md).

---

## 1. Roles

| Rol (`rolusuario`) | Etiqueta en la UI | Perfil real |
|---|---|---|
| `admin` | Administrador | Responsable del sistema: usuarios, catálogos académicos, importaciones, auditoría |
| `operador_coordinador` | Op. Coordinador | Coordinación del Centro de Simulación: compras (órdenes de entrada), proveedores, docentes, reportes |
| `operador` | Operador | Operadora de sala/bodega: stock, movimientos, preparación de talleres y revisión de salas |
| `visor` | Visor | Jefatura o consulta: solo lectura, incluye reportes de valorización |

Todos los roles usan el mismo login con **2FA TOTP obligatorio** (ver flujo 3.1).

---

## 2. Matriz de módulos × roles

Leyenda: **L** = ver/listar · **C** = crear/editar · **B** = eliminar o
desactivar · **—** = sin acceso. Cada celda es el permiso **real del backend**.
La columna "Pantalla" indica la ruta del frontend.

| Módulo | Pantalla | admin | coordinador | operador | visor | Notas |
|---|---|---|---|---|---|---|
| Dashboard | `/dashboard` | L | L | L | L | |
| Alertas de stock | `/alertas` | L | L | L | L | |
| Insumos e implementos | `/insumos` | L C B | L C | L C | L | Exportación CSV/XLSX: todos. **(1)** |
| Unidades físicas de implementos | `/insumos/:id/unidades` | L C B | L C | L C | L | Generar lote (máx. 500): admin, coordinador, operador |
| Activos fijos (muebles, phantomas) | `/activos-fijos` | L C B | L C | L C | L | |
| Incidencias | `/incidencias` | L C B | L C | L C | L | |
| Órdenes de mantenimiento | `/mantenimiento` | L C B | L C B | L C B | L | UI: visor no ve la página |
| Movimientos de stock | `/movimientos` | L C | L C | L C | L | Exportación: todos. **(1)** |
| Categorías | `/categorias` | L C B | L C | L C | L | **(1)** |
| Salas (catálogo) | `/salas` | L C B | L C | L C | L | Página sin entrada en el menú. **(1)** |
| Vista de Salas + revisión post-taller | `/vista-salas` | L C | L C | L C | L | Revisión solo para el día actual |
| Preparar taller | `/preparar-taller` | C | C | C | — | UI: visor no ve la página |
| Paquetes de insumos | `/paquetes` | L C B | L C B | L C B | L | UI: visor no ve la página |
| Talleres | (dentro de Paquetes/Asignaturas) | L C B | L C | L C | L | |
| Programación de talleres | (Vista de Salas / importación) | L C B | L C B | L C B | L | |
| Reportes (valorización, consumo, PDF/XLSX) | `/reportes` | L | L | — | L | El operador no ve montos |
| Órdenes de entrada (compras) | `/ordenes-entrada` | L C | L C | L + recepción | L | **(2)** |
| Proveedores | `/proveedores` | L C B | L C | L C | L | **(3)** |
| Docentes | `/clases-docente` | L C | L C | — | — | |
| Comentarios a docentes | `/clases-docente` | — | L C | — | — | Exclusivo del coordinador |
| Clases docentes | `/clases-docente` | L C | L | L | L | **(4)** |
| Asignaturas | `/asignaturas` | L C | L | L | L | **(4)** |
| Ver horario | `/horario` | L | L | L | L | UI: solo admin y coordinador |
| Importar programación (xlsx) | `/importar-programacion` | C | C | C | — | UI: solo admin y coordinador |
| Importar insumos (CSV/XLSX) | `/importar` | C | — | — | — | |
| Importar horario académico | `/importar-horario` | C | — | — | — | |
| Usuarios (CRUD, reset 2FA) | `/usuarios` | L C B | — | — | — | |
| Audit log | `/audit-log` | L | — | — | — | |
| Perfil propio (contraseña, avatar) | `/perfil` | C | C | C | C | |
| Seguridad / 2FA propio | `/seguridad` | L | L | L | L | El 2FA no puede desactivarse |

### Notas de diferencias entre interfaz y backend

**(1) La UI es más restrictiva para el coordinador.** En Insumos, Movimientos,
Categorías y Salas, los botones de crear/editar solo se muestran a `admin` y
`operador` (`puedeEscribir`/`puedeRegistrar` en esas páginas), aunque el backend
(`require_operador`) también acepta al coordinador. El coordinador ve esas
pantallas en modo lectura.

**(2) Órdenes de entrada.** Crear, confirmar, cerrar y cancelar exigen admin o
coordinador. Registrar la recepción de un ítem lo acepta también el operador
(`require_operador`), y cualquier usuario autenticado puede leer las órdenes.
Pero la UI solo muestra la página a admin y coordinador, así que en la práctica
el operador y el visor no la usan.

**(3) Proveedores.** El backend permite crear/editar a cualquier operador; la
UI solo muestra la página a admin y coordinador.

**(4) Limitación conocida: la UI es más permisiva para el coordinador.** En
**Asignaturas** y en **Docentes y Clases (sección Clases)**, la interfaz
muestra al coordinador los botones "Nueva asignatura", "Editar", activar o
desactivar, y crear o editar clases. El backend exige `require_admin` para esas
operaciones, así que el coordinador recibe **error 403** al guardar. No se
corrigió porque implica cambiar permisos (lógica de negocio). En la demo esas
acciones se hacen con la cuenta admin. La gestión de **docentes** sí funciona
para el coordinador.

---

## 3. Flujos principales

Cada flujo indica actor(es), disparador, pasos y resultado. Los nombres de
estado son los valores reales de la base de datos.

### 3.1 Autenticación con 2FA obligatorio

**Actor:** cualquier usuario. **Disparador:** ingreso al sistema.

1. El usuario ingresa email y contraseña en `/login`.
2. El sistema valida las credenciales. Con 5 intentos fallidos en 5 minutos,
   la cuenta se bloquea 15 minutos (rate limiting por email).
3. Se registra `LOGIN_EXITOSO` en el audit log. Si la hora (Santiago) está
   fuera del rango configurado, también se registra
   `ALERTA_ACCESO_FUERA_HORARIO`.
4. **Gateway: ¿el usuario ya tiene 2FA configurado?**
   - **Sí (flujo A):** el sistema pide el código TOTP de 6 dígitos. Si es
     correcto, entrega la sesión (JWT). Si es incorrecto, responde HTTP 403 y
     permite reintentar.
   - **No (flujo B, primer ingreso o tras un reset):** el sistema muestra un QR
     y una clave manual. El usuario los registra en Google Authenticator,
     ingresa el primer código y recibe **10 códigos de recuperación** de un
     solo uso. Luego entra al sistema.
5. **Alternativa (flujo C, perdió el teléfono):** en el paso de TOTP, el
   usuario elige "usar código de recuperación". El código se consume, el 2FA
   queda deshabilitado y el usuario continúa en el flujo B para configurarlo
   de nuevo.

**Resultado:** sesión iniciada con los permisos del rol. El 2FA no puede
desactivarse desde la cuenta propia; solo el admin puede resetearlo (flujo 3.11).

### 3.2 Recuperación de contraseña (autoservicio)

**Actor:** cualquier usuario.

1. En `/login`, el usuario elige "¿Olvidaste tu contraseña?" e ingresa su email.
2. El sistema genera un token de un solo uso válido por 1 hora y envía el
   enlace por email. Sin SMTP configurado, el enlace aparece en los logs de la
   API.
3. El usuario abre el enlace (`/reset-password`) y define una nueva contraseña
   que cumpla la política: 8+ caracteres, mayúscula, minúscula, número y
   carácter especial.
4. El token queda invalidado.

### 3.3 Registro de movimiento de stock

**Actor:** operador (o admin). **Disparador:** entrada o salida física de un insumo.

1. En `/movimientos`, presiona "Registrar".
2. Elige el tipo (`entrada` / `salida`) y el subtipo (p. ej. `compra`,
   `ajuste_entrada`, `consumo_taller`, `baja`), el insumo y la cantidad, con un
   motivo opcional.
3. El sistema valida que haya stock suficiente para las salidas, actualiza
   `stock_actual` del insumo y registra quién hizo el movimiento.
4. **Gateway:** si el stock queda en o bajo el mínimo, el insumo aparece en
   **Alertas** y en el Dashboard. Cuando una entrada lo repone, pasa a
   "alertas resueltas".

### 3.4 Preparación de taller (Guía de taller digital)

**Actor:** operador. **Disparador:** un taller programado necesita sus insumos en sala.

1. En `/preparar-taller`, elige asignatura → taller → paquete de insumos → sala.
2. El sistema muestra el checklist del paquete con el estado de stock de cada
   ítem (OK / insuficiente / sin stock).
3. La operadora marca cada ítem como "Ya en sala" o "Retiro de bodega".
4. Al confirmar, el sistema registra las salidas de bodega: `consumo_taller`
   para insumos desechables y `prestamo_implemento` para implementos. Los
   ítems sin stock se omiten y se informan, sin revertir el resto.

**Resultado:** sala lista y stock descontado con trazabilidad.

### 3.5 Revisión de sala post-taller (Vista de Salas)

**Actor:** operador. **Disparador:** termina un taller programado para hoy.

1. En `/vista-salas`, el mapa del piso -1 (y del anexo de odontología) muestra
   cada sala con su estado: sin actividad, **en clase** (con tiempo restante),
   **pendiente de revisión**, **en revisión** o **revisada**.
2. La operadora selecciona una sala "pendiente de revisión" y presiona
   "Iniciar revisión de sala".
3. El sistema crea la revisión (`en_revision`) y genera el checklist
   automáticamente con el paquete de insumos del taller y los activos fijos de
   la sala.
4. La operadora registra en cada ítem la cantidad encontrada y si está
   conforme, con notas.
5. Presiona "Marcar sala como revisada" y la revisión pasa a `completada`.
6. **Gateway:** si detecta un activo dañado, registra una incidencia (flujo 3.6).

### 3.6 Registro y seguimiento de incidencias

**Actor:** operador o coordinador.

1. En `/incidencias`, presiona "Registrar incidencia".
2. Selecciona el equipo afectado (activo fijo), el tipo (`dano_fisico`,
   `pieza_perdida`, `mal_funcionamiento`, `otro`), la descripción, la sala y la
   severidad (`leve`, `moderada`, `critica`). Puede adjuntar una foto.
3. El sistema sugiere al docente responsable según el horario de esa sala y fecha.
4. La incidencia sigue los estados `abierta` → `en_revision` → `resuelta`.
5. **Gateway:** si el activo requiere reparación, se crea una orden de
   mantenimiento (flujo 3.7).

### 3.7 Orden de mantenimiento de activos fijos

**Actor:** operador o coordinador.

1. En `/mantenimiento`, presiona "Nueva orden".
2. Elige los activos, el proveedor, el tipo (`preventivo`, `correctivo`,
   `validacion_tecnica`), la fecha de visita y la fecha estimada de retorno.
3. La orden queda `en_curso` y los activos se marcan como en mantenimiento.
4. Al volver cada activo, se registra su resultado: `ok`, `sale_a_taller` o
   `dar_de_baja`.
5. Con los ítems resueltos, se cierra la orden (`cerrada`). Si se anula
   antes de iniciar, queda `cancelada`.

### 3.8 Orden de entrada (compra y recepción de mercadería)

**Actor:** coordinador (o admin).

1. En `/ordenes-entrada`, presiona "Nueva orden" y elige el proveedor, la
   actividad DuocUC y el tipo (`semanal`, `semestral`, `emergencia`). Queda en
   `borrador`.
2. Agrega ítems: insumos o activos fijos existentes, o ítems **nuevos** que se
   crearán al cierre, con cantidad y costo unitario.
3. Presiona **Confirmar** y la orden pasa a `confirmada`.
4. Al llegar la mercadería, registra la recepción de cada ítem con la cantidad
   recibida (total o parcial). La orden pasa a `en_recepcion`.
5. Presiona **Cerrar y actualizar stock**. Recién aquí el sistema suma el stock
   recibido, crea los ítems nuevos y la orden queda `cerrada`.
6. **Alternativa:** cancelar en cualquier estado previo al cierre. El stock no cambia.
7. La orden puede exportarse en PDF o Excel.

### 3.9 Reportes de valorización y consumo

**Actor:** coordinador, visor o admin.

1. En `/reportes`, el sistema muestra el inventario valorizado, el costo de los
   paquetes por taller, totales y el **riesgo de reposición**.
2. El usuario elige el semestre para ver el consumo y el costo por carrera
   (incluye costo por estudiante).
3. Descarga el **Reporte PDF** o el **Reporte Excel**.

### 3.10 Planificación académica e importaciones

**Actor:** admin (catálogos e importaciones) y coordinador (docentes, programación).

1. El admin registra las asignaturas por carrera (`TENS`, `TQF`, `TLCBS`,
   `TONS`, `preparador_fisico`) y las clases (asignatura + sección + semestre).
2. El coordinador gestiona los docentes y sus comentarios.
3. Los talleres se asocian a una asignatura y se les define un paquete de
   insumos por semestre.
4. **Importaciones** (`/importaciones`):
   - Insumos desde CSV/XLSX con plantilla descargable (solo admin).
   - Horario académico desde el CSV de DuocUC, con mapeo de columnas (solo admin).
   - Programación semestral desde el Excel de planificación, que crea las
     instancias de taller en sala y fecha (admin o coordinador).

### 3.11 Administración de usuarios y auditoría

**Actor:** admin.

1. En `/usuarios`: crear usuario (nombre, email, contraseña, rol), editar,
   desactivar o reactivar (soft-delete), y **resetear el 2FA** de un usuario.
   Tras el reset, el usuario repite el flujo B en su próximo ingreso.
2. En `/audit-log`: consultar el historial de acciones (logins, alertas fuera
   de horario, cambios de datos) con filtros.

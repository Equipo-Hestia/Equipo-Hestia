# Guía de demo — Hestia

Guion para la presentación de defensa y para tomar capturas. Cubre la
preparación del entorno, las cuentas demo con su 2FA, un flujo paso a paso por
rol (**pantalla → acción → resultado esperado**) y un checklist de verificación
manual.

Para la matriz completa de permisos y los flujos en texto (informe y BPMN),
ver [`FLUJOS_USUARIO.md`](FLUJOS_USUARIO.md).

---

## 1. Preparar el entorno

Requisitos: Docker Desktop y Git. No hace falta instalar Python, Node ni PostgreSQL.

```bash
git clone https://github.com/Equipo-Hestia/Equipo-Hestia.git hestia
cd hestia
cp backend/.env.example backend/.env
docker compose up --build
```

Espera a que `docker compose logs api` muestre `[Hestia] Levantando API...` y
la línea de Uvicorn (`Application startup complete`). No ejecutes el seed
antes: algunas tablas se crean recién cuando la API termina de cargar. Luego,
en otra terminal, carga los datos demo:

```bash
docker compose exec api python seed_demo.py   # responder "s"
```

> **Ejecuta el seed justo antes de la demo** (idealmente 5–10 minutos antes
> de presentar). La Vista de Salas y la revisión post-taller solo funcionan
> sobre el día actual, así que el seed crea cinco talleres para *hoy* con horas
> relativas al momento en que se ejecuta (hora de Santiago), uno por cada
> estado de la leyenda del mapa:
>
> | Sala | Taller | Horario | Estado en el mapa |
> |---|---|---|---|
> | Sala 010 | Taller de RCP avanzado | de −2 h 30 min a −30 min | **Pendiente de revisión** desde el seed hasta que se revisa (resto del día) |
> | Sala 011 | Taller de venopunción | de −1 h a **+2 h** | **En clase** durante **2 horas** después del seed; luego pasa a "pendiente de revisión" |
> | Sala 013 | Taller de vendajes e inmovilización | de −4 h a −1 h 40 min | **En revisión** (revisión iniciada y a medio llenar) todo el día |
> | Sala 014 | Taller de control de signos vitales | de **+3 h** a +5 h | **Próxima clase** durante **3 horas** después del seed; luego "en clase" y, desde +5 h, "pendiente de revisión" |
> | Sala 016 | Taller de toma de muestra | de −5 h a −3 h | **Revisada** (revisión completada) todo el día |
>
> Ventanas que dependen de la hora del seed: la Sala 011 se ve "en clase"
> (con su cuenta regresiva) solo durante **2 horas**, y la Sala 014 se ve
> "próxima clase" solo durante **3 horas**. Si la demo se retrasa más, vuelve a
> ejecutar el seed. Los estados de las salas 010, 013 y 016 duran todo el día.
> "Hoy" es siempre el día de Santiago, así que la demo funciona a cualquier
> hora, pero las horas se recortan al día (00:00–23:59): para que los horarios
> se vean naturales, ejecútalo **entre las 05:00 y las 20:00**. Fuera de esa
> franja los estados siguen siendo los de la tabla (la autoverificación del
> seed lo comprueba), pero algunas horas quedan en 00:00 o 23:59. El seed
> **borra todos los datos** antes de cargar; repetirlo deja la demo en su
> estado inicial. Tarda unos 6 segundos y termina con una autoverificación
> (ver sección 1.1).

Acceso:

| Desde | URL |
|---|---|
| El mismo equipo | `http://localhost:3000` (o `https://localhost`) |
| Otro dispositivo de la LAN | `https://<IP-del-equipo>`: aceptar una vez la advertencia del certificado autofirmado |

### 1.1 Qué datos carga el seed

El seed carga el **año académico 2026 completo del Centro de Simulación
Clínica hasta el momento en que se ejecuta**. Nada queda con fecha futura
(movimientos, órdenes, revisiones, incidencias, auditoría), salvo las
programaciones de talleres que aún no ocurren y las fechas de retorno
*estimadas* de mantenimiento.

| Período | Qué pasa |
|---|---|
| Enero y febrero | Sin clases: inventario inicial, compras, mantenimiento preventivo, carga del horario |
| 9 de marzo – 3 de julio | Semestre **2026-1** |
| Julio | Receso de invierno: solo bodega y mantenimiento |
| 3 de agosto – 11 de diciembre | Semestre **2026-2** |
| 14 – 30 de diciembre | Cierre de año: inventario físico, devoluciones de salas, bajas |

No hay talleres en los feriados que caen en día hábil (3 abr, 1 y 21 may,
29 jun, 18 sep, 12 oct y 8 dic). Todos los demás días hábiles de ambos
semestres tienen clases en el piso -1, sin choques de sala y hora, y cada
clase pasada tiene su revisión de sala.

Cifras de una carga a mediados de diciembre (antes de esa fecha hay menos
historia):

| Módulo | Contenido |
|---|---|
| Catálogos | 18 salas, 14 categorías, 5 proveedores, 6 usuarios, 24 docentes (sin cuenta) |
| Académico | 5 carreras (TENS, TQF, TLCBS, TONS, Preparador Físico), todas con asignaturas, secciones, talleres y paquetes en ambos semestres: 37 asignaturas, 90 secciones con horario (45 por semestre), 50 talleres, 59 paquetes (30 de 2026-1 y 29 de 2026-2) |
| Inventario | 112 insumos e implementos: ~95 con stock normal, 14 bajo mínimo (3 agotados); 29 implementos con 318 unidades operativas y 11 dadas de baja |
| Activos fijos | 30, en todos los estados: disponible, en uso, en mantenimiento, dado de baja |
| Programación | ~1.470 talleres programados, ~1.465 revisiones de sala (~12.000 ítems) |
| Movimientos | ~11.200, de los 11 subtipos; el stock de cada ítem es igual a entradas − salidas y nunca fue negativo |
| Compras | ~60 órdenes de entrada: borrador, confirmada, en recepción (con recepción parcial), cerradas (semanales, semestrales y de emergencia) y canceladas |
| Mantenimiento | 10 órdenes: en curso, cerradas (con resultados ok, sale a taller y dar de baja) y canceladas; tipos preventivo, correctivo y validación técnica |
| Incidencias | 17, con los 4 tipos, las 3 severidades y los 3 estados |
| Auditoría | ~7.550 registros: logins, revisiones, preparación de talleres, órdenes, incidencias |

Notas sobre los datos:

- **Siglas ilustrativas:** las asignaturas usan siglas reales DuocUC, salvo
  estas, que **no están confirmadas** y son solo ilustrativas:
  - TQF, semestre 2026-2: **PFS2111** Farmacología General, **PFS2121**
    Dispensación y Atención Farmacéutica y **PFS2131** Operaciones
    Farmacéuticas.
  - Preparador Físico, todas: **PRF1111** Primeros Auxilios en la Actividad
    Física (ambos semestres), **PRF1121** Anatomía Funcional y Kinesiología y
    **PRF3111** Evaluación de la Condición Física (2026-1), **PRF2111**
    Prevención y Manejo de Lesiones Deportivas y **PRF4111** Fisiología del
    Ejercicio Aplicada (2026-2).
- **Preparador Físico** usa la sala de RCP (012) y las de simulación general
  (020, 021 y 022), con 7 talleres (RCP y DEA en el deporte, atención inicial
  de lesiones, goniometría, antropometría, vendaje funcional, protocolo PRICE
  y signos vitales en el ejercicio) e insumos propios de la categoría
  Preparación Física (compresas frías, cinta kinesiológica, goniómetros,
  plicómetros, férulas inflables).
- El regreso de implementos prestados se registra como `ajuste_entrada` con
  el motivo "Reintegro desde Sala X", porque la app no tiene un subtipo
  específico para eso.
- El seed es determinista: dos ejecuciones el mismo día producen los mismos
  datos (solo cambian las horas relativas de los talleres de hoy).
- **Autoverificación:** al final, el seed comprueba que el stock cuadre con
  los movimientos y nunca sea negativo, que las unidades de cada implemento
  coincidan con su stock, que no haya fechas futuras (salvo programaciones),
  que los cinco talleres de hoy existan con su semestre y el estado esperado
  en el mapa, que el suero de 1 L esté en 2, que la orden de sueros siga en
  borrador, que las 6 cuentas tengan su 2FA de demo, que el calendario no
  tenga choques ni clases pasadas sin revisión, y que las 5 carreras tengan
  secciones, paquetes y talleres programados en ambos semestres. Si algo
  falla, no guarda nada y termina con error.
- El seed está pensado para ejecutarse durante 2026 (la demo es en
  diciembre). Se probó simulando cargas en enero, marzo, abril, julio,
  septiembre, octubre, noviembre y diciembre.

---

## 2. Cuentas demo y 2FA

> ⚠️ **SECRETOS EXCLUSIVOS DE DEMO.** Los secretos TOTP y los códigos de
> recuperación de esta sección están publicados en el repositorio (también en
> `backend/seed_demo.py`). Cualquiera puede generar los códigos con ellos.
> **No deben usarse en ningún otro entorno**: ni producción, ni datos reales,
> ni cuentas personales.

Todas las cuentas que crea el seed ya tienen el 2FA configurado. El login pide
email, contraseña y el código de 6 dígitos de Google Authenticator (o
cualquier app TOTP).

| # | Rol | Email | Contraseña | Secreto TOTP (clave manual) | QR |
|---|---|---|---|---|---|
| 1 | Administrador | `admin@hestia.duoc.cl` | `Admin2024!` | `LXMXOC2QI77XU53MY56KUUAIXWA425JK` | [admin.png](demo-2fa/admin.png) |
| 2 | Op. Coordinador | `psoto@hestia.duoc.cl` | `Coord2024!` | `5WD44E4LF2UCHICON3T3UHIELEA2BYSV` | [psoto.png](demo-2fa/psoto.png) |
| 3 | Operador | `mgonzalez@hestia.duoc.cl` | `Oper2024!` | `YWZ3PHGDHRPASDRM2TIOW4HQH7BV2OCP` | [mgonzalez.png](demo-2fa/mgonzalez.png) |
| 4 | Operador | `cfuentes@hestia.duoc.cl` | `Oper2024!` | `KWKFKT4AE4VP4MFTYJXORR2DNU4567VR` | [cfuentes.png](demo-2fa/cfuentes.png) |
| 5 | Visor | `amartinez@hestia.duoc.cl` | `Visor2024!` | `DZDWCIWYM3NF43AJEGHWI23J5EJJD46X` | [amartinez.png](demo-2fa/amartinez.png) |
| 6 | Visor | `lperez@hestia.duoc.cl` | `Visor2024!` | `XDGZQ733L6F4SENXAPQAYMN2E6XL7HE2` | [lperez.png](demo-2fa/lperez.png) |

### Cargar las cuentas en Google Authenticator (una sola vez)

- **Con QR:** en la app, "+" → "Escanear un código QR" y escanea la imagen de
  la columna QR (abre el archivo en pantalla). Aparecen como **"Hestia (demo)"**.
- **Con clave manual:** "+" → "Ingresar una clave de configuración". En
  Cuenta va el email, en Clave el secreto de la tabla, y el tipo es "Basado en
  el tiempo".

Los secretos no cambian entre instalaciones ni al repetir el seed: basta con
cargarlos una vez en el teléfono del equipo. El reloj del teléfono y el del
servidor deben estar sincronizados (hora automática).

### Códigos de recuperación (respaldo si falla el teléfono)

Cada cuenta tiene 10 códigos de un solo uso con el patrón
`DE0{n}000{k}-DE0{n}000{k}`, donde `n` es el número de la cuenta en la tabla y
`k` va de 0 a 9. Ejemplos:

- admin (n=1): `DE010000-DE010000`, `DE010001-DE010001`, … `DE010009-DE010009`
- coordinador (n=2): `DE020000-DE020000`, …

Usar un código de recuperación **deshabilita el 2FA de esa cuenta** y obliga a
configurarlo de nuevo con QR (comportamiento normal del sistema). Para volver
al estado demo, repite el seed.

### Otras cuentas

- `ADMIN_EMAIL` / `ADMIN_PASSWORD` de `backend/.env` (por defecto
  `admin@hestia.cl`): admin de arranque que crea `crear_admin.py`. **El seed lo
  borra**; reaparece al reiniciar el contenedor `api`, sin 2FA (su primer login
  pide configurar el QR). Para la demo, usa las cuentas de la tabla.

---

## 3. Guion por rol

Orden sugerido: **Operador → Coordinador → Visor → Administrador**. Sigue el
ciclo real: operación diaria → compras y control → consulta → gobierno del
sistema. Duración aproximada: 4–6 min por rol.

### 3.0 Login con 2FA (mostrar una vez, con cualquier cuenta)

| # | Pantalla | Acción | Resultado esperado |
|---|---|---|---|
| 1 | `/login` | Ingresar `mgonzalez@hestia.duoc.cl` / `Oper2024!` → Ingresar | Pide el código de verificación de 6 dígitos |
| 2 | Paso 2FA | Escribir el código de Google Authenticator | Entra al Dashboard; el sidebar muestra nombre y rol "Operador" |
| 3 | (opcional) Paso 2FA | Escribir un código incorrecto | Mensaje de error sin cerrar la pantalla; permite reintentar |

### 3.1 Operador — `mgonzalez@hestia.duoc.cl`

Historia: la operadora del Centro de Simulación prepara un taller, controla el
stock y revisa la sala al terminar la clase.

| # | Pantalla | Acción | Resultado esperado |
|---|---|---|---|
| 1 | **Dashboard** | Revisar las tarjetas y widgets | Métricas de stock, gráfico semanal de entradas/salidas, actividad reciente, top insumos retirados, talleres de hoy. Sin el widget "Riesgo de reposición": usa datos de valorización, a los que el operador no tiene acceso |
| 2 | **Alertas** | Abrir la pestaña de alertas activas | 14 insumos bajo mínimo, 3 de ellos agotados (p. ej. "Contenedor cortopunzante 3L", "Suero fisiológico NaCl 0.9% 1L", "Mascarillas N95 FFP2") |
| 3 | **Insumos e Implementos** | Buscar "guantes"; filtrar "Bajo stock" | La tabla se filtra; estados Agotado / Bajo stock con badge de color |
| 4 | Insumos → implemento "Esfigmomanómetro aneroide" (buscar "esfigmo") | Abrir sus unidades físicas | Lista de unidades con subcódigo, ubicación (Bodega o salas 010–015) y estado; incluye una unidad dada de baja |
| 5 | **Movimientos** | "Registrar" → tipo *entrada*, subtipo *compra*, insumo "Suero fisiológico NaCl 0.9% 1L" (buscar "suero"), cantidad 20 → Guardar | Movimiento en la tabla con usuario y fecha; el stock del insumo sube de 2 a 22 |
| 6 | **Alertas** | Ver la pestaña de alertas resueltas | El suero aparece como resuelto, si superó su mínimo (10) |
| 7 | **Preparar taller** | Elegir asignatura "Técnicas Básicas de Enfermería" → "Taller de venopunción" → paquete 2026-2 → sala "Sala 011" | Checklist del paquete con estado de stock por ítem |
| 8 | Preparar taller | Marcar ítems como "Ya en sala" o "Retiro de bodega" → confirmar | "¡Sala lista!"; los retiros de bodega quedan registrados como movimientos de salida |
| 9 | **Vista de Salas** | Ver el mapa del piso -1 | Todos los estados de la leyenda: Sala 011 "en clase" con tiempo restante (si pasaron menos de 2 h desde el seed), Sala 010 "pendiente de revisión" (destacada), Sala 013 "en revisión", Sala 016 "revisada" y Sala 014 "próxima clase" (si pasaron menos de 3 h) |
| 10 | Vista de Salas → Sala 010 | "Iniciar revisión de sala" | Checklist generado automáticamente: insumos del paquete de "Taller de RCP avanzado" + activos fijos de la sala |
| 11 | Revisión | Registrar cantidades encontradas y conformidad; anotar una observación | Avance de la revisión en porcentaje |
| 12 | Revisión | "Marcar sala como revisada" | Sala 010 pasa a "revisada" en el mapa |
| 13 | **Incidencias** | "Registrar incidencia" → equipo "Cama clínica articulada" (buscar "cama"), tipo *daño físico*, sala 010, severidad *leve* → Guardar | Incidencia `abierta` en la lista, junto a las del año; el sistema sugiere el docente según el horario |
| 14 | **Mantenimiento** | Revisar la orden Laerdal en curso (visita de hace 12 días) | Orden `en_curso` con "Fantoma adulto alta fidelidad" y "Fantoma recién nacido…"; en la lista también hay otra orden en curso (monitor multiparámetro) y las cerradas del año |

Punto a destacar: el operador **no ve Reportes**, porque no tiene acceso a
montos ni datos financieros.

### 3.2 Operador coordinador — `psoto@hestia.duoc.cl`

Historia: la coordinación del Centro gestiona las compras, los proveedores y
los docentes, y revisa los costos.

| # | Pantalla | Acción | Resultado esperado |
|---|---|---|---|
| 1 | Sidebar | Abrir la sección "Administracion" | Ve Órdenes de Entrada, Proveedores, Docentes y Clases, Asignaturas, Ver Horario e Importaciones. **No** ve Usuarios ni Audit Log |
| 2 | **Órdenes de Entrada** | Revisar la lista | Las compras del año (~60 a mediados de diciembre) en todos los estados. Las del guion, creadas por Patricia Soto: `confirmada` (repuestos Laerdal) y `borrador` (reposición urgente de sueros); además hay una `en_recepcion` con recepción parcial |
| 3 | Orden `borrador` (sueros de emergencia) | Expandir → "Confirmar" | La orden pasa a `confirmada` |
| 4 | Misma orden | En cada ítem, "Registrar recepción" → cantidad recibida (p. ej. 20 sueros de 1L) | Ítems `recibido`; la orden pasa a `en_recepcion` |
| 5 | Misma orden | "Cerrar y actualizar stock" | Orden `cerrada`; en Insumos, "Suero fisiológico NaCl 0.9% 1L" sube en la cantidad recibida (de 2 a 22 si no se hizo el paso 5 del operador) |
| 6 | Orden cerrada | Botón PDF / Excel | Descarga la orden de compra |
| 6b | (opcional) Orden Laerdal (implementos) | Recibir y cerrar igual que la anterior | El stock de "Bolsa autoinflable AMBU adulto" sube; en sus unidades físicas aparecen "unidades sin subcódigo" con la opción "Generar unidades en lote" (paso previsto para etiquetarlas) |
| 7 | (opcional) **Órdenes de Entrada** | "Nueva orden" → proveedor, actividad, tipo; agregar ítems al carrito → crear | Nueva orden en `borrador` con total estimado |
| 8 | **Proveedores** | Revisar "Laerdal Medical Chile SpA" | Ficha con contacto y datos del proveedor |
| 9 | **Docentes y Clases** | Abrir un docente → agregar un comentario (positivo / negativo / neutro) | Comentario registrado; esta función es exclusiva del coordinador |
| 10 | **Reportes** | Revisar la valorización; en "Consumo por carrera" buscar 2026-2 y luego 2026-1 | Inventario valorizado, costo de paquetes, riesgo de reposición; consumo y costo por carrera de cada semestre (las 5 carreras, incluido Preparador Físico) |
| 11 | Reportes | "Reporte PDF" y "Reporte Excel" | Descarga de ambos archivos |
| 12 | **Importaciones** | Abrir el hub | Solo ve "Importar programación" (importar insumos y horario son exclusivos del admin) |

**No mostrar con esta cuenta:** crear o editar **asignaturas** o **clases**. La
interfaz muestra los botones, pero el backend los rechaza (error 403); ver la
sección 4. Esas acciones van en el guion del administrador.

### 3.3 Visor — `amartinez@hestia.duoc.cl`

Historia: jefatura o docente responsable que consulta el estado sin modificarlo.

| # | Pantalla | Acción | Resultado esperado |
|---|---|---|---|
| 1 | Sidebar | Revisar el menú | Sin Mantenimiento, Preparar taller, Paquetes ni Administración |
| 2 | **Insumos e Implementos** | Abrir la tabla | Solo lectura: sin "Nuevo item" ni editar; sí puede exportar CSV/Excel |
| 3 | Insumos | Exportar "Excel (.xlsx)" | Descarga el inventario con los filtros activos |
| 4 | **Activos Fijos** | Cambiar las pestañas Muebles / Phantomas | Conteos por tipo; sin botón "Registrar activo" |
| 5 | **Vista de Salas** | Seleccionar Sala 010 / 011 | Ve el estado de las salas, sin botones de revisión |
| 6 | **Reportes** | Revisar la valorización y descargar el PDF | Mismo reporte que el coordinador (el visor sí tiene acceso a reportes) |

### 3.4 Administrador — `admin@hestia.duoc.cl`

Historia: el responsable del sistema mantiene los catálogos académicos, los
usuarios y la seguridad.

| # | Pantalla | Acción | Resultado esperado |
|---|---|---|---|
| 1 | **Asignaturas** | "Nueva asignatura" → código, nombre, carrera (p. ej. TONS) → Guardar | Asignatura en la lista, activa |
| 2 | **Docentes y Clases** | Sección Clases → crear una clase (asignatura, sección, semestre 2026-2) | Clase registrada |
| 3 | **Importaciones** | Ver las 3 opciones | Importar insumos, horario académico y programación |
| 4 | Importar insumos | Descargar la plantilla → (opcional) subirla completada | Importación con verificación TOTP y resumen de filas creadas |
| 5 | **Usuarios** | "Nuevo usuario" → nombre, email, contraseña que cumpla la política, rol *operador* → Guardar | Usuario creado y activo |
| 6 | **Usuarios** | En `cfuentes@hestia.duoc.cl`, ícono "Desactivar 2FA" → confirmar | Mensaje "2FA desactivado para Carlos Fuentes" |
| 7 | Cerrar sesión → `/login` | Entrar como `cfuentes@hestia.duoc.cl` / `Oper2024!` | Asistente de configuración: muestra **QR** y clave manual |
| 8 | Asistente 2FA | Escanear el QR con el teléfono (se crea una entrada **nueva** "Hestia") → ingresar el código | Muestra **10 códigos de recuperación** → continuar → Dashboard |
| 9 | Volver como admin → **Audit Log** | Filtrar por acción o usuario | Logins exitosos, reset de 2FA, creación de usuario y asignatura, etc. |
| 10 | **Seguridad** (`/seguridad`) | Abrir | Indica que el 2FA está activo y que no puede desactivarse |

> Tras el paso 8, el secreto de `cfuentes` ya no es el de la tabla. Repite el
> seed para restaurarlo.

### 3.5 Pasos opcionales con el historial 2026

Para mostrar más a fondo, con cualquier cuenta que tenga acceso a la pantalla:

| # | Pantalla | Acción | Resultado esperado |
|---|---|---|---|
| 1 | **Vista de Salas** | Semestre 2026-1 → un día de abril (p. ej. mié 15 abr) | Las salas con clase ese día aparecen "revisadas"; al seleccionar una se ven taller, docente y horario |
| 2 | **Vista de Salas** | Semestre 2026-2 → un día de noviembre o diciembre | Antes del día: "próxima clase"; ya pasado: "revisada" |
| 3 | **Reportes** (coordinador o visor) | "Consumo por carrera": 2026-1 y luego 2026-2 | Costos, talleres y estudiantes por carrera distintos en cada semestre |
| 4 | **Alertas** | Pestaña "Alertas resueltas" con 7, 14 y 30 días | Ítems repuestos en las últimas semanas |
| 5 | **Mantenimiento** | Filtrar "Cerrada" y abrir la de julio | Resultados por equipo: ok, sale a taller y dar de baja (el Fantoma RCP pediátrico de 2016) |
| 6 | **Activos Fijos** | Revisar estados | Equipos disponibles, en uso (Sala 011), en mantenimiento y dados de baja |
| 7 | **Incidencias** | Filtrar por estado y severidad | Incidencias abiertas, en revisión y resueltas de todo el año |
| 8 | **Movimientos** | Filtrar por fechas o por insumo | Consumos de talleres, compras por orden de entrada, préstamos y reintegros de implementos, bajas, ajustes de inventario y devoluciones a proveedor |
| 9 | **Ver Horario** (admin o coordinador) | Semestre 2026-1 y luego 2026-2 | Horario semanal de las 45 secciones de cada semestre |
| 10 | **Audit Log** (admin) | Filtrar por acción o usuario | Historia del año: logins, revisiones de sala, preparación de talleres, órdenes e incidencias |

### 3.6 Recuperación de contraseña (opcional)

1. `/login` → "¿Olvidaste tu contraseña?" → ingresar `lperez@hestia.duoc.cl`.
2. Sin SMTP configurado, el enlace aparece en los logs:
   `docker compose logs api | grep "Recovery link"`.
3. Abrir el enlace → nueva contraseña (8+ caracteres, mayúscula, minúscula,
   número y especial) → login con la nueva contraseña.

El enlace usa `BASE_URL` de `backend/.env` (`http://localhost:3000` por
defecto), así que solo abre en el mismo equipo del servidor.

---

## 4. Limitaciones conocidas para la demo

- **Coordinador en Asignaturas y Clases:** la interfaz le muestra crear/editar,
  pero el backend exige admin y responde 403. Se hace con la cuenta admin. La
  matriz en `FLUJOS_USUARIO.md` (nota 4) refleja el permiso real.
- **Coordinador en Insumos, Movimientos, Categorías y Salas:** la interfaz no
  le muestra los botones de escritura (aunque el backend se lo permitiría).
  Esas acciones se muestran con el operador.
- **Revisión de sala:** solo existe para el día actual (por eso hay que correr
  el seed justo antes de la demo). La Sala 011 aparece "en clase" solo durante
  las 2 horas siguientes al seed, y la Sala 014 "próxima clase" solo durante
  las 3 horas siguientes. Los días pasados se pueden consultar, pero no revisar.
- **Vista de Salas, Sala 012:** el mapa del piso -1 no la muestra (el
  rectángulo de la Sala 011 la tapa), aunque tiene clases en el calendario.
- **Vista de Salas, Odontología:** la zona Odontología nunca muestra clases,
  aunque existen (las de TONS se ven en Reportes, Ver Horario y Movimientos):
  el mapa no reconoce el número de esas salas.
- **Vista de Salas, varias clases en una sala:** si una sala tiene más de una
  clase el mismo día, el mapa muestra solo la primera.
- **Búsquedas con tilde:** las búsquedas de la app distinguen tildes. Escribir
  "Suero fisiologico" no encuentra "Suero fisiológico": busca por una palabra
  sin tilde ("suero", "esfigmo", "cama") o escribe el nombre exacto.
- **Consumo por carrera:** se calcula como paquete × talleres programados del
  semestre, incluidos los que aún no ocurren (es un costo planificado, no el
  consumo real de los movimientos).
- **Órdenes de mantenimiento canceladas:** la app las oculta de la lista (al
  cancelar quedan inactivas), así que el filtro "Cancelada" aparece vacío
  aunque el seed carga dos.
- **Textos generados por la app:** los movimientos que crea la app durante la
  demo (por ejemplo, "Preparacion taller: …") no llevan tilde; los del seed sí.
- **Rate limiting:** 5 contraseñas incorrectas en 5 minutos bloquean esa
  cuenta durante 15 minutos. Si pasa, usa otra cuenta del mismo rol o
  reinicia `api` (el bloqueo vive en memoria).
- **Logins fuera de horario** (antes de 07:00 o desde las 23:00, hora de
  Santiago) quedan como `ALERTA_ACCESO_FUERA_HORARIO` en el audit log. Es el
  comportamiento esperado.
- Otras limitaciones del proyecto (backup y CI): ver la sección "Limitaciones
  conocidas" del README.

---

## 5. Checklist de verificación manual

La demo se preparó sin poder ejecutar `docker compose up` real (la migración y
el seed se probaron contra PostgreSQL 16 directamente). Ejecutar este
checklist **en local, desde un clon limpio**, antes de la defensa.

### 5.1 Clon limpio y arranque

- [ ] `docker compose down -v` (si había una instalación previa; **borra la BD**)
- [ ] `git clone https://github.com/Equipo-Hestia/Equipo-Hestia.git hestia-test && cd hestia-test`
- [ ] `cp backend/.env.example backend/.env` (sin editar nada)
- [ ] `docker compose up --build` termina de construir los 5 servicios: `db`, `api`, `frontend`, `nginx`, `backup`
- [ ] `docker compose ps`: todos los servicios `running`; `api` **no** se reinicia en loop
- [ ] `docker compose logs api` muestra, en orden: `Aplicando migraciones...` →
      `Running upgrade ... -> 0004` → `Admin creado: admin@hestia.cl` → Uvicorn escuchando en `:8000`
- [ ] `docker compose exec api alembic current` → `0004 (head)`
- [ ] `http://localhost:3000` muestra el login
- [ ] `https://localhost` muestra el login tras aceptar el certificado

### 5.2 Seed

- [ ] `docker compose exec api python seed_demo.py` → `s` → termina con
      "Demo cargada exitosamente." y lista 6 credenciales
- [ ] El resumen incluye "Programaciones hoy: 5" y "Autoverificación: OK"
- [ ] Vista de Salas: Sala 010 "pendiente de revisión", Sala 011 "en clase"
      con cuenta regresiva (dentro de las 2 horas siguientes al seed), Sala 013
      "en revisión", Sala 014 "próxima clase" (dentro de 3 horas) y Sala 016
      "revisada"
- [ ] Vista de Salas: un día de abril, uno de septiembre y uno de noviembre
      muestran clases en el piso -1
- [ ] Repetir el seed una segunda vez también termina sin errores

### 5.3 Login con cada cuenta (contraseña + TOTP)

- [ ] Cargar los 6 secretos en Google Authenticator (sección 2)
- [ ] `admin@hestia.duoc.cl` entra y ve Usuarios y Audit Log
- [ ] `psoto@hestia.duoc.cl` entra; ve Órdenes de Entrada y Reportes; **no** ve Usuarios
- [ ] `mgonzalez@hestia.duoc.cl` entra; ve Preparar taller; **no** ve Reportes
- [ ] `cfuentes@hestia.duoc.cl` entra
- [ ] `amartinez@hestia.duoc.cl` entra; Insumos sin botón "Nuevo item"
- [ ] `lperez@hestia.duoc.cl` entra
- [ ] Un código de recuperación (p. ej. `DE060000-DE060000` en `lperez`) lleva
      al asistente de QR; después repetir el seed

### 5.4 Flujos críticos del guion

- [ ] Vista de Salas: Sala 010 "pendiente de revisión" → iniciar revisión → marcar revisada
- [ ] Preparar taller "Taller de venopunción" (paquete 2026-2) en Sala 011 → confirmar → aparecen movimientos de salida
- [ ] Coordinador: confirmar, recibir y cerrar la orden de sueros → sube el stock de "Suero fisiológico NaCl 0.9% 1L"
- [ ] Reportes: descarga el PDF y el Excel
- [ ] Admin: resetear el 2FA de `cfuentes` → su login muestra el QR
- [ ] Revisar otra vez desde un segundo dispositivo de la LAN en `https://<IP-del-equipo>`
      (opcional: `./generate-cert.sh` para incluir la IP en el certificado)

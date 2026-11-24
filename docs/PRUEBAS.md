# Pruebas automáticas de Hestia

> Archivo generado automáticamente por `pytest` (`backend/tests/conftest.py`) a partir de una ejecución real. No editar a mano: volver a ejecutar las pruebas para actualizarlo.

## Resumen

| Dato | Valor |
|---|---|
| Versión del código (commit) | 35411e1 (rama fix/doble-envio, sobre main 75b65a5) |
| Fecha de ejecución | 24-11-2026 12:21 (hora de Chile) |
| Total de casos | 25 |
| Aprobados | 21 |
| Fallidos | 0 |
| Fallos esperados (defectos conocidos) | 4 |
| Base de datos | PostgreSQL 16.15 (Debian 16.15-1.pgdg13+2), base temporal `hestia_test_311e442836` (creada y borrada en la ejecución) |
| Python | 3.11.18 |

## Casos

| ID | Qué se prueba | Resultado esperado | Resultado obtenido | Estado | Fecha de ejecución |
|---|---|---|---|---|---|
| P01 | Retirar de bodega más unidades de las que hay disponibles | El sistema rechaza el retiro (error 400) y el stock no cambia | Rechazado con 400 ("Stock insuficiente. Disponible: 5"); stock sigue en 5 | Aprobado | 24-11-2026 12:21:41 |
| P02 | Registrar una entrada (compra) y luego una salida (consumo) de un insumo | Stock 10 → +5 = 15 → −3 = 12, y quedan registrados los 2 movimientos | Stock 10 → 15 → 12; 2 movimientos registrados | Aprobado | 24-11-2026 12:21:42 |
| P03 | Clasificación del estado de cada insumo según su stock y su stock mínimo | Stock 0 = "agotado"; stock igual o menor al mínimo = "bajo stock"; stock sobre el mínimo = "ok". Las alertas y el panel cuentan lo mismo | 0/5 → agotado; 5/5 → bajo_stock; 3/5 → bajo_stock; 6/5 → ok. Alertas: los 3 primeros, no el "ok". Panel: +1 agotado, +3 bajo stock | Aprobado | 24-11-2026 12:21:43 |
| P04 | Dos operadoras retiran el mismo insumo exactamente al mismo tiempo (2 retiros de 7 con stock 10, repetido 10 veces) | En cada intento solo se acepta un retiro; el otro se rechaza por stock insuficiente y el stock queda en 3, nunca negativo | 10/10 intentos: un retiro aceptado (200) y uno rechazado (400); stock final 3 en todos (mínimo observado: 3) | Aprobado | 24-11-2026 12:21:44 |
| P05 | Confirmar "Sala lista" en Preparar taller: un ítem ya estaba en la sala, otro se retira de bodega y otro no tiene stock suficiente | Solo se descuenta el ítem retirado de bodega (10 → 7); el que ya estaba en sala no cambia; el que no alcanza se informa como omitido y no se descuenta | En sala: 10 → 10; retiro de bodega: 10 → 7 (1 movimiento consumo_taller); sin stock: 2 → 2, informado: "Jeringas (sin stock) dd7775b1 (solicitado: 5, disponible: 2)" | Aprobado | 24-11-2026 12:21:24 |
| P06 | Cerrar una orden de entrada (compra) donde un producto llegó completo, otro llegó en cantidad 0 y otro nunca se registró | Al producto recibido se le suman 10 unidades mediante un movimiento de compra; los ítems con 0 o sin recepción quedan "cancelado" y su stock no cambia | Orden cerrada. Recibido: 4 → 14 con 1 movimiento entrada/compra de 10 (el stock no cambió antes del cierre); llegó 0: cancelado, 4 → 4; sin recepción: cancelado, 4 → 4 | Aprobado | 24-11-2026 12:21:25 |
| P07 | Un usuario con rol Visor (solo lectura) intenta registrar un movimiento de stock | El sistema lo rechaza con error 403 (sin permiso) y el stock no cambia; sí puede ver el listado de movimientos | Salida: 403; entrada: 403; stock sigue en 10; listado de movimientos: 200 | Aprobado | 24-11-2026 12:21:21 |
| P08 | Un usuario con rol Operador intenta entrar a la gestión de usuarios (ver la lista o crear un usuario) | El sistema rechaza ambas acciones con error 403 (sin permiso); un Administrador sí puede ver la lista | Operador: listar 403, crear 403; administrador: listar 200 | Aprobado | 24-11-2026 12:21:23 |
| P09 | Iniciar sesión con la contraseña correcta pero un código de Google Authenticator (2FA) incorrecto o vacío | El sistema no entrega acceso: código incorrecto → 403, código vacío → 422, y el token intermedio no sirve para entrar (401) | Código incorrecto: 403 ("Código 2FA incorrecto"), sin token; código vacío: 422; token intermedio usado para entrar: 401 | Aprobado | 24-11-2026 12:21:04 |
| P10 | Iniciar sesión correctamente (contraseña + código 2FA) y luego usar un token vencido o modificado | El login entrega un token (JWT) válido que permite entrar; un token vencido, alterado o firmado con otra clave se rechaza (401) | Token válido: /usuarios/me 200 (sub, rol, exp y jti correctos); vencido: 401; alterado: 401; otra clave: 401 | Aprobado | 24-11-2026 12:21:05 |
| P11 | Configurar el doble factor (2FA) de un usuario nuevo: el sistema muestra el código QR para escanear con Google Authenticator | Se genera una imagen PNG válida con el QR y una clave; con un código generado desde esa clave se activa el 2FA y se entregan 10 códigos de recuperación | QR PNG de 490×490 px; activación con la clave del QR: 200, 10 códigos de recuperación; /auth/2fa/setup con sesión: 200, PNG válido | Aprobado | 24-11-2026 12:21:06 |
| P12 | Descargar el reporte consolidado del semestre en PDF y en Excel | Ambos archivos se generan, no están vacíos y son válidos: el PDF tiene formato PDF y el Excel se puede abrir y tiene hojas con datos | PDF: 1.720 bytes, formato PDF válido. Excel: 7.582 bytes, 3 hojas con datos (Resumen, Bodega Detalle, Paquetes de Insumos) | Aprobado | 24-11-2026 12:21:40 |
| P13 | Dos personas cierran la misma orden de entrada al mismo tiempo (por ejemplo, un doble clic en "Cerrar y actualizar stock"), repetido 20 veces | Solo un cierre se acepta; el otro se rechaza. Queda un único movimiento de compra de 10 unidades y el stock sube exactamente 10 | 20 de 20 intentos correctos: un cierre aceptado (200) y el otro rechazado (400), 1 movimiento de compra de 10 y stock 4 → 14 | Aprobado | 24-11-2026 12:21:29 |
| P14 | Mientras una persona cierra una orden de entrada (llegan 10 unidades), otra retira 5 unidades del mismo insumo en el mismo instante, repetido 20 veces | Ambas operaciones se aceptan y ninguna se pierde: el stock pasa de 20 a 25 (20 + 10 − 5) en todos los intentos | 20 de 20 intentos correctos: cierre 200, retiro 200 y stock final 25 | Aprobado | 24-11-2026 12:21:34 |
| P15 | Una persona cierra una orden de entrada y otra la cancela en el mismo instante, repetido 20 veces | Solo una de las dos acciones se acepta y el resultado es coherente: si quedó cerrada, el stock sumó lo recibido; si quedó cancelada, el stock no cambió | 20 de 20 intentos coherentes (11× cerrar 200 / cancelar 400 → cerrada, stock 30; 9× cerrar 400 / cancelar 200 → cancelada, stock 20) | Aprobado | 24-11-2026 12:21:39 |
| P16 | Dos operadoras confirman "Sala lista" del mismo taller exactamente al mismo tiempo (retiro de bodega de 3 unidades, stock 20), repetido 10 veces | El stock siempre coincide con los retiros registrados: si quedan 2 retiros de 3, el stock baja a 14; nunca queda un retiro registrado sin descontar | 10 de 10 intentos con el stock igual a los retiros registrados (10× respuestas (200, 200), 2 retiros, stock 14) | Aprobado | 24-11-2026 12:21:08 |
| P17 | La misma confirmación de "Sala lista" llega dos veces al servidor (por ejemplo, un reintento de red), una después de la otra | El retiro de bodega se descuenta una sola vez (stock 20 → 17, 1 movimiento) | Las dos confirmaciones se aceptan (200 y 200) y el stock baja a 14: el retiro se descontó dos veces | Fallo esperado | 24-11-2026 12:21:09 |
| P18 | Dos personas inician la revisión de la misma sala y clase al mismo tiempo, repetido 20 veces | Se crea una sola revisión; las dos personas reciben la misma | 20 de 20 intentos con una sola revisión (20× 1 revisión(es)) | Aprobado | 24-11-2026 12:21:11 |
| P19 | Doble clic en "Marcar sala como revisada" (dos envíos al mismo tiempo), repetido 10 veces | La revisión queda completada una sola vez: un solo registro de cierre en la auditoría | 10 de 10 intentos con un solo cierre en la auditoría (10× 1 registro(s)) | Aprobado | 24-11-2026 12:21:13 |
| P20 | Dos personas marcan como "retornado" el mismo implemento prestado (2 unidades, stock 5) al mismo tiempo, repetido 10 veces | Solo una marca se acepta (la otra recibe 409 "ya fue marcado") y el stock sube una sola vez: 5 → 7 | 10 de 10 intentos correctos (10× respuestas (200, 409), stock 7) | Aprobado | 24-11-2026 12:21:14 |
| P21 | La misma entrega directa a un docente (3 unidades, stock 10) llega dos veces al servidor | La entrega se descuenta una sola vez (stock 10 → 7) | Las dos entregas se aceptan (200 y 200) y el stock baja a 4 | Fallo esperado | 24-11-2026 12:21:15 |
| P22 | La misma orden de "Generar unidades en lote" (3 unidades de un implemento) llega dos veces al servidor | Se crean 3 unidades físicas, no 6 | Las dos peticiones se aceptan (201 y 201) y quedan 6 unidades | Fallo esperado | 24-11-2026 12:21:16 |
| P23 | Una operadora completa una solicitud de retiro (2 unidades, stock 10) | La solicitud queda completada (200) y el stock baja a 8 | Error 500 al completar; el stock sigue en 10 | Fallo esperado | 24-11-2026 12:21:17 |
| P24 | Dos personas cierran la misma orden de mantenimiento al mismo tiempo, repetido 20 veces | Solo un cierre se acepta (el otro recibe 409 "ya está cerrada") y queda un solo registro de cierre en la auditoría | 20 de 20 intentos correctos (20× respuestas (200, 409), 1 cierre(s) auditado(s)) | Aprobado | 24-11-2026 12:21:20 |
| P25 | Dos personas abren al mismo tiempo una orden de mantenimiento para el mismo Phantoma, repetido 10 veces | Solo una orden se crea; la otra recibe 409 "ya tiene una orden de mantenimiento activa" | 10 de 10 intentos correctos (10× respuestas (201, 409), 1 orden(es)) | Aprobado | 24-11-2026 12:21:21 |

## Defectos conocidos (fallos esperados)

Estos casos prueban una regla que hoy el sistema **no cumple** y cuya corrección requiere un cambio distinto de los ya aplicados. Están marcados como *fallo esperado* (`xfail`): no bloquean la integración continua, pero si el defecto se corrige la prueba empieza a pasar y pytest avisa para quitar la marca.

### En pantallas habilitadas (la interfaz ya evita el doble clic; el riesgo queda si la petición se reenvía por otra vía)

- **P17** — DEFECTO: "Sala lista" (POST /paquetes/{id}/confirmar-preparacion) no guarda que la preparación ya se confirmó, así que una segunda petición con los mismos datos vuelve a descontar los retiros. El botón de la pantalla ya evita el doble clic, pero un reenvío (reintento de red, otra pestaña) descuenta dos veces. Corregirlo requiere registrar cada confirmación (por paquete, sala y fecha) o un identificador de envío; no basta con bloquear una fila.
- **P22** — DEFECTO: "Generar unidades en lote" (POST /unidades-implemento/generar-lote) crea las unidades cada vez que recibe la petición. El botón ya evita el doble clic, pero un reenvío crea el lote dos veces. Corregirlo requiere un identificador de envío o generar solo las unidades que faltan para cuadrar con el stock.

### En módulos no habilitados en la interfaz (préstamos, entregas directas y solicitudes)

- **P21** — DEFECTO: la entrega directa (POST /movimientos/entrega-directa) no tiene un estado ni un identificador de envío, así que un reenvío descuenta el stock dos veces y registra dos préstamos. La página que la usa no está habilitada en la interfaz. Corregirlo requiere un identificador de envío (idempotencia).
- **P23** — DEFECTO: completar una solicitud (POST /solicitudes/{id}/completar) falla SIEMPRE con error 500: crea el movimiento de salida sin "subtipo" y la base de datos lo exige. No es un problema de concurrencia; el módulo de solicitudes no está habilitado en la interfaz. Corregirlo requiere decidir el subtipo (consumo de taller o préstamo de implemento, como en la entrega directa).

### Sin prueba automática

- **Importar insumos dos veces** — volver a importar el mismo archivo crea insumos duplicados cuando las filas no traen SKU (el importador siempre crea, no actualiza). Es un flujo de varios pasos con código TOTP, no un doble clic. Corregirlo requiere definir cómo reconocer un insumo existente (por SKU, código de barras o nombre).

## Historial de defectos corregidos

Defectos que estas pruebas detectaron y que ya se corrigieron. Cada prueba fallaba con el código anterior y hoy pasa; queda en la suite para que el defecto no vuelva.

| ID | Defecto corregido | Estado hoy |
|---|---|---|
| P13 | Dos cierres simultáneos de una orden de entrada registraban dos compras aunque el stock subía una vez. Corregido en PR #10 (bloqueo de la orden y botón desactivado mientras procesa). | Aprobado |
| P14 | Un retiro registrado mientras se cerraba una orden de entrada se perdía (el stock quedaba 5 unidades más alto). Corregido en PR #10 (bloqueo y relectura del insumo). | Aprobado |
| P15 | Cerrar y cancelar la misma orden de entrada a la vez podía aceptar ambas acciones (la pantalla decía cancelada y la orden quedaba cerrada). Corregido en PR #10 (bloqueo de la orden). | Aprobado |
| P16 | Dos confirmaciones simultáneas de "Sala lista" registraban dos retiros pero descontaban el stock una sola vez: el insumo se cargaba antes del bloqueo y se usaba ese valor viejo. Corregido: el insumo se bloquea y se relee. | Aprobado |
| P18 | Dos "Iniciar revisión" simultáneos para la misma clase creaban dos revisiones de sala. Corregido: se bloquea la programación antes de verificar si ya existe. | Aprobado |
| P19 | Dos "Marcar sala como revisada" simultáneos se aceptaban ambos: la auditoría registraba dos cierres y la hora de cierre quedaba pisada. Corregido: se bloquea la revisión y el botón se desactiva mientras procesa. | Aprobado |
| P20 | Dos "retornado" simultáneos sobre el mismo préstamo se aceptaban ambos (la validación de estado no estaba protegida). Corregido: se bloquea el retorno y se relee el insumo; el segundo recibe 409. | Aprobado |
| P24 | Dos cierres simultáneos de una orden de mantenimiento podían aceptarse ambos y duplicar el registro en la auditoría. Corregido: se bloquea la orden. | Aprobado |
| P25 | Dos órdenes de mantenimiento creadas al mismo tiempo para el mismo Phantoma se aceptaban ambas (el Phantoma quedaba en dos visitas). Corregido: se bloquean los Phantomas antes de validar su estado. | Aprobado |

## Cómo ejecutar las pruebas

Con el stack levantado (`docker compose up -d`), desde la raíz del repositorio:

```powershell
docker compose run --rm --no-deps -v ./docs:/docs -e HESTIA_REPORTE_PRUEBAS=/docs/PRUEBAS.md api sh -c "pip install -q -r requirements-dev.txt && pytest"
```

Las pruebas crean una base PostgreSQL temporal (`hestia_test_…`) en el servidor `db`, la usan y la borran al terminar; la base de la aplicación (`hestia_db`) no se toca. Sin `HESTIA_REPORTE_PRUEBAS` no se reescribe este archivo. En GitHub Actions las pruebas corren en cada push y pull request contra un servicio `postgres:16` y bloquean si alguna falla.

## Detalle técnico

| ID | Prueba (pytest) | Duración |
|---|---|---|
| P01 | `tests/test_stock.py::test_salida_mayor_que_stock_se_rechaza` | 0.84 s |
| P02 | `tests/test_stock.py::test_entrada_y_salida_actualizan_stock` | 0.78 s |
| P03 | `tests/test_stock.py::test_estados_agotado_bajo_stock_ok` | 0.77 s |
| P04 | `tests/test_stock.py::test_salidas_simultaneas_no_dejan_stock_negativo` | 1.15 s |
| P05 | `tests/test_preparacion_y_ordenes.py::test_sala_lista_solo_descuenta_retiros_de_bodega` | 0.69 s |
| P06 | `tests/test_preparacion_y_ordenes.py::test_cerrar_orden_suma_recibido_y_cancela_items_en_cero` | 1.69 s |
| P07 | `tests/test_permisos.py::test_visor_no_puede_registrar_movimientos` | 0.70 s |
| P08 | `tests/test_permisos.py::test_operador_no_accede_a_gestion_de_usuarios` | 1.35 s |
| P09 | `tests/test_autenticacion.py::test_login_sin_totp_valido_se_rechaza` | 0.80 s |
| P10 | `tests/test_autenticacion.py::test_login_entrega_jwt_valido_y_rechaza_expirado_o_alterado` | 0.67 s |
| P11 | `tests/test_autenticacion.py::test_generacion_qr_2fa` | 1.47 s |
| P12 | `tests/test_reportes.py::test_exportar_reportes_pdf_y_excel` | 1.57 s |
| P13 | `tests/test_preparacion_y_ordenes.py::test_cierre_simultaneo_de_orden_registra_una_sola_compra` | 4.00 s |
| P14 | `tests/test_preparacion_y_ordenes.py::test_cierre_de_orden_y_retiro_simultaneos_no_pierden_stock` | 4.62 s |
| P15 | `tests/test_preparacion_y_ordenes.py::test_cierre_y_cancelacion_simultaneos_son_coherentes` | 5.00 s |
| P16 | `tests/test_doble_envio.py::test_sala_lista_simultanea_descuenta_cada_retiro` | 1.48 s |
| P17 | `tests/test_doble_envio.py::test_sala_lista_reenviada_descuenta_una_vez` | 0.66 s |
| P18 | `tests/test_doble_envio.py::test_iniciar_revision_simultanea_crea_una_sola` | 1.82 s |
| P19 | `tests/test_doble_envio.py::test_completar_revision_simultanea_registra_un_cierre` | 1.51 s |
| P20 | `tests/test_doble_envio.py::test_marcar_retorno_simultaneo_se_acepta_una_vez` | 1.54 s |
| P21 | `tests/test_doble_envio.py::test_entrega_directa_reenviada_descuenta_una_vez` | 0.93 s |
| P22 | `tests/test_doble_envio.py::test_generar_lote_reenviado_crea_una_vez` | 0.70 s |
| P23 | `tests/test_doble_envio.py::test_completar_solicitud_descuenta_stock` | 0.79 s |
| P24 | `tests/test_doble_envio.py::test_cerrar_mantenimiento_simultaneo_se_acepta_una_vez` | 2.90 s |
| P25 | `tests/test_doble_envio.py::test_crear_mantenimiento_simultaneo_mismo_phantoma` | 1.13 s |

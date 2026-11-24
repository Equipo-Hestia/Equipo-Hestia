# Pruebas automáticas de Hestia

> Archivo generado automáticamente por `pytest` (`backend/tests/conftest.py`) a partir de una ejecución real. No editar a mano: volver a ejecutar las pruebas para actualizarlo.

## Resumen

| Dato | Valor |
|---|---|
| Versión de `main` (commit) | `d337854` |
| Fecha de ejecución | 24-11-2026 02:52 (hora de Chile) |
| Total de casos | 13 |
| Aprobados | 12 |
| Fallidos | 0 |
| Fallos esperados (defectos conocidos) | 1 |
| Base de datos | PostgreSQL 16.15 (Debian 16.15-1.pgdg13+2), base temporal `hestia_test_c45b5b125d` (creada y borrada en la ejecución) |
| Python | 3.11.18 |

## Casos

| ID | Qué se prueba | Resultado esperado | Resultado obtenido | Estado | Fecha de ejecución |
|---|---|---|---|---|---|
| P01 | Retirar de bodega más unidades de las que hay disponibles | El sistema rechaza el retiro (error 400) y el stock no cambia | Rechazado con 400 ("Stock insuficiente. Disponible: 5"); stock sigue en 5 | Aprobado | 24-11-2026 02:52:34 |
| P02 | Registrar una entrada (compra) y luego una salida (consumo) de un insumo | Stock 10 → +5 = 15 → −3 = 12, y quedan registrados los 2 movimientos | Stock 10 → 15 → 12; 2 movimientos registrados | Aprobado | 24-11-2026 02:52:34 |
| P03 | Clasificación del estado de cada insumo según su stock y su stock mínimo | Stock 0 = "agotado"; stock igual o menor al mínimo = "bajo stock"; stock sobre el mínimo = "ok". Las alertas y el panel cuentan lo mismo | 0/5 → agotado; 5/5 → bajo_stock; 3/5 → bajo_stock; 6/5 → ok. Alertas: los 3 primeros, no el "ok". Panel: +1 agotado, +3 bajo stock | Aprobado | 24-11-2026 02:52:35 |
| P04 | Dos operadoras retiran el mismo insumo exactamente al mismo tiempo (2 retiros de 7 con stock 10, repetido 10 veces) | En cada intento solo se acepta un retiro; el otro se rechaza por stock insuficiente y el stock queda en 3, nunca negativo | 10/10 intentos: un retiro aceptado (200) y uno rechazado (400); stock final 3 en todos (mínimo observado: 3) | Aprobado | 24-11-2026 02:52:36 |
| P05 | Confirmar "Sala lista" en Preparar taller: un ítem ya estaba en la sala, otro se retira de bodega y otro no tiene stock suficiente | Solo se descuenta el ítem retirado de bodega (10 → 7); el que ya estaba en sala no cambia; el que no alcanza se informa como omitido y no se descuenta | En sala: 10 → 10; retiro de bodega: 10 → 7 (1 movimiento consumo_taller); sin stock: 2 → 2, informado: "Jeringas (sin stock) 56510e26 (solicitado: 5, disponible: 2)" | Aprobado | 24-11-2026 02:52:27 |
| P06 | Cerrar una orden de entrada (compra) donde un producto llegó completo, otro llegó en cantidad 0 y otro nunca se registró | Al producto recibido se le suman 10 unidades mediante un movimiento de compra; los ítems con 0 o sin recepción quedan "cancelado" y su stock no cambia | Orden cerrada. Recibido: 4 → 14 con 1 movimiento entrada/compra de 10 (el stock no cambió antes del cierre); llegó 0: cancelado, 4 → 4; sin recepción: cancelado, 4 → 4 | Aprobado | 24-11-2026 02:52:28 |
| P07 | Un usuario con rol Visor (solo lectura) intenta registrar un movimiento de stock | El sistema lo rechaza con error 403 (sin permiso) y el stock no cambia; sí puede ver el listado de movimientos | Salida: 403; entrada: 403; stock sigue en 10; listado de movimientos: 200 | Aprobado | 24-11-2026 02:52:25 |
| P08 | Un usuario con rol Operador intenta entrar a la gestión de usuarios (ver la lista o crear un usuario) | El sistema rechaza ambas acciones con error 403 (sin permiso); un Administrador sí puede ver la lista | Operador: listar 403, crear 403; administrador: listar 200 | Aprobado | 24-11-2026 02:52:26 |
| P09 | Iniciar sesión con la contraseña correcta pero un código de Google Authenticator (2FA) incorrecto o vacío | El sistema no entrega acceso: código incorrecto → 403, código vacío → 422, y el token intermedio no sirve para entrar (401) | Código incorrecto: 403 ("Código 2FA incorrecto"), sin token; código vacío: 422; token intermedio usado para entrar: 401 | Aprobado | 24-11-2026 02:52:23 |
| P10 | Iniciar sesión correctamente (contraseña + código 2FA) y luego usar un token vencido o modificado | El login entrega un token (JWT) válido que permite entrar; un token vencido, alterado o firmado con otra clave se rechaza (401) | Token válido: /usuarios/me 200 (sub, rol, exp y jti correctos); vencido: 401; alterado: 401; otra clave: 401 | Aprobado | 24-11-2026 02:52:24 |
| P11 | Configurar el doble factor (2FA) de un usuario nuevo: el sistema muestra el código QR para escanear con Google Authenticator | Se genera una imagen PNG válida con el QR y una clave; con un código generado desde esa clave se activa el 2FA y se entregan 10 códigos de recuperación | QR PNG de 490×490 px; activación con la clave del QR: 200, 10 códigos de recuperación; /auth/2fa/setup con sesión: 200, PNG válido | Aprobado | 24-11-2026 02:52:25 |
| P12 | Descargar el reporte consolidado del semestre en PDF y en Excel | Ambos archivos se generan, no están vacíos y son válidos: el PDF tiene formato PDF y el Excel se puede abrir y tiene hojas con datos | PDF: 1.720 bytes, formato PDF válido. Excel: 7.049 bytes, 3 hojas con datos (Resumen, Bodega Detalle, Paquetes de Insumos) | Aprobado | 24-11-2026 02:52:33 |
| P13 | Dos personas cierran la misma orden de entrada al mismo tiempo (por ejemplo, un doble clic en "Cerrar y actualizar stock"), repetido 20 veces | Solo un cierre se acepta; el otro se rechaza. Queda un único movimiento de compra de 10 unidades y el stock sube exactamente 10 | En 19 de 20 intentos se aceptaron los dos cierres (respuestas 200 y 200) y quedaron 2 movimientos de compra por 20 unidades, aunque el stock solo subió de 4 a 14. El historial de compras no cuadra con el stock | Fallo esperado | 24-11-2026 02:52:32 |

## Defectos conocidos (fallos esperados)

Estos casos prueban una regla que hoy el sistema **no cumple**. Se dejaron marcados como *fallo esperado* (`xfail`) para no corregir la aplicación en el mismo cambio que agrega las pruebas: no bloquean la integración continua, pero si el defecto se corrige la prueba empieza a pasar y pytest avisa para quitar la marca.

- **P13** — DEFECTO: al cerrar una orden de entrada (POST /ordenes-entrada/{id}/cerrar) el sistema no bloquea la orden mientras la procesa (falta SELECT ... FOR UPDATE). Si llegan dos cierres al mismo tiempo, ambos se aceptan y cada uno registra un movimiento de compra: el historial muestra el doble de lo recibido, aunque el stock sube una sola vez.

## Cómo ejecutar las pruebas

Con el stack levantado (`docker compose up -d`), desde la raíz del repositorio:

```powershell
docker compose run --rm --no-deps -v ./docs:/docs -e HESTIA_REPORTE_PRUEBAS=/docs/PRUEBAS.md api sh -c "pip install -q -r requirements-dev.txt && pytest"
```

Las pruebas crean una base PostgreSQL temporal (`hestia_test_…`) en el servidor `db`, la usan y la borran al terminar; la base de la aplicación (`hestia_db`) no se toca. Sin `HESTIA_REPORTE_PRUEBAS` no se reescribe este archivo. En GitHub Actions las pruebas corren en cada push y pull request contra un servicio `postgres:16` y bloquean si alguna falla.

## Detalle técnico

| ID | Prueba (pytest) | Duración |
|---|---|---|
| P01 | `tests/test_stock.py::test_salida_mayor_que_stock_se_rechaza` | 0.53 s |
| P02 | `tests/test_stock.py::test_entrada_y_salida_actualizan_stock` | 0.59 s |
| P03 | `tests/test_stock.py::test_estados_agotado_bajo_stock_ok` | 0.75 s |
| P04 | `tests/test_stock.py::test_salidas_simultaneas_no_dejan_stock_negativo` | 1.06 s |
| P05 | `tests/test_preparacion_y_ordenes.py::test_sala_lista_solo_descuenta_retiros_de_bodega` | 0.66 s |
| P06 | `tests/test_preparacion_y_ordenes.py::test_cerrar_orden_suma_recibido_y_cancela_items_en_cero` | 1.23 s |
| P07 | `tests/test_permisos.py::test_visor_no_puede_registrar_movimientos` | 0.57 s |
| P08 | `tests/test_permisos.py::test_operador_no_accede_a_gestion_de_usuarios` | 1.05 s |
| P09 | `tests/test_autenticacion.py::test_login_sin_totp_valido_se_rechaza` | 0.67 s |
| P10 | `tests/test_autenticacion.py::test_login_entrega_jwt_valido_y_rechaza_expirado_o_alterado` | 0.54 s |
| P11 | `tests/test_autenticacion.py::test_generacion_qr_2fa` | 1.09 s |
| P12 | `tests/test_reportes.py::test_exportar_reportes_pdf_y_excel` | 0.85 s |
| P13 | `tests/test_preparacion_y_ordenes.py::test_cierre_simultaneo_de_orden_registra_una_sola_compra` | 3.34 s |

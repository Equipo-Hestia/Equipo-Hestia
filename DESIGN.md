# DESIGN.md — Sistema de diseno visual de Hestia

Este archivo documenta las decisiones de diseno tomadas para Hestia: filosofia visual,
tokens de color, componentes con identidad propia y animaciones. Es la fuente de verdad
para cualquier trabajo de frontend. Leerlo antes de tocar CSS, Tailwind o componentes UI.

---

## 1. Filosofia y concepto central

**Hestia no es una aplicacion medica generica. Tiene caracter propio.**

La direccion elegida es **Opcion B + C**:

- **Modo oscuro como estado natural.** El dark mode no es una opcion secundaria; es la
  identidad base del sistema. Light mode existe pero el diseno se piensa primero en oscuro.
- **Calidad perceptible.** Cada detalle — bordes, sombras, transiciones — debe comunicar
  que el sistema fue construido con cuidado. No es un CRUD academico, es una herramienta
  real para personas reales.
- **Identidad de marca presente.** Hestia tiene nombre, logo y acromino propio. Eso debe
  sentirse en la UI, no solo en el titulo de la pagina.
- **Micro-animaciones selectivas.** Fades, reveals y transiciones en lugares concretos.
  Nada que distraiga; todo que refuerce la sensacion de calidad.

**Referencias visuales:**
- **Raycast.com** — efecto aurora/blob en fondos, boton con beam animado
- **Linear.app** — sidebar oscuro con gradientes sutiles, tipografia bold en headers,
  micro-animaciones en hover, sistema de color con profundidad

---

## 2. Tipografia

| Propiedad     | Valor                          |
|---|---|
| Familia       | Nunito (Google Fonts)          |
| Peso normal   | 400                            |
| Peso medium   | 600                            |
| Peso bold     | 700 / 800                      |
| Aplicacion    | `* { font-family: 'Nunito', sans-serif; }` en index.css |

Nunito fue elegida por su caracter redondo y amigable, que contrasta bien con la
oscuridad del fondo sin perder legibilidad. No cambiar a otra familia sin consenso.

---

## 3. Sistema de tokens de color (CSS custom properties)

Definidos en `frontend/src/index.css`, dentro de `:root` (modo claro) y `.dark` (modo oscuro).
Son la **unica fuente de verdad** para colores. No usar valores hexadecimales hardcodeados
en componentes nuevos; usar siempre los tokens.

### 3.1 Clases de utilidad Tailwind disponibles

Los tokens se pueden usar directamente en Tailwind con el prefijo `h-`:

```
bg-h-base        bg-h-surface       bg-h-elevated      bg-h-highlight
border-h-subtle  border-h-visible   border-h-strong
text-h-primary   text-h-secondary   text-h-tertiary    text-h-accent
```

O directamente como CSS variables:
```css
var(--h-bg-base)       var(--h-bg-surface)
var(--h-teal-rest)     var(--h-teal-hover)    var(--h-teal-active)
var(--h-text-primary)  var(--h-border-subtle)
```

### 3.2 Paleta de fondos — Sistema de profundidad (Layer 1)

El sistema de fondos crea percepcion de profundidad Z mediante diferencias sutiles de luminosidad.
Cada nivel tiene un rol semantico estricto:

| Token              | Dark mode  | Light mode | Uso semantico                         |
|---|---|---|---|
| `--h-bg-base`      | `#0f1117`  | `#f8fafc`  | Fondo de pagina (nivel mas bajo)      |
| `--h-bg-surface`   | `#161b22`  | `#ffffff`  | Sidebar, cards contenedor             |
| `--h-bg-elevated`  | `#1e2530`  | `#f1f5f9`  | Cards internas, modales               |
| `--h-bg-highlight` | `#263040`  | `#e2e8f0`  | Estado selected, active, hover fuerte |

**Regla:** un elemento nunca debe tener el mismo fondo que su contenedor.
Si el contenedor es `surface`, el interior debe ser `elevated`.

### 3.3 Paleta de bordes

| Token                  | Dark mode  | Light mode | Uso semantico                       |
|---|---|---|---|
| `--h-border-subtle`    | `#2a3444`  | `#e2e8f0`  | Entre cards, divisores suaves       |
| `--h-border-visible`   | `#3a4a5c`  | `#cbd5e1`  | Inputs, cards activos               |
| `--h-border-strong`    | `#4a5f72`  | `#94a3b8`  | Separadores de seccion              |

### 3.4 Paleta de texto

| Token                | Dark mode  | Light mode | Uso semantico                    |
|---|---|---|---|
| `--h-text-primary`   | `#f1f5f9`  | `#0f172a`  | Titulos, valores importantes     |
| `--h-text-secondary` | `#94a3b8`  | `#475569`  | Labels, descripciones            |
| `--h-text-tertiary`  | `#475569`  | `#94a3b8`  | Metadatos, timestamps, hints     |
| `--h-text-accent`    | `#1d9e75`  | `#0f6e56`  | Links, valores positivos         |

### 3.5 Paleta de acento teal (identidad de marca)

| Token              | Valor      | Uso                                         |
|---|---|---|
| `--h-teal-rest`    | `#0f6e56`  | Boton primario en reposo                    |
| `--h-teal-hover`   | `#1d9e75`  | Boton primario en hover; texto accent       |
| `--h-teal-active`  | `#5dcaa5`  | Boton primario en pressed; shimmer beam     |
| `--h-teal-subtle`  | `rgba(4,52,44,0.5)` (dark) | Fondos teal suaves     |
| `--h-teal-border`  | `#1d9e75`  | Bordes outline teal                         |

El teal es el color de identidad de Hestia. Reservarlo para acciones primarias,
links activos y elementos que merecen atencion. No sobre-usarlo.

### 3.6 Colores semanticos

Cada estado semantico tiene bg, border y text en ambos modos:

| Estado   | Variables                                                   |
|---|---|
| Warning  | `--h-sem-warning-bg/border/text`                            |
| Danger   | `--h-sem-danger-bg/border/text`                             |
| Success  | `--h-sem-success-bg/border/text`                            |
| Info     | `--h-sem-info-bg/border/text`                               |

En dark mode los fondos semanticos usan `rgba` con opacidad para integrarse
naturalmente con la profundidad del fondo.

---

## 4. Sistema de tres capas

La identidad visual de Hestia se construye en tres capas independientes:

### Layer 1 — Profundidad de color (IMPLEMENTADA)

Los tokens de la seccion 3. Crean la base oscura con sensacion de relieve Z.
Implementados en `frontend/src/index.css`.

### Layer 2 — Identidad de marca en el Sidebar (IMPLEMENTADA PARCIALMENTE)

El Sidebar es el ancla de identidad de Hestia en la app. Tiene:
- Logo con filtro CSS teal (`brightness(0) invert(1)` + teal overlay en la variante circular)
- Nombre "Hestia" prominente cuando expandido
- Acromino expandido: H·E·S·T·I·A en el footer del sidebar
- Fondo `--h-bg-surface` que lo diferencia del `--h-bg-base` de la pagina

**Pendiente en Layer 2:**
- Gradiente sutil o efecto de aurora muy leve en el header del Sidebar
- Tratamiento visual del avatar / nombre de usuario en la parte inferior

### Layer 3 — Micro-animaciones (IMPLEMENTADA EN LOGIN; PENDIENTE EN INTERIOR)

Animaciones implementadas en `Login.tsx`:
- **Blob de fondo reactivo al cursor** en el panel izquierdo (`PanelIzquierdo`)
  - Tres orbs gaussianos que se desplazan en paralaje segun la posicion del mouse
  - Glow adicional que sigue al cursor con lag de `0.07s`
- **Shimmer beam en botones primarios** (`ShimmerButton`)
  - Borde rotatorio con gradiente conico animado (`@property --h-angle`)
  - Colores del beam: `#5dcaa5`, `#9fe1cb` (teal claro)
- **Animacion TOTP** (`TotpInput`)
  - Los digitos entran con pop y se transforman en las letras H·E·S·T·I·A
  - Al confirmar, las letras vuelan al centro y explotan en el logo de Hestia

**Pendiente en Layer 3:**
- Fade-in de paginas al navegar (transition entre rutas React Router)
- Hover states con micro-transicion en rows de tabla
- Skeleton loaders con shimmer (ya tiene `.skeleton` en index.css, aplicar consistentemente)
- Transicion suave al colapsar/expandir el Sidebar

---

## 5. Componentes con diseno propio

### 5.1 ShimmerButton

Archivo: `frontend/src/pages/Login.tsx` (actualmente acoplado al Login).

**TODO:** extraer a `frontend/src/components/ui/ShimmerButton.tsx` para reutilizar
en otras paginas donde el CTA principal merece este tratamiento.

Funcionamiento:
- Usa `@property --h-angle` para animar un `conic-gradient` rotatorio
- El borde gira con `animation: h-spin-border 2.8s linear infinite`
- El fondo del boton es `--h-teal-rest` en hover cambia a `--h-teal-hover`
- El texto usa `#e1f5ee` (teal muy claro, casi blanco)

Cuando usar ShimmerButton vs boton normal:
- **ShimmerButton:** CTA principal de la vista ("Ingresar", "Activar 2FA", "Confirmar")
- **Boton normal teal:** acciones secundarias importantes ("Guardar", "Crear")
- **Boton outline:** acciones terciarias ("Cancelar", "Volver")

### 5.2 TotpInput

Archivo: `frontend/src/pages/Login.tsx`.

Componente custom que reemplaza el `<input>` estandar para el codigo TOTP.
Muestra 6 slots con las letras H·E·S·T·I·A como placeholder; al escribir cada
digito hace pop con animacion y reemplaza la letra. Al confirmar, las letras vuelan
al centro con animacion staggered.

### 5.3 PanelIzquierdo (Login)

Archivo: `frontend/src/pages/Login.tsx`.

Ocupa el 52% del ancho en desktop (oculto en mobile). Contiene:
- Fondo `--h-bg-surface` con grid de puntos
- Tres orbs teal gaussianos con paralaje por mouse
- Glow que sigue al cursor
- Logo + nombre Hestia en header
- Headline principal con acento teal en "clinicos"
- Stats del sistema (18 salas, 5 carreras, 100+ insumos)
- Footer con creditos DuocUC

### 5.4 Logo

Archivo: `frontend/src/components/ui/Logo.tsx`.

El logo tiene dos variantes:
- `logo.png` — logo rectangular para uso general
- `logo_hestia_circular.ico` — version circular para animaciones (TOTP confirm)

Filtro CSS aplicado para tema oscuro (convierte el logo a teal):
```css
filter: brightness(0) saturate(100%) invert(45%) sepia(80%)
        saturate(400%) hue-rotate(130deg) brightness(90%);
```

---

## 6. Estrategia de dark mode

### Como funciona

1. Zustand (`useThemeStore`) guarda la preferencia en `localStorage` con `persist`
2. Un script anti-FOUC en `index.html` aplica la clase `.dark` en `<html>` antes
   del primer render de React, evitando el flash de fondo blanco
3. Tailwind usa la estrategia `class` (no `media`): el dark mode se activa solo
   cuando `<html>` tiene la clase `dark`

### Cobertura global de overrides

`index.css` tiene una seccion de overrides globales con especificidad `(0,2,0)`
(`.dark .clase-tailwind`) que supera la especificidad de Tailwind `(0,1,0)`
sin necesitar `!important`. Esto permite que paginas con clases Tailwind estandar
(bg-white, text-slate-800, etc.) hereden el dark mode automaticamente.

**Regla:** al crear un componente nuevo, preferir las clases `h-*` (tokens propios)
antes que las clases Tailwind de slate/white. Los tokens responden al dark mode
automaticamente. Las clases Tailwind estandar dependen de los overrides globales.

### Estado de cobertura por pagina

| Pagina            | Dark mode      | Notas                                      |
|---|---|---|
| Login             | Completo       | Diseno propio dark-first                   |
| Layout / Sidebar  | Completo       | Usa tokens h-*                             |
| Dashboard         | Parcial        | Overrides globales cubren la mayoria       |
| Insumos           | Parcial        | Pendiente revision visual                  |
| Movimientos       | Parcial        | Pendiente revision visual                  |
| Alertas           | Parcial        | Pendiente revision visual                  |
| Usuarios          | Parcial        | Pendiente revision visual                  |
| Paquetes          | Parcial        | Tiene fix especifico de hover (slate-800)  |
| Reportes          | Parcial        | Pendiente revision visual                  |
| AuditLog          | Parcial        | Pendiente revision visual                  |
| ClasesDocente     | Completo       | Se agrego dark mode en sesion anterior     |

---

## 7. Reglas para trabajo de frontend

1. **Tokens antes que valores crudos.** Usar `var(--h-teal-hover)` o `text-h-primary`,
   no `#1d9e75` directamente en componentes.

2. **Dark mode por defecto.** Disenar pensando primero en `.dark`. Si algo no tiene
   sentido en dark mode, es una senial de que el token o la clase estan mal elegidos.

3. **Jerarquia de fondos.** Respetar siempre base → surface → elevated → highlight.
   Un card sobre la pagina: `bg-h-surface`. Un modal sobre un card: `bg-h-elevated`.

4. **Shimmer solo en CTA principal.** No aplicar el efecto shimmer a botones secundarios
   o de cancelacion; pierde impacto.

5. **Animaciones con `transition` de Tailwind.** Usar `transition-colors duration-150`
   para hovers de color. Usar `transition-all duration-200` para cambios de tamano.
   Evitar transiciones lentas (>300ms) en elementos de UI frecuente.

6. **Layer 3 pendiente.** Antes de agregar animaciones nuevas, consultar si encajan
   con el estilo de las ya implementadas (suaves, no intrusivas, con cubic-bezier
   que da sensacion de fisicalidad).

7. **Nunito siempre.** No usar `font-mono` salvo para codigos (TOTP, recovery codes,
   SKUs). El resto del sistema es Nunito en todos sus pesos.

8. **El teal es de accion, no de decoracion.** Reservarlo para botones primarios,
   links activos, badges de exito y valores que el usuario debe notar.

---

## 8. Pendientes de diseno priorizados

| Item                                               | Capa    | Prioridad |
|---|---|---|
| Dark mode completo en paginas internas             | Layer 1 | Alta      |
| Extraer ShimmerButton a componente reutilizable    | Layer 3 | Media     |
| Fade-in de paginas al navegar entre rutas          | Layer 3 | Media     |
| Hover micro-animacion en rows de tabla             | Layer 3 | Media     |
| Gradiente / aurora leve en header del Sidebar      | Layer 2 | Media     |
| Tratamiento visual del perfil en footer del Sidebar| Layer 2 | Baja      |
| Aplicar skeleton loader consistentemente           | Layer 3 | Baja      |

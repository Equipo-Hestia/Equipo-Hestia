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

| Propiedad  | Valor                                                     |
|---|---|
| Familia    | Nunito (Google Fonts)                                     |
| Peso normal| 400                                                       |
| Peso medium| 600                                                       |
| Peso bold  | 700 / 800                                                 |
| Aplicacion | `* { font-family: 'Nunito', sans-serif; }` en index.css   |

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

| Token              | Dark mode  | Light mode | Uso semantico                         |
|---|---|---|---|
| `--h-bg-base`      | `#0f1117`  | `#f8fafc`  | Fondo de pagina (nivel mas bajo)      |
| `--h-bg-surface`   | `#161b22`  | `#ffffff`  | Sidebar, cards contenedor             |
| `--h-bg-elevated`  | `#1e2530`  | `#f1f5f9`  | Cards internas, modales               |
| `--h-bg-highlight` | `#263040`  | `#e2e8f0`  | Estado selected, active, hover fuerte |

**Regla:** un elemento nunca debe tener el mismo fondo que su contenedor.

### 3.3 Paleta de bordes

| Token                | Dark mode  | Light mode | Uso semantico                   |
|---|---|---|---|
| `--h-border-subtle`  | `#2a3444`  | `#e2e8f0`  | Entre cards, divisores suaves   |
| `--h-border-visible` | `#3a4a5c`  | `#cbd5e1`  | Inputs, cards activos           |
| `--h-border-strong`  | `#4a5f72`  | `#94a3b8`  | Separadores de seccion          |

### 3.4 Paleta de texto

| Token                | Dark mode  | Light mode | Uso semantico                |
|---|---|---|---|
| `--h-text-primary`   | `#f1f5f9`  | `#0f172a`  | Titulos, valores importantes |
| `--h-text-secondary` | `#94a3b8`  | `#475569`  | Labels, descripciones        |
| `--h-text-tertiary`  | `#475569`  | `#94a3b8`  | Metadatos, timestamps, hints |
| `--h-text-accent`    | `#1d9e75`  | `#0f6e56`  | Links, valores positivos     |

### 3.5 Paleta de acento teal (identidad de marca)

| Token             | Valor                    | Uso                                     |
|---|---|---|
| `--h-teal-rest`   | `#0f6e56`                | Boton primario en reposo                |
| `--h-teal-hover`  | `#1d9e75`                | Boton primario en hover; texto accent   |
| `--h-teal-active` | `#5dcaa5`                | Boton primario en pressed; shimmer beam |
| `--h-teal-subtle` | `rgba(4,52,44,0.5)` dark | Fondos teal suaves                      |
| `--h-teal-border` | `#1d9e75`                | Bordes outline teal                     |

El teal es el color de identidad de Hestia. Reservarlo para acciones primarias,
links activos y elementos que merecen atencion. No sobre-usarlo.

### 3.6 Colores semanticos

| Estado  | Variables                            |
|---|---|
| Warning | `--h-sem-warning-bg/border/text`     |
| Danger  | `--h-sem-danger-bg/border/text`      |
| Success | `--h-sem-success-bg/border/text`     |
| Info    | `--h-sem-info-bg/border/text`        |

---

## 4. Sistema de tres capas

### Layer 1 — Profundidad de color (IMPLEMENTADA)

Los tokens de la seccion 3. Implementados en `frontend/src/index.css`.

### Layer 2 — Identidad de marca en el Sidebar (IMPLEMENTADA PARCIALMENTE)

- Logo con filtro CSS teal
- Nombre "Hestia" prominente cuando expandido
- Acromino H·E·S·T·I·A en el footer del sidebar
- Fondo `--h-bg-surface` diferenciado del `--h-bg-base` de la pagina

**Pendiente:** gradiente/aurora leve en header del Sidebar; tratamiento visual del avatar.

### Layer 3 — Micro-animaciones (IMPLEMENTADA EN LOGIN; PARCIAL EN INTERIOR)

En Login.tsx: malla interactiva fluida (ambient wave en canvas), blob reactivo al cursor (acelerado por GPU), 
shimmer beam, animacion TOTP.

En paginas internas: hover de filas de tabla con `onMouseEnter/Leave` aplicado
consistentemente en ActivosFijos, Movimientos, UnidadesImplemento, Insumos,
OrdenesMantenimiento. Pendiente: fade-in entre rutas, skeleton loader consistente,
transicion suave del Sidebar.

---

## 5. Componentes UI reutilizables

### 5.1 HSelect

Archivo: `frontend/src/components/ui/HSelect.tsx`

Dropdown 100% custom que reemplaza `<select>` nativo. El `<select>` nativo no permite
estilizar las `<option>` con CSS — el browser las renderiza con los colores del SO.
`HSelect` resuelve esto con un `div` + lista controlada.

Props:
```ts
value: string
onChange: (v: string) => void
options: { value: string; label: string; disabled?: boolean }[]
placeholder?: string   // opcion vacia
size?: 'sm' | 'md'    // 'sm' para filtros inline, 'md' para formularios
disabled?: boolean
className?: string
```

Uso tipico:
```tsx
// Filtro inline (barra de filtros)
<HSelect
  value={catFiltro}
  onChange={v => { setCatFiltro(v); goToPage(0) }}
  options={catOpts}
  placeholder="Todas las categorias"
  size="sm"
/>

// Campo de formulario (modal)
<HSelect
  value={salaId}
  onChange={setSalaId}
  options={salaOpts}
  placeholder="Sin asignar"
  className="w-full"
/>
```

Paginas donde esta aplicado: Insumos (categoria, tipo, categoria en formulario),
UnidadesImplemento (filtro sala, sala en modal admin), ActivosFijos (estado, sala,
proveedor, fidelidad en formulario + filtros estado y sala), OrdenesMantenimiento
(pendiente aplicacion completa).

### 5.2 useLastUpdated

Archivo: `frontend/src/hooks/useLastUpdated.ts`

Hook que centraliza la logica de "ultima actualizacion" para paginas con boton refresh.
Resuelve el bug de texto congelado: usa `setInterval(30s)` para recalcular el label
reactivamente sin tocar el backend.

```ts
const { labelTiempo, marcarActualizado } = useLastUpdated()
// Llamar marcarActualizado() despues de cada fetch exitoso.
// labelTiempo: string reactivo — 'Actualizado hace un momento' / 'hace X min'
```

**Estandar de UI para paginas con refresh:**
- `labelTiempo` mostrado bajo el subtitulo del encabezado (`text-xs text-h-tertiary mt-1`)
- Boton refresh: **solo icono** `<RefreshCw size={15} />`, sin texto
- Estilo del boton: `p-2 rounded-lg border border-h-subtle bg-h-elevated` con hover
  `onMouseEnter/Leave`

Paginas donde esta aplicado: Alertas, ActivosFijos, Movimientos, AuditLog,
OrdenesMantenimiento, Reportes (TabPaquetes).

### 5.3 ShimmerButton

Archivo: `frontend/src/pages/Login.tsx` (acoplado; pendiente extraer a `components/ui/`).

Boton CTA con borde rotatorio animado (`@property --h-angle`, `conic-gradient`).
Usar solo para el CTA principal de una vista. Ver seccion 7 para jerarquia de botones.

### 5.4 TotpInput

Archivo: `frontend/src/components/ui/TotpInput.tsx`.

6 slots con letras H·E·S·T·I·A como placeholder. Animacion pop al escribir cada digito.
Al confirmar, las letras vuelan al centro con animacion staggered.

### 5.5 PanelIzquierdo (Login)

Archivo: `frontend/src/pages/Login.tsx`.

52% del ancho en desktop, oculto en mobile. Blob reactivo al cursor, orbs teal gaussianos,
stats del sistema, footer DuocUC.

### 5.6 Logo

Archivo: `frontend/src/components/ui/Logo.tsx`.
Filtro CSS para tema oscuro:
```css
filter: brightness(0) saturate(100%) invert(45%) sepia(80%)
        saturate(400%) hue-rotate(130deg) brightness(90%);
```

---

## 6. Estrategia de dark mode

1. Zustand (`useThemeStore`) guarda preferencia en `localStorage` con `persist`.
2. Script anti-FOUC en `index.html` aplica `.dark` en `<html>` antes del primer render.
3. Tailwind estrategia `class` (no `media`).

`index.css` tiene overrides globales con especificidad `(0,2,0)` para cubrir paginas
con clases Tailwind estandar sin `!important`.

**Regla:** preferir clases `h-*` sobre `slate-*` o `white`. Los tokens responden al
dark mode automaticamente; las clases Tailwind estandar dependen de los overrides globales.

### Estado de cobertura por pagina

| Pagina               | Dark mode | Notas                                    |
|---|---|---|
| Login                | Completo  | Dark-first con blob + shimmer            |
| Layout / Sidebar     | Completo  | Tokens h-*                               |
| Insumos              | Completo  | Refactorizado a h-* + HSelect            |
| UnidadesImplemento   | Completo  | Rediseno completo h-*                    |
| ActivosFijos         | Completo  | Rediseno completo h-* + HSelect          |
| Alertas              | Completo  | Rediseno completo h-* (sin Vencimientos) |
| Movimientos          | Completo  | Refactorizado a h-*                      |
| AuditLog             | Completo  | Refactorizado a h-*                      |
| OrdenesMantenimiento | Completo  | Refactorizado a h-*                      |
| Reportes             | Completo  | Refactorizado a h-*                      |
| Dashboard            | Parcial   | Overrides globales                       |
| Usuarios             | Completo  | Migrado a h-* junio 2026                 |
| Paquetes             | Completo  | Migrado a h-* junio 2026                 |
| ClasesDocente        | Completo  | Sesion anterior                          |
| Incidencias          | Completo  | Construida con h-* desde el inicio       |
| OrdenesEntrada       | Completo  | Construida con h-* desde el inicio       |
| Proveedores          | Completo  | Construida con h-* desde el inicio       |
| VistaSalas           | Completo  | Construida con h-* desde el inicio       |
| ImportarProgramacion | Completo  | Construida con h-* desde el inicio       |
| Importaciones        | Completo  | Construida con h-* desde el inicio       |

---

## 7. Reglas para trabajo de frontend

1. **Tokens antes que valores crudos.** `var(--h-teal-hover)` o `text-h-primary`,
   nunca `#1d9e75` hardcodeado.
2. **Dark mode por defecto.** Disenar primero en `.dark`.
3. **Jerarquia de fondos.** base → surface → elevated → highlight.
4. **Shimmer solo en CTA principal.** No en botones secundarios.
5. **Animaciones con `transition-colors duration-150`** para hovers. Evitar >300ms.
6. **Nunito siempre.** `font-mono` solo para codigos (TOTP, SKUs, codigos internos).
7. **El teal es de accion.** Botones primarios, links activos, valores clave.
8. **HSelect obligatorio.** No usar `<select>` nativo para dropdowns visibles al usuario.
   Excepcion: selects dentro de modales muy simples donde el contexto sea inequivoco.
9. **useLastUpdated en toda pagina con refresh.** Estandar: label bajo subtitulo,
   boton solo icono `RefreshCw size=15`.
10. **Hover de filas de tabla.** Siempre con `onMouseEnter/Leave` usando
    `var(--h-bg-highlight)`. No usar `hover:` de Tailwind para filas (interferencia dark).

---

## 8. Pendientes de diseno priorizados

| Item                                               | Capa    | Prioridad |
|---|---|---|
| Extraer ShimmerButton a components/ui/             | Layer 3 | Media     |
| Fade-in de paginas al navegar entre rutas          | Layer 3 | Media     |
| Gradiente / aurora leve en header del Sidebar      | Layer 2 | Media     |
| Tratamiento visual del perfil en footer del Sidebar| Layer 2 | Baja      |
| Skeleton loader consistente en todas las paginas   | Layer 3 | Baja      |

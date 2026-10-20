# Viper — Guía de Estilos (design.md)

Única fuente de verdad para las clases de Tailwind del proyecto.
**Regla:** si un token, color o patrón no está en este documento, no se usa. Primero se agrega acá, después al código.

Extraído de: `src/index.css`, `index.html`, `Navbar.jsx`, `Hero.jsx`, `Footer.jsx`, `Landing.jsx`, `HeroBall3D.jsx` y los componentes de `src/shared/components`.
Stack: Tailwind CSS v4 (`@theme` en `src/index.css`, sin `tailwind.config.js`), React 19, animejs v4.

---

## 1. Colores

### 1.1 Tokens semánticos (OBLIGATORIOS)

Definidos en `@theme` y alimentados por variables CSS en `:root` (modo oscuro por defecto) y `.tema-claro`.

| Clase Tailwind | Variable | Oscuro | Claro | Uso |
|---|---|---|---|---|
| `bg-fondo` | `--bg-color` | `#09090B` | `#F3F4F6` | Fondo de página, fondo de contenedores de icono |
| `bg-panel` | `--surface-color` | `#18181B` | `#FFFFFF` | Tarjetas, footer, menú móvil, modales |
| `text-viper` / `bg-viper` / `border-viper` | `--primary-color` | `#10B981` | `#10B981` | Color de marca, acentos, CTA |
| `bg-viper-hover` | `--primary-hover` | `#059669` | `#059669` | Hover del botón primario |
| `text-texto` | `--text-main` | `#F8FAFC` | `#0F172A` | Texto principal |
| `text-texto-suave` | `--text-muted` | `#94A3B8` | `#64748B` | Texto secundario, descripciones, links de nav |
| `text-error` / `border-error` / `bg-error` / `bg-error/10` | `--error-color` | `#EF4444` | `#DC2626` | Errores de formulario, botón de peligro, estados negativos (cancelado, anulado) |
| `text-exito` / `border-exito` / `bg-exito/15` | `--success-color` | `#10B981` | `#059669` | Confirmaciones y estados positivos (activa, pagado, inscripciones abiertas). Es el mismo verde de marca |
| `text-advertencia` / `bg-advertencia` / `bg-advertencia/15` | `--warning-color` | `#F59E0B` | `#D97706` | Avisos y estados que piden atención (pago pendiente, inscripciones cerradas, W.O.), botón de advertencia |
| `text-info` / `border-info` / `bg-info/10` | `--info-color` | `#3B82F6` | `#2563EB` | Mensajes informativos y estado "En curso" |
| `text-violeta` / `bg-violeta/15` | `--violet-color` | `#8B5CF6` | `#7C3AED` | Estado "Finalizado" y rol Organizador |

Los tokens generan todas las utilidades de Tailwind (`bg-`, `text-`, `border-`, `ring-`, etc.) y admiten opacidad: `bg-fondo/90`, `bg-viper/20`, `bg-panel/85`.

### 1.2 Colores de la paleta Tailwind por defecto permitidos

Solo estos, solo para los usos indicados:

| Clase | Uso permitido |
|---|---|
| `border-gray-800` | Bordes de navbar, footer, tarjetas, divisores del menú móvil |
| `border-gray-700` | Borde del contenedor de icono dentro de tarjeta |
| `text-white` | Texto sobre el botón de peligro sólido (`bg-error`) |
| `text-black` | Texto sobre el botón primario sólido (`bg-viper`) y sobre el de advertencia (`bg-advertencia`) |
| `bg-black/60` | Overlay del menú móvil y de los modales |

> Deuda técnica: `border-gray-800/700` no cambian con `.tema-claro`. Si se activa el modo claro, crear tokens `--color-borde` y reemplazarlos primero acá.

### 1.3 Valores literales permitidos (no son clases de color)

| Valor | Dónde |
|---|---|
| `rgba(16,185,129,0.3)` | Sombra de glow del botón primario |
| `rgba(16,185,129,0.5)` | `drop-shadow` de iconos de tarjeta |
| `#10B981` / `#18181B` | Solo dentro de SVG (`HeroBall3D`), porque el atributo SVG no resuelve tokens |
| `#09090B` | `<meta name="theme-color">` |

### 1.4 Reglas

- Texto principal: `text-texto` (o heredado de `body`). Secundario: `text-texto-suave`. Acento: `text-viper`.
- Nunca usar `text-white` (salvo sobre `bg-error`, ver 1.2), `bg-black`, `bg-green-*`, `bg-emerald-*`, `text-gray-*` ni hex sueltos en JSX.
- El acento verde se usa con moderación: palabra clave de un título, CTA, bordes en hover, iconos.

---

## 2. Tipografía

Fuentes cargadas por Google Fonts en `index.html`: **Inter** (400, 500, 600) y **Outfit** (500, 600, 700, 800).

| Clase | Fuente | Uso |
|---|---|---|
| (por defecto, `font-sans`) | Inter | Todo el texto de cuerpo, links, descripciones |
| `font-outfit` | Outfit | Títulos (`h1`–`h3`), logo, botones, texto de marca |

### 2.1 Escala en uso

| Rol | Clases |
|---|---|
| Hero `h1` | `font-outfit text-5xl lg:text-7xl font-bold leading-tight text-balance` |
| Título de sección `h2` | `font-outfit text-3xl md:text-4xl font-bold` |
| Título de tarjeta `h3` | `font-outfit text-xl font-bold` |
| Logo | `font-outfit text-2xl font-bold tracking-wide` |
| Logo secundario ("Gestión Deportiva", apilado en dos líneas) | `font-outfit text-lg text-texto-suave` |
| Footer marca | `font-outfit text-xl font-bold` |
| Párrafo hero | `text-texto-suave text-lg lg:text-xl leading-relaxed` |
| Párrafo de tarjeta | `text-texto-suave leading-relaxed` |
| Subtítulo de sección | `text-texto-suave` |
| Link de navbar desktop | `font-medium text-texto-suave` |
| Link de menú móvil | `text-xl font-medium` |
| Texto de footer | `text-texto-suave text-sm` |
| Botón grande | `font-outfit font-bold text-lg` |
| Botón compacto (navbar) | `font-outfit font-semibold` |
| Título de modal y de confirmación | `font-outfit text-xl font-bold` |
| Etiqueta de campo | `font-medium` |
| Error o ayuda de campo, detalle de alerta | `text-sm` (error `text-error`, ayuda `text-texto-suave`) |
| Insignia de estado (Badge) | `text-sm font-medium` |
| Encabezado de tabla | `text-xs font-semibold uppercase tracking-wide` (color heredado: `text-texto-suave` en el contenedor) |

### 2.2 Reglas

- Títulos y botones → `font-outfit`. Todo lo demás → Inter (no se escribe clase).
- Pesos permitidos: `font-medium`, `font-semibold`, `font-bold` (los cargados en Google Fonts).
- Palabra destacada dentro de un título: `<span className="text-viper">…</span>`.

---

## 3. Layout y espaciado

### 3.1 Contenedor

- Ancho máximo: `max-w-7xl mx-auto px-6` (siempre, en navbar, hero, secciones y footer).
- Página: `min-h-screen bg-fondo flex flex-col`; `<main className="flex-grow">`.

### 3.2 Breakpoints (Tailwind por defecto, enfoque mobile-first)

`sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280. Navegación desktop desde `md`; hero en dos columnas desde `lg`; grilla de 4 columnas desde `xl`.

### 3.3 Patrones de sección

| Patrón | Clases |
|---|---|
| Hero | `relative pt-24 pb-0 sm:pt-28 lg:pt-32 lg:pb-12 px-6 max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-8 lg:gap-12` |
| Sección de contenido | `max-w-7xl mx-auto px-6 pt-8 pb-12 md:pt-10 md:pb-12` |
| Cabecera de sección | `text-center mb-10 md:mb-16` (título `mb-4`) |
| Grilla de tarjetas | `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6` |
| Footer | `border-t border-gray-800 bg-panel py-8 mt-12` |

### 3.4 Alineación responsive del hero

Texto centrado en móvil, a la izquierda en desktop: `text-center lg:text-left`; párrafo con `max-w-2xl mx-auto lg:mx-0`; botones `justify-center lg:justify-start`.

---

## 4. Componentes base

### 4.1 Botón primario (sólido)

```
font-outfit bg-viper hover:bg-viper-hover text-black w-full sm:w-auto px-8 py-4 rounded-xl font-bold text-lg transition-transform hover:scale-105 shadow-[0_0_20px_rgba(16,185,129,0.3)] cursor-pointer
```

### 4.2 Botón secundario (outline)

Grande (hero, menú móvil):
```
font-outfit bg-transparent border border-viper text-viper hover:bg-viper/20 w-full sm:w-auto px-8 py-4 rounded-xl font-bold text-lg transition-colors duration-300 transition-transform hover:scale-105
```
Compacto (navbar desktop):
```
font-outfit bg-transparent border border-viper text-viper hover:bg-viper/20 px-6 py-2 rounded-lg font-semibold transition-colors duration-300 transition-transform hover:scale-105 cursor-pointer
```
Menú móvil: `mt-8 w-full py-4 rounded-xl font-bold text-lg` (sin `hover:scale-105`).

### 4.3 Navbar

- Barra: `fixed w-full top-0 z-[60] bg-fondo/90 backdrop-blur-md border-b border-gray-800`; interior `h-20 flex items-center justify-between`.
- Logo: `flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer`; texto "VIPER" + `<span className="text-viper">|</span>`; subtítulo `hidden sm:block`.
- Links desktop: `hidden md:flex items-center gap-8 font-medium text-texto-suave`, cada uno `hover:text-viper transition-colors`.
- Hamburguesa: `md:hidden flex flex-col justify-center items-center w-8 h-8 gap-1.5 focus:outline-none`; barras `block w-6 h-[2px] bg-texto rounded-full` con `transition-transform duration-300 ease-in-out origin-center` (abierta: `rotate-45 translate-y-[8px]`, `-rotate-45 -translate-y-[8px]`, la del medio `opacity-0`).
- Overlay: `md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300` (+ `opacity-100 pointer-events-auto` / `opacity-0 pointer-events-none`).
- Panel lateral: `md:hidden fixed top-0 right-0 w-3/4 max-w-sm h-screen bg-panel/85 backdrop-blur-2xl border-l border-gray-800 z-50 transition-transform duration-300 ease-in-out flex flex-col pt-28 px-8 shadow-2xl` (+ `translate-x-0` / `translate-x-full`).
- Link del panel: `text-texto hover:text-viper text-xl font-medium transition-colors border-b border-gray-800 pb-4`.

- Link activo (ruta actual): mismo link con `text-viper` en lugar de `text-texto-suave` (desktop) o de `text-texto` (panel móvil).

### 4.3.1 Páginas informativas de módulo (vidriera pública)

- Contenedor: `max-w-7xl mx-auto px-6 pt-28 pb-12 lg:pt-36`.
- Cabecera: `text-center mb-10 md:mb-16`; `h1` = `font-outfit text-4xl lg:text-6xl font-bold mb-6 leading-tight text-balance` con la palabra clave en `text-viper`; bajada = `text-texto-suave text-lg lg:text-xl max-w-2xl mx-auto leading-relaxed`.
- Pasos: grilla `grid grid-cols-1 md:grid-cols-3 gap-6` de tarjetas (sección 4.4); número en contenedor `w-12 h-12 bg-fondo rounded-lg border border-gray-700 flex items-center justify-center mb-6` con `font-outfit text-xl font-bold text-viper`.
- Cierre: botón secundario grande (4.2) centrado: `flex justify-center mt-12`.

### 4.4 Tarjeta de módulo

```
bg-panel border border-gray-800 p-8 rounded-2xl hover:border-viper pointer-coarse:data-[activa=true]:border-viper transition-colors group [-webkit-tap-highlight-color:transparent]
```
- Contenedor de icono: `w-12 h-12 bg-fondo rounded-lg border border-gray-700 flex items-center justify-center mb-6 group-hover:bg-viper/10 group-hover:border-viper/50 pointer-coarse:group-data-[activa=true]:bg-viper/10 pointer-coarse:group-data-[activa=true]:border-viper/50 transition-colors`
- Icono (SVG 24×24, `stroke="currentColor"` `strokeWidth="2"`, redondeado): `text-viper group-hover:scale-110 pointer-coarse:group-data-[activa=true]:scale-110 transition-transform drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]`
- Título `mb-3`, descripción debajo.

### 4.5 Footer

`border-t border-gray-800 bg-panel py-8 mt-12`; interior `flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left`.

### 4.6 Componentes compartidos (`src/shared/components`)

Se importan desde `shared/components`; las pantallas no repiten estas clases. Todos usan solo tokens de la sección 1. Colores y patrones tomados de los diseños de Figma de los Módulos 1 y 3.

| Componente | Uso y props principales |
|---|---|
| `Button` | `variante`: `primario` (4.1), `secundario` (4.2), `neutro` (`bg-panel border border-gray-800`, para "Volver" / "Seguir editando"), `peligro` (`bg-error text-white`, sólido), `advertencia` (`bg-advertencia text-black`, sólido). `tamano`: `grande` / `compacto`. `cargando` muestra un spinner y deshabilita. |
| `Input` / `Select` | `w-full bg-fondo border rounded-lg px-4 py-3`; borde `border-gray-800`, en foco `border-viper`, con `error` `border-error`. `Select` recibe `opciones: [{ valor, texto }]`. |
| `FormField` | Etiqueta arriba (`font-medium`; con `requerido` suma un asterisco `text-viper`), campo, y debajo el error (`text-error text-sm`, `role="alert"`) o la ayuda (`text-texto-suave text-sm`). |
| `PasswordInput` | `Input` de contraseña con botón de ojo (`text-texto-suave hover:text-texto`) para mostrarla u ocultarla. Mismas props que `Input`. |
| `Alert` | Mensaje en recuadro: `border rounded-xl px-4 py-3` con fondo `/10` y borde `/50` del color. `variante`: `error`, `exito`, `advertencia`, `info`; `titulo` opcional. |
| `Modal` | Overlay `bg-black/60 backdrop-blur-sm z-[70]`, panel `bg-panel border border-gray-800 rounded-2xl`; se cierra con Escape, tocando afuera o con la X. |
| `ConfirmDialog` | `Modal` con círculo de ícono (`bg-advertencia/20` o `bg-error/20`), título, texto y botones: Cancelar (`neutro`) y Confirmar (`advertencia` o `peligro` según `tipo`; `variante` lo cambia, por ejemplo a `primario`). |
| `BottomSheet` | `Modal` que sube desde abajo en móvil (`rounded-t-2xl`) y se ve centrado desde `md`. |
| `Toast` (`ToastProvider` + `useToast`) | `mostrarToast(mensaje, 'exito' \| 'error' \| 'advertencia')`. Tarjeta `bg-panel` con borde `/50` del color e ícono, arriba a la derecha (`z-[80]`), desaparece a los 4 s. |
| `Table` | Tabla en `md+` (`bg-panel border border-gray-800 rounded-2xl`, encabezado `text-xs uppercase`); en móvil cada fila es una tarjeta (4.4). |
| `Badge` / `EstadoBadge` | Píldora sin borde `rounded-full px-3 py-0.5 text-sm font-medium` con fondo `/15` del color (`neutro`: `bg-texto-suave/20 text-texto-suave`). Variantes: `neutro`, `exito`, `advertencia`, `error`, `info`, `violeta`. `EstadoBadge` traduce los estados del sistema (`shared/utils/estados.js`): Planificado neutro, Inscripciones abiertas éxito, Inscripciones cerradas advertencia, En curso info, Finalizado violeta, Cancelado error. |
| `EmptyState` | Tarjeta con icono (patrón 4.4), título, descripción y acción opcional. |
| `Spinner` | Círculo con borde `border-current border-t-transparent animate-spin`; verde por defecto, `chico` hereda el color del botón. |
| `Tabs` | Pestañas con subrayado: activa `text-viper border-viper`, inactiva `text-texto-suave hover:text-viper`; scroll horizontal en móvil. |

### 4.7 Pantallas de acceso (registro, inicio de sesión)

Componentes propios de `features/privado/auth/components`, tomados de los diseños de Figma del CU 1.1.

- `AuthLayout`: fondo `bg-fondo` con glow `bg-viper opacity-15 blur-[100px]`; barra superior `border-b border-gray-800` con logo a la izquierda y una acción a la derecha (botón secundario compacto, 4.2); contenido en `max-w-7xl mx-auto px-6 pt-10 pb-12 md:pt-14`.
- Cabecera: `h1` `font-outfit text-4xl lg:text-5xl font-bold` con la palabra clave en `text-viper`; bajada `text-texto-suave text-lg max-w-2xl mx-auto`.
- Tarjeta del formulario: `bg-panel border border-gray-800 rounded-2xl p-6 md:p-10 max-w-3xl mx-auto`, con secciones separadas por `border-gray-800`. Título de sección: `text-xs font-semibold uppercase tracking-wide text-texto-suave`. Campos en grilla `grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5`.
- Botones del formulario: "Cancelar" (`neutro`) y la acción principal (`primario`, `flex-1`); en móvil la principal va arriba (`flex-col-reverse`).
- `RequisitosPassword`: lista dentro de `bg-fondo border border-gray-800 rounded-xl px-4 py-3`; cada requisito `text-sm`, `text-exito` si se cumple y `text-error` si no.
- Errores de formulario: `Alert` `error` arriba de la tarjeta con el motivo, más el mensaje bajo cada campo con problema.

---

## 5. Efectos y patrones visuales

| Patrón | Clases / valor |
|---|---|
| Glow ambiental detrás del hero | `absolute inset-0 bg-viper opacity-20 blur-[60px] lg:blur-[100px] rounded-full` |
| Glow de botón | `shadow-[0_0_20px_rgba(16,185,129,0.3)]` |
| Glow de icono | `drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]` |
| Vidrio (glassmorphism) | `backdrop-blur-md` (navbar), `backdrop-blur-sm` (overlay), `backdrop-blur-2xl` (panel) con fondo translúcido (`/90`, `/60`, `/85`) |
| Radios | `rounded-lg` (botón compacto, icono, campos), `rounded-xl` (botón grande, alertas, toasts), `rounded-2xl` (tarjeta, modal, tabla), `rounded-full` (glow, barras, badges, círculo de ícono) |
| Hover de acción | `hover:scale-105` (botones), `group-hover:scale-110` (iconos) |
| Hover de link | `hover:text-viper transition-colors` |
| Hover de tarjeta | `hover:border-viper` |
| Transiciones | `transition-colors`, `transition-transform`, `transition-opacity`; `duration-300` estándar; `duration-200` solo en la barra central del hamburguesa |
| Z-index | overlay `z-40`, panel `z-50`, navbar `z-[60]`, modal y panel inferior `z-[70]`, toast `z-[80]`, contenido sobre glow `z-10` |
| Táctil | Variante `pointer-coarse:` + `data-[activa=true]` para emular hover en móvil (tap en tarjeta) |

### 5.1 Reglas globales (en `src/index.css`, no repetir en componentes)

- `body`: fondo `--bg-color`, color `--text-main`, `font-family: var(--font-sans)`, `overflow-x: hidden`, `-webkit-tap-highlight-color: transparent`.
- `button, a`: `user-select: none`, `touch-action: manipulation`.

### 5.2 Animaciones (animejs v4, no Tailwind)

- Entrada de tarjetas (`.tarjeta-modulo`, parten con `opacity-0`): `y [50→0]`, `opacity [0→1]`, `stagger(150, { start: 400 })`, `duration 1000`, `ease 'outBack'`.
- Pelota hero (`HeroBall3D`): línea/nodos/anillos en `#10B981` y `#18181B`; entrada con `outExpo` / `outElastic(1, .6)`; giro 2D de 18 s por vuelta, anillo punteado 40 s.

---

## 6. Identidad de marca

- Marca: **VIPER** — subtítulo "Gestión Deportiva". Plataforma SaaS B2B2C (clubes de tenis y pádel + jugadores independientes), Córdoba, Argentina.
- Tono visual: oscuro, deportivo-tecnológico, un solo acento verde esmeralda.
- Idioma de la UI: español. Atributo `lang="es"`.
- Iconografía: SVG en línea, estilo outline (estilo Lucide/Feather), 24×24, `strokeWidth="2"`.
- Favicon: `/favicon.svg`. Meta PWA: `theme-color #09090B`.

---

## 7. Checklist antes de agregar clases

1. ¿El color es un token de la sección 1.1 (o un uso permitido de 1.2)?
2. ¿La fuente es Inter por defecto o `font-outfit` para título/botón?
3. ¿El contenedor usa `max-w-7xl mx-auto px-6`?
4. ¿Existe ya un patrón en la sección 4 o 5 que cubra el caso?
5. Si nada cubre el caso: agregarlo primero a este archivo, después usarlo.

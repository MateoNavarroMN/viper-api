import { useLayoutEffect, useRef } from 'react'
import { animate, createTimeline, createScope, stagger, svg, utils } from 'animejs'

// Hace que scale use el centro del propio elemento SVG
const origen = { transformBox: 'fill-box', transformOrigin: 'center' }

// ---------- Modo de giro automático (cambiá esta línea para alternar) ----------
//  '2d' → la pelota gira sola como un disco plano (no se recalcula nada por cuadro: liviano)
//         y pasa a 3D recién cuando el usuario la toca. Al soltarla vuelve a su posición y
//         retoma el giro 2D.
//  '3d' → la pelota gira sola en 3D todo el tiempo (la costura se recalcula en cada cuadro).
const GIRO_AUTOMATICO = '2d'

// ---------- Brillo difuminado (cambiá estas dos líneas para probar variantes) ----------
//  GLOW:    'fuerte' → halo grande e intenso · 'suave' → halo corto y tenue · 'sin' → sin brillo
//  GLOW_EN: 'todo'   → brillan la pelota y los nodos · 'nodos' → brillan solo los nodos
const GLOW = 'suave'
const GLOW_EN = 'todo'

// Ajuste fino de cada variante: desenfoque (tamaño del halo) e intensidad (0 a 1)
const GLOWS = {
  fuerte: { desenfoque: 18, intensidad: 1 },
  suave: { desenfoque: 5, intensidad: 0.5 },
}
const glowCfg = GLOWS[GLOW] // undefined cuando GLOW = 'sin'
const FILTRO = glowCfg ? 'url(#glow)' : undefined

// ---------- Ajustes ----------
const VEL_MAX = 14          // límite de velocidad al soltar (radianes por segundo)
const INERCIA_MS = 1800     // cuánto tarda en frenar el impulso después de soltar
const RETORNO_MS = 1400     // cuánto tarda en volver a la posición inicial (costuras centradas)
const GIRO_NORMAL = (2 * Math.PI) / 16 // giro automático: una vuelta cada 16 s
const EJE_NORMAL = [0.34, 0.94, 0]     // eje del giro automático (casi vertical, un poco inclinado)

// ---------- Geometría de la pelota ----------
const R = 100                 // radio en unidades del SVG
const CX = 200                // centro
const CY = 200
const K = 0.32                // 0 a 0.5: cuánto se curvan las costuras hacia el centro
const N = 180                 // puntos de la costura (más = más suave, más costoso)

// La costura de una pelota de tenis es una sola curva cerrada sobre la esfera:
//   x = (1-k)cos t + k cos 3t · y = (1-k)sin t - k sin 3t · z = 2√(k(1-k)) sin 2t
// Se calcula una sola vez y se rota 135° para que, de frente, se vean dos arcos enfrentados.
const COSTURA = (() => {
  const pts = new Float32Array((N + 1) * 3)
  const c = 2 * Math.sqrt(K * (1 - K))
  const rz = (135 * Math.PI) / 180
  const cz = Math.cos(rz)
  const sz = Math.sin(rz)
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2
    const x = (1 - K) * Math.cos(t) + K * Math.cos(3 * t)
    const y = (1 - K) * Math.sin(t) - K * Math.sin(3 * t)
    const z = c * Math.sin(2 * t)
    pts[i * 3] = x * cz - y * sz
    pts[i * 3 + 1] = x * sz + y * cz
    pts[i * 3 + 2] = z
  }
  return pts
})()

// ---------- Cuaterniones (la orientación se guarda así para que no se deforme con el tiempo) ----------
const qMul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
]
const qEje = (x, y, z, ang) => {
  const l = Math.hypot(x, y, z)
  if (!l) return [1, 0, 0, 0]
  const s = Math.sin(ang / 2) / l
  return [Math.cos(ang / 2), x * s, y * s, z * s]
}
const qNorm = (q) => {
  const l = Math.hypot(q[0], q[1], q[2], q[3])
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]
}

// Posición inicial: la pelota de frente, con las dos costuras centradas (como en el diseño original)
const ORIGEN = [1, 0, 0, 0]

// Interpolación entre dos orientaciones por el camino más corto (t de 0 a 1)
const qSlerp = (a, b, t) => {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
  if (dot < 0) {
    b = [-b[0], -b[1], -b[2], -b[3]]
    dot = -dot
  }
  if (dot > 0.9995) {
    return qNorm([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t])
  }
  const th = Math.acos(dot)
  const sn = Math.sin(th)
  const wa = Math.sin((1 - t) * th) / sn
  const wb = Math.sin(t * th) / sn
  return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb, a[3] * wa + b[3] * wb]
}

const f = (n) => n.toFixed(1)

// Proyecta la costura con la orientación q y devuelve solo el tramo que se ve de frente
// (lo que queda detrás de la esfera no se dibuja: la pelota es opaca).
// "progreso" (0 a 1) dibuja solo el primer tramo de la curva: sirve para la animación de entrada.
function trazoFrontal(q, progreso) {
  const [w, x, y, z] = q
  const m0 = 1 - 2 * (y * y + z * z), m1 = 2 * (x * y - z * w), m2 = 2 * (x * z + y * w)
  const m3 = 2 * (x * y + z * w), m4 = 1 - 2 * (x * x + z * z), m5 = 2 * (y * z - x * w)
  const m6 = 2 * (x * z - y * w), m7 = 2 * (y * z + x * w), m8 = 1 - 2 * (x * x + y * y)

  const iMax = Math.min(N, Math.floor(N * progreso))
  let d = ''
  let px = 0, py = 0, pz = 0
  let lado = false // true = el punto anterior estaba del lado de adelante (z >= 0)

  for (let i = 0; i <= iMax; i++) {
    const a = COSTURA[i * 3], b = COSTURA[i * 3 + 1], c = COSTURA[i * 3 + 2]
    const X = CX + R * (m0 * a + m1 * b + m2 * c)
    const Y = CY - R * (m3 * a + m4 * b + m5 * c)
    const Z = m6 * a + m7 * b + m8 * c
    const frente = Z >= 0

    if (i === 0) {
      if (frente) d += `M${f(X)} ${f(Y)}`
    } else if (frente && lado) {
      d += `L${f(X)} ${f(Y)}`
    } else if (frente !== lado) {
      // La curva cruza el borde de la esfera: se corta justo ahí para que el cambio sea limpio
      const s = pz / (pz - Z)
      const cx = px + (X - px) * s
      const cy = py + (Y - py) * s
      if (lado) d += `L${f(cx)} ${f(cy)}` // sale hacia atrás: se termina el trazo
      else d += `M${f(cx)} ${f(cy)}L${f(X)} ${f(Y)}` // vuelve a aparecer: empieza un trazo nuevo
    }
    lado = frente
    px = X; py = Y; pz = Z
  }
  return d
}

export default function HeroBall3D({ className = '' }) {
  const root = useRef(null)

  useLayoutEffect(() => {
    const svgEl = root.current
    const elCostura = svgEl.querySelector('.seam-front')
    const elGiro = svgEl.querySelector('.ball-spin')
    const modo2D = GIRO_AUTOMATICO === '2d'

    // La pelota nace de frente y con las costuras centradas
    let q = ORIGEN

    // Cuánto de la costura está dibujada (la animación de entrada lo lleva de 0 a 1)
    const intro = { seam: 0 }

    const dibujar = () => {
      elCostura.setAttribute('d', trazoFrontal(q, intro.seam))
    }

    dibujar() // estado inicial (costura vacía) antes del primer pintado

    let limpiar = () => { }

    const scope = createScope({ root }).add(() => {
      // Los nodos arrancan ocultos (antes del primer pintado)
      utils.set('.node', { scale: 0 })

      // ---------- Estado ----------
      const idle = { f: 0 }     // giro automático 3D activo (0 a 1). Solo se usa en modo '3d'
      const usr = { k: 0 }      // cuánto queda del impulso del usuario (1 a 0)
      const retorno = { t: 0 }  // progreso de la vuelta a la posición inicial (0 a 1)
      const rampa2D = { s: 1 }  // arranque suave del giro 2D después de la vuelta
      let velUsr = [0, 0, 0]    // velocidad angular del impulso (rad/s, ejes de pantalla)
      let idleAnim = null
      let inercia = null
      let retornoAnim = null
      let volviendo = false
      let qInicio = ORIGEN
      let arrastrando = false
      let interactuando = false // desde que el usuario la agarra hasta que termina de volver
      let giro2d = null
      let visible = true
      let activo3D = true       // true = la costura se recalcula en cada cuadro
      let raf = 0
      let tPrev = 0

      // ---------- Bucle de dibujo 3D ----------
      const cuadro = (ahora) => {
        const dt = Math.min((ahora - tPrev) / 1000, 0.05) // topado: evita saltos al volver a la pestaña
        tPrev = ahora

        if (volviendo) {
          q = qSlerp(qInicio, ORIGEN, retorno.t)
        } else if (!arrastrando) {
          const wx = EJE_NORMAL[0] * GIRO_NORMAL * idle.f + velUsr[0] * usr.k
          const wy = EJE_NORMAL[1] * GIRO_NORMAL * idle.f + velUsr[1] * usr.k
          const wz = EJE_NORMAL[2] * GIRO_NORMAL * idle.f + velUsr[2] * usr.k
          const ang = Math.hypot(wx, wy, wz) * dt
          if (ang > 1e-6) q = qNorm(qMul(qEje(wx, wy, wz, ang), q))
        }
        dibujar()
        raf = requestAnimationFrame(cuadro)
      }

      // El bucle solo corre si la pelota está en pantalla Y hay algo en 3D que recalcular
      const actualizarLoop = () => {
        const debeCorrer = visible && activo3D
        if (debeCorrer && !raf) {
          tPrev = performance.now()
          raf = requestAnimationFrame(cuadro)
        } else if (!debeCorrer && raf) {
          cancelAnimationFrame(raf)
          raf = 0
        }
      }

      // ---------- Giro 2D (modo '2d'): un disco plano que gira, sin recalcular nada ----------
      const iniciarGiro2D = (delay = 0, suave = false) => {
        if (giro2d) giro2d.cancel()
        elGiro.style.transform = 'none'
        giro2d = animate(elGiro, { rotate: [0, 360], duration: 18000, ease: 'linear', loop: true, delay })
        if (suave) {
          // Arranca despacio y acelera hasta la velocidad normal
          rampa2D.s = 0
          giro2d.speed = 0.02
          animate(rampa2D, {
            s: 1,
            duration: 1400,
            ease: 'inOutQuad',
            onUpdate: () => { giro2d.speed = Math.max(0.02, rampa2D.s) },
          })
        }
        if (!visible) giro2d.pause()
      }

      // Ángulo actual del giro 2D (radianes, sentido horario en pantalla)
      const anguloGiro2D = () => {
        const t = getComputedStyle(elGiro).transform
        if (!t || t === 'none') return 0
        const m = new DOMMatrixReadOnly(t)
        return Math.atan2(m.b, m.a)
      }

      // Pasa de 2D a 3D en el mismo instante en que el usuario la agarra, sin ningún salto visual
      const pasarA3D = () => {
        if (activo3D) return
        const ang = anguloGiro2D()
        if (giro2d) giro2d.pause()
        elGiro.style.transform = 'none'
        // Girar en el plano 'ang' en sentido horario equivale a girar -ang alrededor del eje que sale de la pantalla
        q = qNorm(qEje(0, 0, 1, -ang))
        activo3D = true
        dibujar()
        actualizarLoop()
      }

      // ---------- Entrada ----------
      createTimeline({ defaults: { ease: 'outExpo' } })
        .add(svg.createDrawable('.ring-outer'), { draw: ['0 0', '0 1'], duration: 1400 }, 0)
        .add('.ring-dashed', { opacity: [0, 1], scale: [0.8, 1], duration: 1400 }, 200)
        .add('.ball', { scale: [0.85, 1], duration: 1600, ease: 'outElastic(1, .6)' }, 300)
        .add(svg.createDrawable('.ball-outline'), { draw: ['0 0', '0 1'], duration: 1200, ease: 'inOutQuart' }, 300)
        // La costura se dibuja sola mientras la pelota ya está en 3D
        .add(intro, {
          seam: [0, 1],
          duration: 1300,
          ease: 'inOutQuart',
          onComplete: () => {
            intro.seam = 1
            dibujar()
            // Modo 2D: terminada la entrada, la costura queda fija y empieza a girar como disco plano
            if (modo2D && !interactuando) {
              activo3D = false
              actualizarLoop()
              iniciarGiro2D(300)
            }
          },
        }, 800)
        .add(svg.createDrawable('.link'), { draw: ['1 1', '0 1'], duration: 600, delay: stagger(120) }, 1400)
        .add('.node', { scale: [0, 1], duration: 900, ease: 'outElastic(1, .6)', delay: stagger(120) }, 2000)

      animate('.ring-dashed', { rotate: -360, duration: 40000, ease: 'linear', loop: true, delay: 1600 })

      // Modo 3D: el giro automático 3D arranca después de la entrada
      if (!modo2D) {
        idleAnim = animate(idle, { f: 1, duration: 1800, delay: 2400, ease: 'inOutQuad' })
      }

      // Solo se gasta batería mientras la pelota está en pantalla
      const observador = new IntersectionObserver(([entrada]) => {
        visible = entrada.isIntersecting
        actualizarLoop()
        if (giro2d && !activo3D) {
          if (visible) giro2d.play()
          else giro2d.pause()
        }
      })
      observador.observe(svgEl)

      // ---------- Interacción: arrastrar para girar la esfera en cualquier dirección ----------
      const el = svgEl.querySelector('.ball-user')
      let prevX = 0
      let prevY = 0
      let tMov = 0
      let escala = 1          // unidades del SVG por píxel de pantalla
      let vel = [0, 0, 0]     // velocidad angular medida (suavizada)

      const prevenirScroll = (e) => e.preventDefault()

      const alAgarrar = (e) => {
        interactuando = true
        arrastrando = true
        pasarA3D() // en modo 2D: desde acá se calcula en 3D
        el.setPointerCapture(e.pointerId)
        el.style.cursor = 'grabbing'

        // Bloquea el scroll de la página al tocar la pelota
        document.addEventListener('touchmove', prevenirScroll, { passive: false })

        if (idleAnim) idleAnim.pause()
        if (inercia) inercia.pause()
        if (retornoAnim) retornoAnim.pause()
        volviendo = false
        idle.f = 0
        usr.k = 0
        vel = [0, 0, 0]
        prevX = e.clientX
        prevY = e.clientY
        tMov = performance.now()
        escala = 400 / svgEl.getBoundingClientRect().width
      }

      const alMover = (e) => {
        if (!arrastrando) return
        const dx = (e.clientX - prevX) * escala
        const dy = (e.clientY - prevY) * escala
        prevX = e.clientX
        prevY = e.clientY
        const dist = Math.hypot(dx, dy)
        if (dist < 0.01) return

        // Como una bola rodando bajo el dedo: gira alrededor del eje perpendicular al movimiento
        // y el ángulo es la distancia recorrida dividida por el radio.
        q = qNorm(qMul(qEje(dy, dx, 0, dist / R), q))

        const t = performance.now()
        const dt = Math.max((t - tMov) / 1000, 0.004)
        tMov = t
        vel = [vel[0] * 0.7 + (dy / R / dt) * 0.3, vel[1] * 0.7 + (dx / R / dt) * 0.3, 0]
      }

      // Lleva la pelota suavemente a la posición inicial y recién ahí retoma el giro automático
      const volverAlOrigen = () => {
        usr.k = 0
        qInicio = q
        retorno.t = 0
        volviendo = true
        retornoAnim = animate(retorno, {
          t: 1,
          duration: RETORNO_MS,
          ease: 'inOutQuad',
          onComplete: () => {
            volviendo = false
            interactuando = false
            q = ORIGEN
            dibujar()
            if (modo2D) {
              // Vuelve a ser un disco plano: se deja de recalcular y retoma el giro 2D
              if (intro.seam >= 1) {
                activo3D = false
                actualizarLoop()
                iniciarGiro2D(0, true)
              }
            } else {
              idle.f = 0
              idleAnim = animate(idle, { f: 1, duration: 1500, ease: 'inOutQuad' })
            }
          },
        })
      }

      const alSoltar = () => {
        if (!arrastrando) return
        arrastrando = false
        el.style.cursor = 'grab'

        // Reactiva el scroll de la página
        document.removeEventListener('touchmove', prevenirScroll)

        // Si la dejó quieta un momento antes de soltar, no hay impulso
        if (performance.now() - tMov > 120) vel = [0, 0, 0]
        const mag = Math.hypot(vel[0], vel[1], vel[2])
        const lim = Math.min(1, VEL_MAX / (mag || 1))
        velUsr = [vel[0] * lim, vel[1] * lim, vel[2] * lim]

        // 1) El impulso se va frenando. 2) La pelota vuelve a su posición inicial (costuras centradas).
        // 3) Recién ahí vuelve el giro automático.
        if (mag > 0.3) {
          usr.k = 1
          inercia = animate(usr, { k: 0, duration: INERCIA_MS, ease: 'outQuad', onComplete: volverAlOrigen })
        } else {
          volverAlOrigen()
        }
      }

      el.addEventListener('pointerdown', alAgarrar)
      el.addEventListener('pointermove', alMover)
      el.addEventListener('pointerup', alSoltar)
      el.addEventListener('pointercancel', alSoltar)

      limpiar = () => {
        observador.disconnect()
        cancelAnimationFrame(raf)
        el.removeEventListener('pointerdown', alAgarrar)
        el.removeEventListener('pointermove', alMover)
        el.removeEventListener('pointerup', alSoltar)
        el.removeEventListener('pointercancel', alSoltar)

        // Limpieza del listener global
        document.removeEventListener('touchmove', prevenirScroll)
      }

      // Estado inicial del bucle: corre durante la entrada (la costura se dibuja en 3D)
      actualizarLoop()
    })

    return () => {
      limpiar()
      scope.revert()
    }
  }, [])

  return (
    <svg
      ref={root}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 24 400 320"
      fill="none"
      className={className}
      role="img"
      aria-label="Pelota de tenis Viper"
    >
      {glowCfg && (
        <defs>
          {/* Región amplia para que el halo no se corte en los bordes */}
          <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation={glowCfg.desenfoque} result="blur" />
            <feComponentTransfer in="blur" result="blurIntensidad">
              <feFuncA type="linear" slope={glowCfg.intensidad} />
            </feComponentTransfer>
            <feComposite in="SourceGraphic" in2="blurIntensidad" operator="over" />
          </filter>
        </defs>
      )}

      {/* Anillos tecnológicos de fondo */}
      <circle className="ring-dashed" style={origen} cx="200" cy="200" r="160" stroke="#18181B" strokeWidth="3" strokeDasharray="15 15" />
      <circle className="ring-outer" cx="200" cy="200" r="190" stroke="#18181B" strokeWidth="1" />

      {/* Pelota (brilla si GLOW_EN = 'todo') */}
      <g filter={GLOW_EN === 'todo' ? FILTRO : undefined}>
        <g className="ball-user" style={{ cursor: 'grab', touchAction: 'none' }}>
          {/* Área invisible para poder agarrar la pelota desde adentro */}
          <circle cx="200" cy="200" r="100" fill="none" pointerEvents="all" />
          {/* ball = escala de la entrada · ball-spin = giro 2D (modo '2d'), pivota en el centro del contorno */}
          <g className="ball" style={origen}>
            <g className="ball-spin" style={origen}>
              <circle className="ball-outline" cx="200" cy="200" r="100" stroke="#10B981" strokeWidth="8" />
              {/* Costura visible: el atributo d se calcula solo cuando hace falta (entrada, arrastre, vuelta) */}
              <path className="seam-front" d="" stroke="#10B981" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          </g>
        </g>
      </g>

      {/* Nodos con brillo (el orden coincide con el de los conectores de abajo) */}
      <g filter={FILTRO}>
        <circle className="node" style={origen} cx="200" cy="70" r="6" fill="#10B981" />
        <circle className="node" style={origen} cx="80" cy="260" r="7" fill="#10B981" />
      </g>

      {/* Nodo derecho (sin brillo) */}
      <circle className="node" style={origen} cx="330" cy="200" r="5" fill="#10B981" />

      {/* Líneas conectoras (mismo orden que los nodos: arriba, abajo-izquierda, derecha) */}
      <path className="link" d="M 200 70 L 200 100" stroke="#10B981" strokeWidth="2" opacity="0.5" />
      <path className="link" d="M 80 260 L 110.5 244.7" stroke="#10B981" strokeWidth="2" opacity="0.5" />
      <path className="link" d="M 330 200 L 300 200" stroke="#10B981" strokeWidth="2" opacity="0.5" />
    </svg>
  )
}
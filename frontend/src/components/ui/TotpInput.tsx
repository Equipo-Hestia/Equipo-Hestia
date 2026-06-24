import { useState, useRef, useEffect } from 'react'

// ---------------------------------------------------------------------------
// TotpInput — componente reutilizable de entrada de codigo TOTP con animacion
//
// Muestra 6 slots con las letras H*E*S*T*I*A como placeholder.
// Al escribir cada digito: pop animation -> se convierte en la letra.
// Al confirmar (boton o Enter): las letras vuelan al centro y explotan
// en el logo de Hestia.
//
// El padre DEBE:
//   1. Pasar animRef (useRef<(() => void) | null>(null))
//   2. Llamar animRef.current?.() desde el boton de confirmar
//   3. Recibir onConfirm() que se llama DENTRO de la animacion
//
// Props:
//   value      string  - valor actual del input (0-6 digitos)
//   onChange   (v: string) => void
//   onConfirm  () => void  - se llama al final de la animacion (hacer el fetch)
//   animRef    MutableRefObject<(() => void) | null>
//   disabled?  boolean
// ---------------------------------------------------------------------------

export const TOTP_LETTERS = ['H', 'E', 'S', 'T', 'I', 'A'] as const

const TOTP_ANIM_STYLE_ID = 'hestia-totp-anim'

export function ensureTotpStyle() {
  if (document.getElementById(TOTP_ANIM_STYLE_ID)) return
  const s = document.createElement('style')
  s.id = TOTP_ANIM_STYLE_ID
  s.textContent = `
    @keyframes h-digit-pop {
      0%   { opacity:0; transform:scale(0.55) translateY(6px); }
      65%  { opacity:1; transform:scale(1.07) translateY(-2px); }
      100% { opacity:1; transform:scale(1) translateY(0); }
    }
    @keyframes h-digit-exit {
      0%   { opacity:1; transform:scale(1); }
      100% { opacity:0; transform:scale(0.4) translateY(-4px); }
    }
    @keyframes h-letter-reveal {
      0%   { opacity:0; transform:scale(0.5) translateY(6px); }
      65%  { opacity:1; transform:scale(1.1) translateY(-2px); }
      100% { opacity:1; transform:scale(1) translateY(0); }
    }
    @keyframes h-logo-pop {
      0%   { opacity:0; transform:translate(-50%,-50%) scale(0.15); }
      55%  { opacity:1; transform:translate(-50%,-50%) scale(1.1); }
      100% { opacity:1; transform:translate(-50%,-50%) scale(1); }
    }
    @keyframes h-logo-fade { 0%{opacity:1} 100%{opacity:0} }
    .h-fly-letter {
      position: fixed;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: #3a4a5c;
      user-select: none;
      pointer-events: none;
      z-index: 9999;
      transform-origin: center center;
      will-change: transform, opacity;
    }
  `
  document.head.appendChild(s)
}

export interface TotpInputProps {
  value:     string
  onChange:  (v: string) => void
  onConfirm: () => void
  animRef:   React.MutableRefObject<(() => void) | null>
  disabled?: boolean
}

export function TotpInput({
  value, onChange, onConfirm, animRef, disabled = false,
}: TotpInputProps) {
  useEffect(() => { ensureTotpStyle() }, [])

  const wrapperRef  = useRef<HTMLDivElement>(null)
  const inputRef    = useRef<HTMLInputElement>(null)
  const digitRefs   = useRef<(HTMLSpanElement | null)[]>([])
  const letterRefs  = useRef<(HTMLSpanElement | null)[]>([])
  const prevValue   = useRef('')
  const isAnimating = useRef(false)

  const isComplete = value.length === 6

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80)
  }, [])

  function resetSlot(i: number) {
    const d = digitRefs.current[i]
    const l = letterRefs.current[i]
    if (d) {
      d.style.cssText = `position:absolute;font-size:26px;font-weight:700;
        font-family:monospace;color:#f1f5f9;opacity:0;`
      d.textContent = ''
    }
    if (l) {
      l.style.cssText = `position:absolute;font-size:22px;font-weight:700;
        letter-spacing:0.05em;color:#3a4a5c;opacity:0;user-select:none;`
    }
  }

  function animateIn(i: number, digit: string) {
    const d = digitRefs.current[i]
    const l = letterRefs.current[i]
    if (!d || !l) return
    resetSlot(i)
    d.textContent = digit
    void d.offsetWidth
    d.style.animation = 'h-digit-pop 0.22s cubic-bezier(0.34,1.56,0.64,1) forwards'
    setTimeout(() => {
      d.style.animation = 'h-digit-exit 0.2s ease forwards'
      setTimeout(() => {
        d.style.opacity = '0'
        void l.offsetWidth
        l.style.animation = 'h-letter-reveal 0.26s cubic-bezier(0.34,1.56,0.64,1) forwards'
      }, 180)
    }, 300)
  }

  useEffect(() => {
    const prev = prevValue.current
    const next = value
    if (next.length > prev.length) {
      for (let i = prev.length; i < next.length; i++) animateIn(i, next[i])
    } else if (next.length < prev.length) {
      for (let i = next.length; i < prev.length; i++) resetSlot(i)
    }
    prevValue.current = next
  }, [value])

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (isAnimating.current || disabled) return
    const v = e.target.value.replace(/\D/g, '').slice(0, 6)
    e.target.value = v
    onChange(v)
  }

  function runConfirmAnimation() {
    const wrapper = wrapperRef.current
    if (!wrapper || isAnimating.current || value.length < 6) return
    isAnimating.current = true

    const wRect  = wrapper.getBoundingClientRect()
    const destX  = wRect.left + wRect.width  / 2
    const destY  = wRect.top  + wRect.height / 2
    const TRAVEL  = 520
    const STAGGER = 55
    const flyEls: HTMLElement[] = []

    letterRefs.current.forEach((lEl, i) => {
      if (!lEl) return
      const lRect = lEl.getBoundingClientRect()
      const srcX  = lRect.left + lRect.width  / 2
      const srcY  = lRect.top  + lRect.height / 2
      lEl.style.opacity   = '0'
      lEl.style.animation = 'none'

      const fly = document.createElement('span')
      fly.className   = 'h-fly-letter'
      fly.textContent = TOTP_LETTERS[i]
      fly.style.left  = `${srcX}px`
      fly.style.top   = `${srcY}px`
      fly.style.transform = 'translate(-50%,-50%)'
      fly.style.opacity   = '1'
      document.body.appendChild(fly)
      flyEls.push(fly)

      const dx = destX - srcX
      const dy = destY - srcY
      setTimeout(() => {
        fly.style.transition = `
          transform ${TRAVEL}ms cubic-bezier(0.4,0,0.2,1),
          opacity   ${Math.round(TRAVEL * 0.28)}ms ease
            ${Math.round(TRAVEL * 0.72)}ms
        `
        fly.style.transform =
          `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.4)`
        fly.style.opacity = '0'
      }, i * STAGGER + 20)
    })

    const allArrived = 5 * STAGGER + TRAVEL + 130

    setTimeout(() => {
      flyEls.forEach(el => el.remove())

      const logoWrap = document.createElement('div')
      logoWrap.style.cssText = `
        position:absolute;left:50%;top:50%;
        transform:translate(-50%,-50%) scale(0);
        pointer-events:none;z-index:6;
        display:flex;align-items:center;justify-content:center;
      `
      const img = document.createElement('img')
      img.src   = '/logo_hestia_final_fondo.svg'
      img.alt   = 'Hestia'
      img.style.cssText = 'width:80px;height:80px;border-radius:50%;'
      logoWrap.appendChild(img)
      wrapper.appendChild(logoWrap)

      requestAnimationFrame(() => requestAnimationFrame(() => {
        logoWrap.style.animation =
          'h-logo-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards'
      }))

      // Llamar al callback del padre (hacer el fetch) despues del logo pop
      setTimeout(() => { onConfirm() }, 440)

    }, allArrived)
  }

  // Exponer la funcion al padre via ref
  useEffect(() => {
    animRef.current = runConfirmAnimation
  })

  const borderColor = isAnimating.current
    ? '#5dcaa5'
    : isComplete ? '#1d9e75' : '#2a3444'

  return (
    <div
      ref={wrapperRef}
      onClick={() => !isAnimating.current && inputRef.current?.focus()}
      style={{
        position: 'relative', width: '100%', height: '76px',
        borderRadius: '10px', background: '#1e2530',
        border: `1px solid ${borderColor}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', transition: 'border-color 0.3s', cursor: 'text',
      }}
    >
      <input
        ref={inputRef}
        type="text" inputMode="numeric" maxLength={6}
        autoComplete="one-time-code" value={value}
        onChange={handleInput}
        onKeyDown={e => {
          if (e.key === 'Enter' && isComplete && !isAnimating.current)
            runConfirmAnimation()
        }}
        aria-label="Codigo TOTP de 6 digitos"
        style={{
          position: 'absolute', inset: 0, opacity: 0, cursor: 'text',
          zIndex: 10, fontSize: '1px', background: 'transparent',
          border: 'none', outline: 'none', color: 'transparent',
          caretColor: 'transparent',
        }}
      />
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        pointerEvents: 'none', zIndex: 2,
      }}>
        {TOTP_LETTERS.map((letter, i) => (
          <div key={letter} style={{
            width: '40px', height: '52px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative',
          }}>
            <span
              ref={el => { digitRefs.current[i] = el }}
              style={{
                position: 'absolute', fontSize: '26px', fontWeight: 700,
                fontFamily: 'monospace', color: '#f1f5f9', opacity: 0,
              }}
            />
            <span
              ref={el => { letterRefs.current[i] = el }}
              style={{
                position: 'absolute', fontSize: '22px', fontWeight: 700,
                letterSpacing: '0.05em', color: '#3a4a5c', opacity: 0,
                userSelect: 'none',
              }}
            >
              {letter}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

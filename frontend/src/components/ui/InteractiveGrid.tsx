import { useEffect, useRef } from 'react'

export function InteractiveGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const wrapper = wrapperRef.current
    if (!canvas || !wrapper) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = wrapper.clientWidth
    let height = wrapper.clientHeight
    canvas.width = width
    canvas.height = height

    // --- PARÁMETROS AJUSTADOS ---
    const SPACING = 90 // Cuadros mucho más grandes
    const MOUSE_RADIUS = 150 // Área de interacción moderada
    const SPRING = 0.03 // Resorte suave
    const FRICTION = 0.90 // Flujo orgánico

    let points: { x: number, y: number, ox: number, oy: number, vx: number, vy: number }[] = []
    let mouse = { x: -1000, y: -1000 }

    const initGrid = () => {
      points = []
      const cols = Math.ceil(width / SPACING) + 1
      const rows = Math.ceil(height / SPACING) + 1
      
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          points.push({
            x: i * SPACING, y: j * SPACING,
            ox: i * SPACING, oy: j * SPACING,
            vx: 0, vy: 0
          })
        }
      }
    }

    initGrid()

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouse.x = e.clientX - rect.left
      mouse.y = e.clientY - rect.top
    }
    
    const handleMouseLeave = () => {
      mouse.x = -1000
      mouse.y = -1000
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseout', handleMouseLeave)
    
    const handleResize = () => {
      width = wrapper.clientWidth
      height = wrapper.clientHeight
      canvas.width = width
      canvas.height = height
      initGrid()
    }
    window.addEventListener('resize', handleResize)

    let animationFrameId: number
    
    const render = () => {
      ctx.clearRect(0, 0, width, height)
      
      const cols = Math.ceil(width / SPACING) + 1
      const rows = Math.ceil(height / SPACING) + 1
      
      const time = performance.now() * 0.001 

      points.forEach(p => {
        const dx = mouse.x - p.x
        const dy = mouse.y - p.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        // Interacción sutil: Empuje reducido a 0.8
        if (dist < MOUSE_RADIUS) {
          const force = (MOUSE_RADIUS - dist) / MOUSE_RADIUS
          p.vx -= (dx / dist) * force * 0.8 
          p.vy -= (dy / dist) * force * 0.8
        }

        // Efecto marea intacto
        const waveX = Math.sin(p.oy * 0.02 + time) * 4
        const waveY = Math.cos(p.ox * 0.02 + time * 0.8) * 4
        
        const targetX = p.ox + waveX
        const targetY = p.oy + waveY

        p.vx += (targetX - p.x) * SPRING
        p.vy += (targetY - p.y) * SPRING
        
        p.vx *= FRICTION
        p.vy *= FRICTION
        
        p.x += p.vx
        p.y += p.vy
      })

      ctx.lineWidth = 1

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const p = points[i * rows + j]
          if (!p) continue

          // Volvemos a los puntos pequeños (1.5)
          ctx.beginPath()
          ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(29, 158, 117, 0.4)' 
          ctx.fill()

          if (i < cols - 1) {
            const pRight = points[(i + 1) * rows + j]
            if (pRight) {
              ctx.beginPath()
              ctx.moveTo(p.x, p.y)
              ctx.lineTo(pRight.x, pRight.y)
              ctx.strokeStyle = 'rgba(42, 52, 68, 0.4)' 
              ctx.stroke()
            }
          }

          if (j < rows - 1) {
            const pBottom = points[i * rows + (j + 1)]
            if (pBottom) {
              ctx.beginPath()
              ctx.moveTo(p.x, p.y)
              ctx.lineTo(pBottom.x, pBottom.y)
              ctx.strokeStyle = 'rgba(42, 52, 68, 0.4)'
              ctx.stroke()
            }
          }
        }
      }

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseout', handleMouseLeave)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return (
    <div ref={wrapperRef} className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  )
}
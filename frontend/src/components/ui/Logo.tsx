// Componente Logo — usa /public/logo.png (PNG con fondo blanco).
// prop `light=true`: envuelve en contenedor blanco redondeado para fondos oscuros
// (sidebar, login). De esta forma el fondo blanco del PNG se integra visualmente
// en lugar de contrastar con el fondo oscuro.
// No usamos CSS filter (brightness/invert) porque con PNG de fondo blanco
// el filtro invierte TODO incluyendo el fondo, generando un recuadro negro.

export function Logo({ className = 'w-32 h-32'}) {
  const img = (
    <img
      src="/logo_hestia_circular.ico"
      alt="Hestia"
      className={className}
      draggable={false}
    />
  )

  return img
}

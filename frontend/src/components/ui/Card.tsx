interface CardProps {
  children: React.ReactNode
  className?: string
}

// Card base: fondo blanco, borde sutil, sombra ligera, esquinas redondeadas.
// Es el bloque de construccion principal de toda la UI.
export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>
      {children}
    </div>
  )
}

interface MetricCardProps {
  label: string
  value: number | string
  subtitle?: string
  icon: React.ReactNode
  iconBg?: string
  accent?: boolean
}

// MetricCard: muestra un KPI del dashboard (total insumos, alertas, etc.)
export function MetricCard({
  label, value, subtitle, icon, iconBg = 'bg-teal-50', accent = false
}: MetricCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-slate-500">{label}</span>
        <div className={`${iconBg} p-2 rounded-lg`}>{icon}</div>
      </div>
      <p className={`text-3xl font-bold ${
        accent ? 'text-rose-600' : 'text-slate-900'
      }`}>
        {value}
      </p>
      {subtitle && (
        <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
      )}
    </Card>
  )
}

interface CardProps {
  children: React.ReactNode
  className?: string
}

// Card base: usa tokens Hestia — fondo surface, borde subtle.
export function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={`bg-h-surface rounded-xl border border-h-subtle ${className}`}
    >
      {children}
    </div>
  )
}

interface MetricCardProps {
  label:     string
  value:     number | string
  subtitle?: string
  icon:      React.ReactNode
  iconBg?:   string
  accent?:   boolean
}

// MetricCard: KPI del dashboard. Icono en bg semántico, valor en text-h-primary.
export function MetricCard({
  label, value, subtitle, icon,
  iconBg = 'bg-h-teal-subtle',
  accent = false,
}: MetricCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] font-medium text-h-secondary">{label}</span>
        <div className={`${iconBg} p-2 rounded-lg`}>{icon}</div>
      </div>
      <p
        className="text-3xl font-bold"
        style={{ color: accent ? 'var(--h-sem-danger-text)' : 'var(--h-text-primary)' }}
      >
        {value}
      </p>
      {subtitle && (
        <p className="text-xs text-h-tertiary mt-1">{subtitle}</p>
      )}
    </Card>
  )
}

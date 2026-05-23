interface BadgeProps {
  variant?: 'default' | 'warning' | 'danger' | 'success' | 'info'
  children: React.ReactNode
}

const variants = {
  default: 'bg-slate-100 text-slate-600',
  warning: 'bg-amber-50 text-amber-700 border border-amber-200',
  danger:  'bg-rose-50 text-rose-700 border border-rose-200',
  success: 'bg-teal-50 text-teal-700 border border-teal-200',
  info:    'bg-blue-50 text-blue-700 border border-blue-200',
}

export function Badge({ variant = 'default', children }: BadgeProps) {
  return (
    <span className={`
      inline-flex items-center px-2.5 py-0.5
      rounded-full text-xs font-semibold
      ${variants[variant]}
    `}>
      {children}
    </span>
  )
}

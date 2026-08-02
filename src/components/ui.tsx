import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export function Panel({
  children,
  className,
  title,
  aside,
}: {
  children: ReactNode
  className?: string
  title?: ReactNode
  aside?: ReactNode
}) {
  return (
    <section
      className={cn(
        'rounded-xl border border-white/8 bg-white/[0.025] backdrop-blur-sm',
        className,
      )}
    >
      {(title || aside) && (
        <header className="flex items-baseline justify-between gap-3 border-b border-white/6 px-4 py-2.5">
          <h2 className="font-display text-[0.7rem] font-semibold tracking-[0.14em] text-white/55 uppercase">
            {title}
          </h2>
          {aside}
        </header>
      )}
      {children}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'danger'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-white/90 text-void-950 hover:bg-white disabled:bg-white/20 disabled:text-white/40',
  ghost:
    'bg-white/6 text-white/85 hover:bg-white/12 disabled:bg-white/3 disabled:text-white/25',
  outline:
    'border border-white/15 text-white/80 hover:border-white/35 hover:text-white disabled:border-white/6 disabled:text-white/25',
  danger:
    'border border-red-400/30 text-red-200/90 hover:border-red-400/60 hover:bg-red-500/10 disabled:opacity-40',
}

export function Button({
  variant = 'ghost',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={cn(
        'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60',
        'disabled:cursor-not-allowed',
        VARIANTS[variant],
        className,
      )}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

export function ProgressBar({
  value,
  color = 'rgba(255,255,255,0.7)',
  className,
  label,
}: {
  value: number
  color?: string
  className?: string
  label?: string
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div
      className={cn('h-1 overflow-hidden rounded-full bg-white/8', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full rounded-full transition-[width] duration-200 ease-out"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({
  children,
  onClose,
  labelledBy,
  wide,
}: {
  children: ReactNode
  /** Omit to make the dialog non-dismissable — used for forced choices. */
  onClose?: () => void
  labelledBy?: string
  wide?: boolean
}) {
  useEffect(() => {
    if (!onClose) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-void-950/85 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          'animate-rise relative max-h-[88vh] w-full overflow-y-auto rounded-2xl',
          'border border-white/10 bg-void-900/95 shadow-2xl shadow-black/60',
          wide ? 'max-w-3xl' : 'max-w-lg',
        )}
      >
        {children}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export function Tag({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span
      className="rounded-md px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wide uppercase"
      style={{
        color: color ?? 'rgba(255,255,255,0.6)',
        background: color ? `color-mix(in oklab, ${color} 14%, transparent)` : 'rgba(255,255,255,0.06)',
      }}
    >
      {children}
    </span>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="px-4 py-8 text-center text-sm text-balance text-white/35">{children}</p>
  )
}

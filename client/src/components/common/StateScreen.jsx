/** Centered full-area state (loading, empty, error) — never a blank screen. */
export function StateScreen({ icon: Icon, title, description, action, children, className = '' }) {
  return (
    <div className={`flex h-full flex-col items-center justify-center gap-3 px-8 text-center ${className}`}>
      {Icon && (
        <span className="mb-1 flex size-16 items-center justify-center rounded-3xl bg-accent-soft text-accent">
          <Icon size={28} />
        </span>
      )}
      {title && <h2 className="text-lg font-semibold text-balance">{title}</h2>}
      {description && <p className="max-w-xs text-sm text-pretty text-muted">{description}</p>}
      {children}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent shadow-soft transition hover:bg-accent-strong active:scale-95"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

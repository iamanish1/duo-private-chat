import { forwardRef } from 'react';

const VARIANTS = {
  ghost: 'text-ink hover:bg-surface-2 active:bg-surface-2',
  muted: 'text-muted hover:bg-surface-2 hover:text-ink active:bg-surface-2',
  accent: 'bg-accent text-on-accent shadow-soft hover:bg-accent-strong active:scale-95',
  soft: 'bg-surface-2 text-ink hover:brightness-95 active:scale-95',
  danger: 'bg-danger text-white hover:brightness-110 active:scale-95',
  glass: 'bg-white/15 text-white backdrop-blur-md hover:bg-white/25 active:scale-95',
  'glass-active': 'bg-white text-neutral-900 hover:bg-white/90 active:scale-95',
};

const SIZES = { sm: 'size-9', md: 'size-11', lg: 'size-14', xl: 'size-16' };

/** Round icon button with a ≥44px touch target and a required accessible label. */
export const IconButton = forwardRef(function IconButton(
  { label, variant = 'ghost', size = 'md', className = '', children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center justify-center rounded-full transition duration-150 disabled:opacity-40 ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});

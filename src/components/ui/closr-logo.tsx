/**
 * Closr wordmark logo — CLOS in base color + R in accent red.
 * Adapts to dark/light contexts via the `variant` prop.
 */
export function ClosrLogo({
  size = 'md',
  variant = 'dark',
  className = '',
}: {
  /** sm=text-sm, md=text-lg, lg=text-2xl, xl=text-4xl */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** dark = CLOS white on dark bg, light = CLOS black on light bg */
  variant?: 'dark' | 'light';
  className?: string;
}) {
  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-2xl',
    xl: 'text-4xl',
  };

  const baseColor = variant === 'dark' ? 'text-white' : 'text-foreground';

  return (
    <span className={`inline-flex items-baseline font-extrabold tracking-tight ${sizeClasses[size]} ${className}`} style={{ fontFamily: 'var(--font-montserrat), Montserrat, sans-serif' }}>
      <span className={baseColor}>CLOS</span>
      <span className="text-accent">R</span>
    </span>
  );
}

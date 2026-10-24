export interface BadgeStatusProps {
  variant: "success" | "warning" | "danger" | "info" | "neutral";
  children: React.ReactNode;
}

const variantClass: Record<BadgeStatusProps["variant"], string> = {
  success: "badge badge-success",
  warning: "badge badge-warning",
  danger: "badge badge-danger",
  info: "badge badge-info",
  neutral: "badge badge-neutral",
};

export function BadgeStatus({ variant, children }: BadgeStatusProps) {
  return <span className={variantClass[variant]}>{children}</span>;
}

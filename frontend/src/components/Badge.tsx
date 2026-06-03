import type { ReactNode } from "react";

export type BadgeVariant =
  | "new"
  | "logged"
  | "warning"
  | "active"
  | "inactive";

interface BadgeProps {
  variant: BadgeVariant;
  children: ReactNode;
}

export default function Badge({ variant, children }: BadgeProps) {
  return <span className={`badge badge--${variant}`}>{children}</span>;
}

import type { ReactNode } from "react";

export function Card({
  title,
  children,
  footer,
}: {
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="gc-card">
      {title && <header>{title}</header>}
      <div>{children}</div>
      {footer && <footer>{footer}</footer>}
    </section>
  );
}

import type { ReactNode } from "react";

type ReassuranceCardProps = {
  icon: ReactNode;
  title: string;
  children: ReactNode;
};

export function ReassuranceCard({ icon, title, children }: ReassuranceCardProps) {
  return (
    <aside className="reassurance-card" data-reassurance-card>
      <div className="reassurance-card__icon" aria-hidden="true">
        {icon}
      </div>
      <div className="reassurance-card__body">
        <h2 className="reassurance-card__title">{title}</h2>
        <p className="reassurance-card__copy">{children}</p>
      </div>
    </aside>
  );
}

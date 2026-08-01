import { ConnectivityNotice } from "@/app/connectivity-notice";
import { Brand } from "./Brand";

export function AuthenticatedShell({
  children,
  settings,
}: {
  children: React.ReactNode;
  settings: React.ReactNode;
}) {
  return (
    <div className="authenticated-shell" data-authenticated-shell>
      <header className="authenticated-shell__header">
        <div className="authenticated-shell__brand-row">
          <Brand />
          <span className="authenticated-shell__private">
            <span aria-hidden="true">●</span>
            <span>Privado</span>
          </span>
        </div>
        <div className="authenticated-shell__title-row">
          <div>
            <p className="authenticated-shell__eyebrow">Combinado / Casa</p>
            <h1>Hoje</h1>
          </div>
          {settings}
        </div>
        <ConnectivityNotice />
      </header>
      <div className="authenticated-shell__content">{children}</div>
    </div>
  );
}

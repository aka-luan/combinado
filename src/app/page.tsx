import { ConnectivityNotice } from "./connectivity-notice";
import { AuthGate } from "@/components/auth/AuthGate";
import { SettingsPanel } from "@/components/settings/SettingsPanel";

export default function Home() {
  const appEnv = process.env.NEXT_PUBLIC_APP_ENV;

  return (
    <main>
      <h1>Combinado</h1>
      {appEnv !== "production" && <p data-app-env={appEnv}>Ambiente: {appEnv}</p>}
      <ConnectivityNotice />
      <AuthGate>
        <p>Casca do aplicativo publicada.</p>
        <SettingsPanel />
      </AuthGate>
    </main>
  );
}

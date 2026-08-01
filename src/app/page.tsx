import { AuthGate } from "@/components/auth/AuthGate";
import { HouseholdHome } from "@/components/household/HouseholdHome";
import { PushLifecycle } from "@/components/push/PushLifecycle";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { AuthenticatedShell } from "@/components/shell/AuthenticatedShell";

export default function Home() {
  const appEnv = process.env.NEXT_PUBLIC_APP_ENV;

  return (
    <main>
      {appEnv && appEnv !== "production" ? <p data-app-env={appEnv}>Ambiente: {appEnv}</p> : null}
      <AuthGate>
        <AuthenticatedShell settings={<SettingsPanel />}>
          <PushLifecycle />
          <HouseholdHome />
        </AuthenticatedShell>
      </AuthGate>
    </main>
  );
}

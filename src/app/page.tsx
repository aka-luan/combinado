import { ConnectivityNotice } from "./connectivity-notice";

export default function Home() {
  const appEnv = process.env.NEXT_PUBLIC_APP_ENV;

  return (
    <main>
      <h1>Combinado</h1>
      <p>Casca do aplicativo publicada.</p>
      {appEnv !== "production" && <p data-app-env={appEnv}>Ambiente: {appEnv}</p>}
      <ConnectivityNotice />
    </main>
  );
}

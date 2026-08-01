import type { SupabaseClient } from "@supabase/supabase-js";
import { BrandMark } from "@/components/brand/BrandMark";
import { IconLock, IconShieldCheck } from "@/components/ui/icons";
import { ReassuranceCard } from "./ReassuranceCard";
import { LoginFlow } from "./LoginFlow";

/**
 * Branded login chrome. Editorial raster for `data-login-illustration` is
 * wired separately — keep the empty slot so layout matches the mockup.
 */
export function LoginScreen({ client }: { client: SupabaseClient }) {
  return (
    <div data-login-screen className="login-screen">
      <header className="login-screen__brand">
        <BrandMark className="login-screen__mark" />
        <h1 className="login-screen__wordmark">Combinado</h1>
        <p className="login-screen__tagline">Acordos que viram rotina</p>
        <p className="login-screen__promise">
          Coordenação da Casa para dois Adultos.{" "}
          <strong>Um só Registro.</strong>
        </p>
      </header>

      <ReassuranceCard icon={<IconLock />} title="Privado e só nosso">
        Acesso por código enviado para o seu e-mail.
      </ReassuranceCard>

      <LoginFlow client={client} />

      <div className="login-screen__divider" role="separator" aria-label="Como funciona?">
        <span>Como funciona?</span>
      </div>

      <figure
        className="login-screen__illustration"
        data-login-illustration
        aria-hidden="true"
      >
        {/* Raster asset (16:9 editorial interior) wired later. */}
      </figure>

      <ReassuranceCard icon={<IconShieldCheck />} title="Segurança e privacidade">
        O Registro fica na nuvem da Casa, sincronizado entre os dois Adultos.
        Neste aparelho há só um cache de leitura offline.
      </ReassuranceCard>
    </div>
  );
}

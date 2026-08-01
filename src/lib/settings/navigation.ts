export type SettingsScreen =
  | "adults"
  | "children"
  | "household-state"
  | "routines"
  | "medications"
  | "events"
  | "notifications";

export type SettingsLocation =
  | { kind: "closed" }
  | { kind: "index" }
  | { kind: "screen"; screen: SettingsScreen };

export type SettingsGroup = {
  label: "Casa" | "Planejamento" | "Aplicativo";
  items: Array<{ id: SettingsScreen; label: string; description: string }>;
};

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    label: "Casa",
    items: [
      {
        id: "adults",
        label: "Adultos",
        description: "Permissões iguais e autoria do Registro.",
      },
      {
        id: "children",
        label: "Crianças",
        description: "Pessoas vinculadas à Casa.",
      },
      {
        id: "household-state",
        label: "Estado da Casa",
        description: "Sincronização, backup, limites e privacidade.",
      },
    ],
  },
  {
    label: "Planejamento",
    items: [
      {
        id: "routines",
        label: "Rotinas semanais",
        description: "Compromissos que se repetem por dia da semana.",
      },
      {
        id: "medications",
        label: "Medicamentos",
        description: "Doses programadas e seu Registro.",
      },
      {
        id: "events",
        label: "Eventos avulsos",
        description: "Compromissos de uma data específica.",
      },
    ],
  },
  {
    label: "Aplicativo",
    items: [
      {
        id: "notifications",
        label: "Notificações",
        description: "Estado e reparo das notificações push.",
      },
    ],
  },
];

const SETTINGS_SCREENS = new Set<SettingsScreen>(
  SETTINGS_GROUPS.flatMap((group) => group.items.map((item) => item.id)),
);

export function parseSettingsHash(hash: string): SettingsLocation {
  if (hash === "#configuracoes") return { kind: "index" };
  const prefix = "#configuracoes/";
  if (hash.startsWith(prefix)) {
    const screen = hash.slice(prefix.length) as SettingsScreen;
    if (SETTINGS_SCREENS.has(screen)) return { kind: "screen", screen };
  }
  return { kind: "closed" };
}

export function settingsHash(location: SettingsLocation): string {
  if (location.kind === "closed") return "";
  if (location.kind === "index") return "#configuracoes";
  return `#configuracoes/${location.screen}`;
}

export function settingsScreenLabel(screen: SettingsScreen): string {
  for (const group of SETTINGS_GROUPS) {
    const item = group.items.find((candidate) => candidate.id === screen);
    if (item) return item.label;
  }
  return "Configurações";
}

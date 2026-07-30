/**
 * iOS Safari only exposes Web Push for PWAs added to the Home Screen
 * (`navigator.standalone`). Other browsers use `display-mode: standalone`.
 */
export type InstallProbe = {
  standalone?: boolean;
  matchMedia?: (query: string) => { matches: boolean };
};

export function isInstalledPwa(probe: InstallProbe): boolean {
  if (probe.standalone === true) return true;
  if (probe.matchMedia?.("(display-mode: standalone)").matches) return true;
  if (probe.matchMedia?.("(display-mode: fullscreen)").matches) return true;
  return false;
}

export function readInstallProbe(
  win: Window & { navigator: Navigator & { standalone?: boolean } } = window,
): InstallProbe {
  return {
    standalone: win.navigator.standalone,
    matchMedia: (query) => win.matchMedia(query),
  };
}

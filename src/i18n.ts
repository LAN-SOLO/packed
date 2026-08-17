/** Minimal UI strings (de/en) for the app shell — grows with the real UI. */
const de = {
  subtitle: 'Archive öffnen, erstellen, extrem komprimieren',
  statusTitle: 'Alpha-Grundgerüst',
  statusText:
    'Das ist das App-Grundgerüst von packed: Der Rust-Core (Formaterkennung, ' +
    'Erstellen, Öffnen, Entpacken) steht — die Oberfläche entsteht gerade. ' +
    'Updates kommen ab jetzt signiert direkt in die App.',
  checkForUpdates: 'Nach Updates suchen',
  updateChecking: 'Prüfe …',
  upToDate: 'packed ist aktuell.',
  updateAvailable: (v: string) => `Update auf ${v} verfügbar`,
  updateNow: 'Jetzt aktualisieren',
  updateLater: 'Später',
  updateModalTitle: (v: string) => `Update auf Version ${v}`,
  publishedOn: (d: string) => `Veröffentlicht am ${d}`,
  changelogTitle: 'Was ist neu',
  noChangelog: 'Für dieses Update liegen keine Änderungsnotizen vor.',
  updateSafeNote:
    'Das Update ersetzt nur die App selbst (signiert & verifiziert) — Ihre Dateien und Einstellungen bleiben unangetastet.',
  updateInstalling: 'Update wird installiert — die App startet gleich neu …',
  updateFailed: 'Update fehlgeschlagen',
};

const en: typeof de = {
  subtitle: 'Open, create and hard-compress archives',
  statusTitle: 'Alpha shell',
  statusText:
    'This is the packed app shell: the Rust core (format detection, create, ' +
    'open, extract) is in place — the interface is being built. From now on, ' +
    'updates arrive signed, directly in the app.',
  checkForUpdates: 'Check for updates',
  updateChecking: 'Checking …',
  upToDate: 'packed is up to date.',
  updateAvailable: (v: string) => `Update to ${v} available`,
  updateNow: 'Update now',
  updateLater: 'Later',
  updateModalTitle: (v: string) => `Update to version ${v}`,
  publishedOn: (d: string) => `Published on ${d}`,
  changelogTitle: "What's new",
  noChangelog: 'No release notes are available for this update.',
  updateSafeNote:
    'The update replaces only the app itself (signed & verified) — your files and settings stay untouched.',
  updateInstalling: 'Installing update — the app will restart shortly …',
  updateFailed: 'Update failed',
};

export const t = navigator.language.toLowerCase().startsWith('de') ? de : en;

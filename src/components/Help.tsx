import { useState } from 'react';

// Selbstständiges Hilfe-System: schwebender ?-Button, First-Run-Tutorial
// und durchsuchbares Handbuch. Sprache folgt wie i18n.ts der Systemsprache.

interface Step {
  title: string;
  body: string[];
}

interface Section {
  id: string;
  title: string;
  body: string[];
}

interface Content {
  labels: {
    fab: string;
    tutorial: string;
    manual: string;
    search: string;
    next: string;
    back: string;
    skip: string;
    done: string;
    stepOf: (n: number, total: number) => string;
    noResults: string;
  };
  tutorial: Step[];
  sections: Section[];
}

const de: Content = {
  labels: {
    fab: 'Hilfe & Handbuch',
    tutorial: 'Tutorial',
    manual: 'Handbuch',
    search: 'Handbuch durchsuchen …',
    next: 'Weiter',
    back: 'Zurück',
    skip: 'Überspringen',
    done: 'Los geht’s',
    stepOf: (n, total) => `Schritt ${n} von ${total}`,
    noResults: 'Keine Treffer',
  },
  tutorial: [
    {
      title: 'Willkommen bei packed.',
      body: [
        'packed wird ein Archiv-Tool für alles: ZIP, 7z, TAR und die modernen Formate öffnen und erstellen — RAR wird gelesen.',
        'Du hast gerade die Beta installiert. Sie ist bewusst schlank: das Grundgerüst mit signierten In-App-Updates.',
        'Dieses Tutorial dauert eine halbe Minute. Du findest es jederzeit wieder über den ?-Knopf unten rechts.',
      ],
    },
    {
      title: 'So funktioniert die Beta',
      body: [
        'Der Rust-Core (ZIP inkl. AES-256, TAR, gzip, bzip2, xz, zstd) steht bereits — die Archiv-Oberfläche kommt Stück für Stück per Update.',
        'Jedes Update bringt sein Changelog mit: Du siehst vor der Installation, was sich ändert, und entscheidest selbst.',
        'Kein Update installiert sich ungefragt.',
      ],
    },
    {
      title: 'Updates',
      body: [
        'packed prüft beim Start automatisch, ob eine neue Version bereitliegt, und öffnet dann den Changelog-Dialog.',
        'Manuell geht es jederzeit über „Nach Updates suchen“ im Hauptfenster.',
        'Updates kommen signiert von GitHub — die App prüft die Signatur, bevor irgendetwas installiert wird.',
      ],
    },
    {
      title: 'Was als Nächstes kommt',
      body: [
        '• Archive öffnen: ZIP, 7z, TAR, gzip, bzip2, xz, zstd — und RAR entpacken',
        '• Archive erstellen: offene Formate mit wählbarem Kompressionsgrad',
        '• AES-256-Verschlüsselung und passwortgeschützte Archive',
        'Einfach installiert lassen — die Funktionen ziehen als Updates ein, jeweils mit Changelog vorab.',
      ],
    },
  ],
  sections: [
    {
      id: 'status',
      title: 'Aktueller Stand (Beta)',
      body: [
        'Diese Beta ist das Grundgerüst von packed: eine schlanke, native App mit signiertem In-App-Updater.',
        'Der Rust-Core mit den Formaten ZIP (inkl. AES-256), TAR, gzip, bzip2, xz und zstd ist fertig entwickelt und getestet — die Archiv-Oberfläche (Öffnen, Erstellen, Vorschau) kommt Stück für Stück als Update.',
        'Warum so? Damit du heute installierst und die Funktionen automatisch bei dir ankommen, sobald sie fertig sind — ohne erneuten Download von Hand.',
      ],
    },
    {
      id: 'updates',
      title: 'Updates',
      body: [
        'packed prüft bei jedem Start automatisch auf neue Versionen. Liegt eine bereit, öffnet sich der Update-Dialog mit dem Changelog — installiert wird erst nach deinem Klick.',
        'Manuell prüfen: der Knopf „Nach Updates suchen“ im Hauptfenster.',
        'Sicherheit: Updates kommen von GitHub (LAN-SOLO/packed) und sind kryptografisch signiert. Die App prüft die Signatur vor jeder Installation — ein manipuliertes Update wird abgelehnt.',
        'Deine Einstellungen bleiben bei Updates erhalten.',
      ],
    },
    {
      id: 'roadmap',
      title: 'Geplante Funktionen',
      body: [
        'Für Version 1.0 geplant — in dieser Reihenfolge ziehen die Funktionen als Updates ein:',
        '• Öffnen & Entpacken — ZIP, 7z, TAR, gzip, bzip2, xz, zstd, lz4 und RAR, mit Vorschau des Inhalts und Herausziehen einzelner Dateien',
        '• Erstellen — ZIP (mit AES-256), 7z, TAR und moderne Container, mit Format und Kompressionsgrad direkt beim Packen',
        '• Extreme Kompression — zstd, LZMA2 und Brotli mit einem Regler von „schnell“ bis „maximal“',
        '• Verschlüsselung — AES-256 beim Erstellen, passwortgeschützte Archive öffnen',
        'Später mit packed pro: Stapelverarbeitung, eigene Presets, Mehrfach-Archive (Splits) und Passwort-Wiederherstellung für eigene Archive.',
        'Ehrlich dazu: RAR erstellen kann kein Tool — das Format ist proprietär. packed entpackt RAR und erstellt offene Formate.',
      ],
    },
    {
      id: 'pricing',
      title: 'Free & pro',
      body: [
        'packed Free bleibt kostenlos — dauerhaft und ohne Haken: öffnen, erstellen, komprimieren, verschlüsseln.',
        'packed pro (12 € im Jahr, also 1 € im Monat) kommt später dazu — für Vielpacker: Stapelverarbeitung, Presets, Splits und Passwort-Wiederherstellung.',
      ],
    },
    {
      id: 'privacy',
      title: 'Privatsphäre',
      body: [
        'packed rechnet lokal auf deinem Gerät: keine Cloud, kein Konto, keine Telemetrie.',
        'Die einzige Netzwerkverbindung ist der Update-Check gegen GitHub.',
      ],
    },
  ],
};

const en: Content = {
  labels: {
    fab: 'Help & manual',
    tutorial: 'Tutorial',
    manual: 'Manual',
    search: 'Search the manual …',
    next: 'Next',
    back: 'Back',
    skip: 'Skip',
    done: 'Let’s go',
    stepOf: (n, total) => `Step ${n} of ${total}`,
    noResults: 'No matches',
  },
  tutorial: [
    {
      title: 'Welcome to packed.',
      body: [
        'packed is becoming one archive tool for everything: open and create ZIP, 7z, TAR and the modern formats — RAR is read.',
        'You just installed the beta. It is deliberately lean: the foundation with signed in-app updates.',
        'This tutorial takes half a minute. Reopen it anytime via the ? button in the bottom right.',
      ],
    },
    {
      title: 'How the beta works',
      body: [
        'The Rust core (ZIP incl. AES-256, TAR, gzip, bzip2, xz, zstd) is already in place — the archive interface lands piece by piece as updates.',
        'Every update brings its changelog: you see what changes before installing, and you decide.',
        'No update ever installs without asking.',
      ],
    },
    {
      title: 'Updates',
      body: [
        'packed checks for a new version on every launch and opens the changelog dialog when one is available.',
        'You can also check manually anytime via “Check for updates” in the main window.',
        'Updates come signed from GitHub — the app verifies the signature before installing anything.',
      ],
    },
    {
      title: 'What lands next',
      body: [
        '• Opening archives: ZIP, 7z, TAR, gzip, bzip2, xz, zstd — and extracting RAR',
        '• Creating archives: open formats with selectable compression level',
        '• AES-256 encryption and password-protected archives',
        'Just keep it installed — features arrive as updates, each with the changelog up front.',
      ],
    },
  ],
  sections: [
    {
      id: 'status',
      title: 'Current state (beta)',
      body: [
        'This beta is packed’s foundation: a lean, native app with a signed in-app updater.',
        'The Rust core with ZIP (incl. AES-256), TAR, gzip, bzip2, xz and zstd is developed and tested — the archive interface (open, create, preview) arrives piece by piece as updates.',
        'Why this way? So you install once today and the features reach you automatically as they’re finished — no manual re-downloads.',
      ],
    },
    {
      id: 'updates',
      title: 'Updates',
      body: [
        'packed checks for new versions automatically on every launch. When one is available, the update dialog opens with the changelog — installing needs your click.',
        'Check manually: the “Check for updates” button in the main window.',
        'Security: updates come from GitHub (LAN-SOLO/packed) and are cryptographically signed. The app verifies the signature before every install — a tampered update is rejected.',
        'Your settings survive every update.',
      ],
    },
    {
      id: 'roadmap',
      title: 'Planned features',
      body: [
        'Planned for version 1.0 — features arrive as updates roughly in this order:',
        '• Open & extract — ZIP, 7z, TAR, gzip, bzip2, xz, zstd, lz4 and RAR, with content preview and single-file extraction',
        '• Create — ZIP (with AES-256), 7z, TAR and modern containers, with format and compression level at pack time',
        '• Extreme compression — zstd, LZMA2 and Brotli with a slider from “fast” to “maximum”',
        '• Encryption — AES-256 on create, opening password-protected archives',
        'Later with packed pro: batch processing, custom presets, split archives and password recovery for your own archives.',
        'Honestly: no tool can create RAR — the format is proprietary. packed extracts RAR and creates open formats.',
      ],
    },
    {
      id: 'pricing',
      title: 'Free & pro',
      body: [
        'packed Free stays free — for good, no strings attached: open, create, compress, encrypt.',
        'packed pro (€12 a year, that’s €1 a month) follows later — for heavy packers: batch processing, presets, splits and password recovery.',
      ],
    },
    {
      id: 'privacy',
      title: 'Privacy',
      body: [
        'packed computes locally on your device: no cloud, no account, no telemetry.',
        'The only network connection is the update check against GitHub.',
      ],
    },
  ],
};

const SEEN_KEY = 'packed.tutorialSeen';

export default function Help() {
  const c = navigator.language.toLowerCase().startsWith('de') ? de : en;
  const [mode, setMode] = useState<'closed' | 'tutorial' | 'manual'>(() =>
    localStorage.getItem(SEEN_KEY) ? 'closed' : 'tutorial'
  );
  const [step, setStep] = useState(0);
  const [sel, setSel] = useState(c.sections[0].id);
  const [q, setQ] = useState('');

  const close = () => {
    localStorage.setItem(SEEN_KEY, '1');
    setMode('closed');
    setStep(0);
  };

  const query = q.trim().toLowerCase();
  const filtered = query
    ? c.sections.filter(
        (s) =>
          s.title.toLowerCase().includes(query) ||
          s.body.some((p) => p.toLowerCase().includes(query))
      )
    : c.sections;
  const current = filtered.find((s) => s.id === sel) ?? filtered[0] ?? null;

  return (
    <>
      <button className="hlp-fab" title={c.labels.fab} onClick={() => setMode('manual')}>
        ?
      </button>
      {mode !== 'closed' && (
        <div className="hlp-overlay" onClick={close}>
          <div className="hlp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hlp-head">
              <span className="hlp-brand">
                <span className="hlp-name">packed</span>
                <span className="hlp-dot">.</span>
              </span>
              <button
                className={`hlp-tab ${mode === 'tutorial' ? 'active' : ''}`}
                onClick={() => {
                  setMode('tutorial');
                  setStep(0);
                }}
              >
                {c.labels.tutorial}
              </button>
              <button
                className={`hlp-tab ${mode === 'manual' ? 'active' : ''}`}
                onClick={() => setMode('manual')}
              >
                {c.labels.manual}
              </button>
              <span className="hlp-spacer" />
              <button className="hlp-close" onClick={close}>
                ✕
              </button>
            </div>

            {mode === 'tutorial' && (
              <div className="hlp-tut">
                <div className="hlp-step-count">
                  {c.labels.stepOf(step + 1, c.tutorial.length)}
                </div>
                <h2>{c.tutorial[step].title}</h2>
                {c.tutorial[step].body.map((p, i) =>
                  p.startsWith('• ') ? (
                    <div key={i} className="hlp-li">
                      {p.slice(2)}
                    </div>
                  ) : (
                    <p key={i}>{p}</p>
                  )
                )}
                <div className="hlp-tut-nav">
                  <button className="hlp-ghost" onClick={close}>
                    {c.labels.skip}
                  </button>
                  <span className="hlp-dots">
                    {c.tutorial.map((_, i) => (
                      <span key={i} className={i === step ? 'on' : ''} />
                    ))}
                  </span>
                  {step > 0 && (
                    <button onClick={() => setStep(step - 1)}>{c.labels.back}</button>
                  )}
                  {step < c.tutorial.length - 1 ? (
                    <button className="hlp-primary" onClick={() => setStep(step + 1)}>
                      {c.labels.next}
                    </button>
                  ) : (
                    <button className="hlp-primary" onClick={close}>
                      {c.labels.done}
                    </button>
                  )}
                </div>
              </div>
            )}

            {mode === 'manual' && (
              <div className="hlp-body">
                <div className="hlp-toc">
                  <input
                    type="text"
                    placeholder={c.labels.search}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                  {filtered.length === 0 && (
                    <div className="hlp-empty">{c.labels.noResults}</div>
                  )}
                  {filtered.map((s) => (
                    <button
                      key={s.id}
                      className={`hlp-toc-item ${current?.id === s.id ? 'active' : ''}`}
                      onClick={() => setSel(s.id)}
                    >
                      {s.title}
                    </button>
                  ))}
                </div>
                <div className="hlp-content">
                  {current && (
                    <>
                      <h2>{current.title}</h2>
                      {current.body.map((p, i) =>
                        p.startsWith('• ') ? (
                          <div key={i} className="hlp-li">
                            {p.slice(2)}
                          </div>
                        ) : (
                          <p key={i}>{p}</p>
                        )
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

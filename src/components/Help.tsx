import { useEffect, useState } from 'react';

// Selbstständiges Hilfe-System: schwebender ?-Button, First-Run-Tutorial
// und durchsuchbares Handbuch. Sprache folgt wie i18n.ts der Systemsprache.

/** Interaktive Aktion: schließt die Hilfe und löst die Funktion in der App aus. */
interface Action {
  label: string;
  cmd: 'open' | 'create' | 'updates';
}

interface Step {
  title: string;
  body: string[];
  action?: Action;
}

interface Section {
  id: string;
  title: string;
  body: string[];
  action?: Action;
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
        'packed öffnet, entpackt und erstellt Archive — ZIP, TAR, tar.gz, tar.zst und mehr, komplett lokal.',
        'Die Startseite bietet zwei Wege: „Archiv öffnen“ und „Archiv erstellen“. Oder du ziehst einfach Dateien ins Fenster.',
        'Dieses Tutorial dauert eine Minute. Du findest es jederzeit wieder über „Hilfe“ oben in der Leiste — dort wartet auch das Handbuch.',
      ],
    },
    {
      title: 'Archiv öffnen & entpacken',
      body: [
        '„Archiv wählen …“ klicken oder ein Archiv ins Fenster ziehen — packed zeigt den Inhalt als Liste: Name, Größe, gepackte Größe.',
        'Verschlüsselte ZIPs erkennst du am Schloss-Symbol und dem Badge „verschlüsselt“ — das Passwort trägst du unten ein.',
        '„Alles entpacken …“ fragt nach dem Zielordner und packt alles dorthin aus. Danach: „Im Finder zeigen“.',
      ],
      action: { label: 'Gleich ausprobieren: Archiv öffnen …', cmd: 'open' },
    },
    {
      title: 'Archiv erstellen',
      body: [
        '„Neues Archiv“ öffnet die Packliste: Dateien und Ordner hinzufügen — per Button oder Drag & Drop.',
        '• Format: ZIP, TAR, tar.gz, tar.bz2, tar.xz, tar.zst — oder gzip/bzip2/xz/zstd für einzelne Dateien',
        '• Kompression: schnell, ausgewogen, klein oder maximal',
        '• ZIP kann zusätzlich mit AES-256-Passwort verschlüsseln',
        '„Archiv erstellen …“ fragt nach dem Speicherort — fertig.',
      ],
      action: { label: 'Gleich ausprobieren: Neues Archiv', cmd: 'create' },
    },
    {
      title: 'Fenster & Vollbild',
      body: [
        'Die Oberfläche passt sich der Fenstergröße an — die UI skaliert mit, damit nie ein Scrollbalken über die ganze Seite läuft.',
        'Der Vollbild-Knopf oben rechts wechselt zwischen Fenster- und Vollbild-Modus (alternativ der grüne macOS-Knopf).',
      ],
    },
    {
      title: 'Updates',
      body: [
        'packed prüft beim Start automatisch auf neue Versionen und zeigt den Changelog — installiert wird erst nach deinem Klick.',
        'Updates kommen signiert von GitHub; Einstellungen und Dateien bleiben unangetastet.',
      ],
      action: { label: 'Jetzt nach Updates suchen', cmd: 'updates' },
    },
  ],
  sections: [
    {
      id: 'open',
      title: 'Archiv öffnen',
      body: [
        'Drei Wege, ein Archiv zu öffnen:',
        '• „Archiv wählen …“ auf der Startseite',
        '• Das Archiv ins packed-Fenster ziehen',
        '• Aus der Erstellen-Ansicht zurück und dann öffnen',
        'packed erkennt das Format an den Magic Bytes (nicht nur an der Endung) und zeigt den Inhalt: Dateiname, Originalgröße und gepackte Größe, Ordner mit 📁.',
        'Unterstützt zum Öffnen: ZIP (auch AES-verschlüsselt), TAR, tar.gz, tar.bz2, tar.xz, tar.zst sowie einzelne gzip-/bzip2-/xz-/zstd-Dateien. 7z und RAR folgen per Update.',
      ],
      action: { label: 'Archiv öffnen …', cmd: 'open' },
    },
    {
      id: 'extract',
      title: 'Entpacken',
      body: [
        '„Alles entpacken …“ fragt nach einem Zielordner und entpackt das komplette Archiv dorthin — die Ordnerstruktur bleibt erhalten.',
        'Bei verschlüsselten ZIPs (Badge „verschlüsselt“, Schloss an den Einträgen) vorher das Passwort ins Feld unten eintragen.',
        'Nach dem Entpacken zeigt „Im Finder zeigen“ das Ergebnis direkt im Dateimanager.',
        'Sicherheit: packed prüft Pfade beim Entpacken und lässt keine Einträge zu, die aus dem Zielordner ausbrechen würden (Zip-Slip-Schutz).',
      ],
      action: { label: 'Archiv öffnen …', cmd: 'open' },
    },
    {
      id: 'create',
      title: 'Archiv erstellen',
      body: [
        '„Neues Archiv“ öffnet die Packliste. Inhalte hinzufügen:',
        '• „Dateien hinzufügen …“ / „Ordner hinzufügen …“ — Ordner werden rekursiv mit Struktur gepackt',
        '• Oder Dateien und Ordner einfach ins Fenster ziehen',
        'Einträge lassen sich über das ✕ wieder entfernen. Unten wählst du Format und Kompression, dann „Archiv erstellen …“ und Speicherort festlegen.',
      ],
      action: { label: 'Neues Archiv anlegen', cmd: 'create' },
    },
    {
      id: 'formats',
      title: 'Formate',
      body: [
        'Zum Erstellen:',
        '• ZIP — der Kompatibilitäts-Standard; einziges Format mit Passwort (AES-256)',
        '• TAR — unkomprimierter Container, ideal als Basis',
        '• tar.gz / tar.bz2 / tar.xz / tar.zst — TAR plus Kompressor; tar.zst ist die moderne Empfehlung',
        '• gzip / bzip2 / xz / zstd — komprimieren genau EINE Datei (kein Container); für mehrere Dateien tar.* wählen',
        'RAR lässt sich technisch nicht erstellen (proprietär) — Lesen folgt per Update.',
      ],
    },
    {
      id: 'compression',
      title: 'Kompressionsstufen',
      body: [
        'Vier Profile, die je Format auf konkrete Parameter abgebildet werden:',
        '• schnell — maximaler Durchsatz (zstd -3)',
        '• ausgewogen — der Alltags-Standard (zstd -12)',
        '• klein — gutes Verhältnis, akzeptable Zeit (zstd -19 / xz -6)',
        '• maximal — bestes Ergebnis, dauert (zstd --ultra -22 / LZMA2 max)',
        'Faustregel: „ausgewogen“ für den Alltag, „maximal“ für Archive, die lange liegen oder verschickt werden.',
      ],
    },
    {
      id: 'encryption',
      title: 'Verschlüsselung',
      body: [
        'ZIP-Archive lassen sich beim Erstellen mit einem Passwort schützen — verschlüsselt wird mit AES-256.',
        'Beim Öffnen verschlüsselter ZIPs zeigt packed das Badge „verschlüsselt“; zum Entpacken das Passwort unten eintragen.',
        'Das Passwort verlässt dein Gerät nie. Und ehrlich: Ein vergessenes AES-256-Passwort kann auch packed nicht wiederherstellen.',
      ],
    },
    {
      id: 'window',
      title: 'Fenster, Vollbild & Zoom',
      body: [
        'packed kennt zwei Modi: Fenster und Vollbild — umschalten über den Knopf oben rechts oder den grünen macOS-Knopf.',
        'Die Oberfläche skaliert automatisch mit der Fenstergröße (Zoomstufen von 70 % bis 135 %), sodass alles immer hineinpasst — ohne Seiten-Scrollbalken.',
        'Nur lange Datei-Listen scrollen intern, mit dezentem schmalem Balken.',
      ],
    },
    {
      id: 'updates',
      title: 'Updates',
      body: [
        'packed prüft bei jedem Start automatisch auf neue Versionen. Liegt eine bereit, öffnet sich der Update-Dialog mit dem Changelog — installiert wird erst nach deinem Klick.',
        'Manuell prüfen: „Nach Updates suchen“ oben in der Leiste.',
        'Updates kommen signiert von GitHub (LAN-SOLO/packed): Die App prüft die Signatur vor jeder Installation.',
      ],
      action: { label: 'Jetzt nach Updates suchen', cmd: 'updates' },
    },
    {
      id: 'roadmap',
      title: 'Was noch kommt',
      body: [
        '• 7z öffnen und erstellen, RAR entpacken',
        '• Einzelne Dateien aus Archiven herausziehen (statt alles zu entpacken)',
        '• Vorschau von Dateien im Archiv',
        'Später mit packed pro: Stapelverarbeitung, eigene Presets, Mehrfach-Archive (Splits) und Passwort-Wiederherstellung für eigene Archive.',
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
        'packed opens, extracts and creates archives — ZIP, TAR, tar.gz, tar.zst and more, entirely locally.',
        'The start page offers two paths: “Open archive” and “Create archive”. Or just drop files onto the window.',
        'This tutorial takes a minute. Reopen it anytime via “Help” in the top bar — the manual lives there too.',
      ],
    },
    {
      title: 'Opening & extracting',
      body: [
        'Click “Choose archive …” or drop an archive onto the window — packed lists the contents: name, size, packed size.',
        'Encrypted ZIPs show a lock icon and the “encrypted” badge — enter the password at the bottom.',
        '“Extract all …” asks for a destination folder and unpacks everything there. Then: “Reveal in Finder”.',
      ],
      action: { label: 'Try it now: open an archive …', cmd: 'open' },
    },
    {
      title: 'Creating archives',
      body: [
        '“New archive” opens the pack list: add files and folders — via button or drag & drop.',
        '• Format: ZIP, TAR, tar.gz, tar.bz2, tar.xz, tar.zst — or gzip/bzip2/xz/zstd for single files',
        '• Compression: fast, balanced, small or maximum',
        '• ZIP can additionally encrypt with an AES-256 password',
        '“Create archive …” asks where to save — done.',
      ],
      action: { label: 'Try it now: new archive', cmd: 'create' },
    },
    {
      title: 'Window & fullscreen',
      body: [
        'The interface adapts to the window size — the UI scales along, so no page-wide scrollbar ever appears.',
        'The fullscreen button in the top right switches between windowed and fullscreen mode (or use the green macOS button).',
      ],
    },
    {
      title: 'Updates',
      body: [
        'packed checks for new versions on launch and shows the changelog — installing needs your click.',
        'Updates come signed from GitHub; settings and files stay untouched.',
      ],
      action: { label: 'Check for updates now', cmd: 'updates' },
    },
  ],
  sections: [
    {
      id: 'open',
      title: 'Opening archives',
      body: [
        'Three ways to open an archive:',
        '• “Choose archive …” on the start page',
        '• Drop the archive onto the packed window',
        '• Go back from the create view and open one',
        'packed detects the format by magic bytes (not just the extension) and lists the contents: file name, original size, packed size, folders marked with 📁.',
        'Supported for opening: ZIP (incl. AES-encrypted), TAR, tar.gz, tar.bz2, tar.xz, tar.zst, plus single gzip/bzip2/xz/zstd files. 7z and RAR follow via update.',
      ],
      action: { label: 'Open an archive …', cmd: 'open' },
    },
    {
      id: 'extract',
      title: 'Extracting',
      body: [
        '“Extract all …” asks for a destination folder and unpacks the whole archive there — folder structure preserved.',
        'For encrypted ZIPs (badge “encrypted”, lock on entries), enter the password in the field at the bottom first.',
        'After extraction, “Reveal in Finder” shows the result in the file manager.',
        'Safety: packed validates paths during extraction and rejects entries that would escape the destination folder (zip-slip protection).',
      ],
      action: { label: 'Open an archive …', cmd: 'open' },
    },
    {
      id: 'create',
      title: 'Creating archives',
      body: [
        '“New archive” opens the pack list. Add content:',
        '• “Add files …” / “Add folder …” — folders are packed recursively with their structure',
        '• Or simply drop files and folders onto the window',
        'Entries can be removed via ✕. Choose format and compression at the bottom, then “Create archive …” and pick a location.',
      ],
      action: { label: 'Create a new archive', cmd: 'create' },
    },
    {
      id: 'formats',
      title: 'Formats',
      body: [
        'For creating:',
        '• ZIP — the compatibility standard; the only format with password support (AES-256)',
        '• TAR — uncompressed container, ideal as a base',
        '• tar.gz / tar.bz2 / tar.xz / tar.zst — TAR plus a compressor; tar.zst is the modern recommendation',
        '• gzip / bzip2 / xz / zstd — compress exactly ONE file (no container); pick tar.* for multiple files',
        'RAR cannot technically be created (proprietary) — reading follows via update.',
      ],
    },
    {
      id: 'compression',
      title: 'Compression levels',
      body: [
        'Four profiles, mapped to concrete parameters per format:',
        '• fast — maximum throughput (zstd -3)',
        '• balanced — the everyday default (zstd -12)',
        '• small — good ratio, acceptable time (zstd -19 / xz -6)',
        '• maximum — best result, takes a while (zstd --ultra -22 / LZMA2 max)',
        'Rule of thumb: “balanced” for daily use, “maximum” for archives that will be stored long or shipped.',
      ],
    },
    {
      id: 'encryption',
      title: 'Encryption',
      body: [
        'ZIP archives can be protected with a password at creation — encrypted with AES-256.',
        'When opening encrypted ZIPs, packed shows the “encrypted” badge; enter the password at the bottom to extract.',
        'The password never leaves your device. And honestly: a forgotten AES-256 password cannot be recovered — not even by packed.',
      ],
    },
    {
      id: 'window',
      title: 'Window, fullscreen & zoom',
      body: [
        'packed has two modes: windowed and fullscreen — toggle via the button in the top right or the green macOS button.',
        'The interface scales automatically with the window size (zoom levels from 70% to 135%), so everything always fits — without a page scrollbar.',
        'Only long file lists scroll internally, with a subtle slim bar.',
      ],
    },
    {
      id: 'updates',
      title: 'Updates',
      body: [
        'packed checks for new versions automatically on every launch. When one is available, the update dialog opens with the changelog — installing needs your click.',
        'Check manually: “Check for updates” in the top bar.',
        'Updates come signed from GitHub (LAN-SOLO/packed): the app verifies the signature before every install.',
      ],
      action: { label: 'Check for updates now', cmd: 'updates' },
    },
    {
      id: 'roadmap',
      title: 'What’s coming',
      body: [
        '• Opening and creating 7z, extracting RAR',
        '• Extracting single files from archives (instead of everything)',
        '• Previewing files inside archives',
        'Later with packed pro: batch processing, custom presets, split archives and password recovery for your own archives.',
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

  // externe Öffnung, z. B. per Custom-Event aus der App.
  // detail: 'tutorial' | 'manual' | { mode, section } — section = Kontext-Hilfe
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setStep(0);
      if (typeof detail === 'object' && detail !== null) {
        if (detail.section) setSel(detail.section);
        setMode(detail.mode === 'tutorial' ? 'tutorial' : 'manual');
      } else {
        setMode(detail === 'tutorial' ? 'tutorial' : 'manual');
      }
    };
    window.addEventListener('open-help', onOpen);
    return () => window.removeEventListener('open-help', onOpen);
  }, []);

  // Tastatur: Esc schließt, ←/→ blättern im Tutorial
  useEffect(() => {
    if (mode === 'closed') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        localStorage.setItem(SEEN_KEY, '1');
        setMode('closed');
        setStep(0);
      }
      if (mode === 'tutorial') {
        if (e.key === 'ArrowRight') setStep((s) => Math.min(s + 1, c.tutorial.length - 1));
        if (e.key === 'ArrowLeft') setStep((s) => Math.max(s - 1, 0));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, c.tutorial.length]);

  const runAction = (action: Action) => {
    localStorage.setItem(SEEN_KEY, '1');
    setMode('closed');
    setStep(0);
    window.dispatchEvent(new CustomEvent('help-action', { detail: action.cmd }));
  };

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
                {c.tutorial[step].action && (
                  <button
                    className="hlp-action"
                    onClick={() => runAction(c.tutorial[step].action!)}
                  >
                    ▸ {c.tutorial[step].action!.label}
                  </button>
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
                      {current.action && (
                        <button
                          className="hlp-action"
                          onClick={() => runAction(current.action!)}
                        >
                          ▸ {current.action!.label}
                        </button>
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

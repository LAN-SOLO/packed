# packed — Produkt- und Implementierungsplan

Ein Archiv- und Kompressions-Tool für macOS, Windows und Linux, das die
gängigen Formate öffnet und erstellt (ZIP, 7z, TAR & moderne Container),
RAR entpackt und mit den neuesten Algorithmen so klein wie möglich
komprimiert. **Free** bleibt dauerhaft kostenlos und voll nutzbar;
**packed pro** (12 €/Jahr = 1 €/Monat) ergänzt Passwort-Wiederherstellung
eigener Archive, Stapelverarbeitung/Presets und Splits/SFX.

Produktseite: https://lan-solo.com/de/tools/packed/

## 1. Produktdefinition

### Pläne & Preise (fixiert, siehe Landing Page)

| | Free | pro |
|---|---|---|
| Preis | 0 € (dauerhaft) | 12 €/Jahr (1 €/Monat) |
| Öffnen | ZIP, 7z, TAR, gzip, bzip2, xz, zstd, lz4, RAR | gleich |
| Erstellen | ZIP (AES-256), 7z, TAR, gzip/bzip2/xz/zstd | gleich |
| Algorithmen | zstd (bis --ultra), LZMA2, Brotli, Deflate | gleich |
| Passwort-geschützte Archive öffnen | ✓ | ✓ |
| Passwort-Wiederherstellung (eigene ZIP/RAR) | — | ✓ |
| Stapelverarbeitung & Presets | — | ✓ |
| Mehrfach-Archive (Splits) & SFX | — | ✓ |

### Harte Randbedingungen (ehrlich einplanen!)

- **RAR erstellen ist unmöglich.** Das RAR5-Format ist proprietär und
  patentiert; nur die Entpackung ist erlaubt (RARLAB `unrar`). packed liest
  RAR und schreibt ausschließlich offene Formate — das steht so auch auf der
  Produktseite und darf im Marketing nicht anders klingen.
- **Starke AES-256-Passwörter sind nicht „knackbar".** Passwort-
  Wiederherstellung findet vergessene/schwache Passwörter per Wörterbuch- und
  Muster-Angriff. Für altes ZipCrypto ist das praktisch effektiv; für AES-256
  (ZIP), RAR5 und 7z gilt: nur Dictionary/Mask, kein Brute-Force starker
  Passwörter. Das Feature verkauft Komfort für den eigenen Notfall, keine
  Wunder — und wird genau so kommuniziert.
- **Passwort-Recovery nur für eigene Archive.** Das Feature ist als
  „vergessenes Passwort der eigenen Datei" positioniert, nicht als
  Angriffswerkzeug gegen fremde Dateien.
- **Kompression rechnet lokal, kein Cloud-Upload.** Keine Telemetrie, kein
  Konto-Zwang — gleiche Disziplin wie bei [[secrets]], [[keypile]] und
  [[all-backed]].

## 2. Formate & Bibliotheken (Rust-Core)

Alles über gepflegte Rust-Crates, eine Engine für alle Plattformen:

| Format | Crate | Read | Write |
|---|---|---|---|
| ZIP (inkl. AES-256, ZipCrypto) | `zip` | ✓ | ✓ |
| 7z / LZMA2 | `sevenz-rust2` | ✓ (LZMA/LZMA2/BZIP2/PPMD) | ✓ (LZMA2) |
| TAR | `tar` | ✓ | ✓ |
| gzip / Deflate | `flate2` | ✓ | ✓ |
| bzip2 | `bzip2` | ✓ | ✓ |
| xz / LZMA | `xz2` | ✓ | ✓ |
| zstd (bis --ultra-22, Dict) | `zstd` | ✓ | ✓ |
| brotli | `brotli` | ✓ | ✓ |
| lz4 | `lz4_flex` | ✓ | ✓ |
| RAR (nur entpacken) | `unrar` | ✓ | — (proprietär) |

Kombinierte Container (`.tar.gz`, `.tar.zst`, `.tar.xz`, …) werden durch
Verkettung von `tar` mit dem jeweiligen Kompressor gebildet.

## 3. Architektur

- **Core (Rust) — `packed-core`:** Formaterkennung (Magic Bytes + Endung),
  Archiv-Listing, Extraktion (ganz/selektiv), Erstellung, Kompressionsprofile.
  Kein Netzwerk, keine UI-Abhängigkeiten — nativ gebaut, testbar über eine CLI.
- **Recovery-Modul (pro) — `packed-recovery`:** Wörterbuch- und Masken-Engine
  gegen ZipCrypto/AES-ZIP/RAR-Header. GPU-Beschleunigung als spätere Ausbaustufe;
  ehrliche Fortschritts-/Machbarkeitsanzeige.
- **Desktop-App (macOS, Windows, Linux):** Tauri (Rust-Core + Web-UI) — kleine
  Binaries, kein Electron-Overhead. Drag-&-Drop, Archiv-Browser mit Vorschau,
  Kompressions-Regler (schnell ↔ maximal), Fortschritt/Abbruch.
- **Signierte Updates & CI:** GitHub-Actions-Matrix baut macOS (arm64/x64),
  Windows (msi/nsis) und Linux (deb/rpm/AppImage); In-App-Updater analog
  [[keypile]] (tauri-plugin-updater, minisign-signierte Artefakte, `latest.json`).

### Kompressionsprofile (UI-Regler)

| Stufe | Algorithmus/Level | Zweck |
|---|---|---|
| Schnell | zstd -3 / lz4 | maximaler Durchsatz |
| Ausgewogen | zstd -12 | Alltags-Default |
| Klein | zstd -19 / xz -6 | gute Ratio, vertretbare Zeit |
| Maximal | zstd --ultra -22 / LZMA2 max | beste Ratio, langsam |

## 4. Sicherheit & Ehrlichkeit

- **Verschlüsselung:** AES-256 für ZIP-Erstellung; Passwörter bleiben im
  Speicher der Sitzung und werden nach Gebrauch zeroized, nie geloggt.
- **Recovery-Transparenz:** Die UI zeigt vorab, was für das erkannte Format
  realistisch ist (ZipCrypto: gut; AES-256/RAR5/7z: nur Dictionary/Mask), inkl.
  Restzeit-Schätzung — keine falschen Versprechen.
- **Keine stillen Überschreibungen:** Bestehende Zieldateien werden bestätigt;
  Extraktion mit Pfad-Traversal-Schutz (kein „Zip-Slip").

## 5. Roadmap

- **Phase 0 — Core & CLI:** `packed-core` mit Formaterkennung, Listing,
  Extraktion und Erstellung für ZIP/TAR/gzip/zstd/xz/bzip2, Property-/Roundtrip-
  Tests, kleine CLI. **← Start hier.**
- **Phase 1 — Formate komplett:** 7z (Read/Write LZMA2), RAR-Entpacken, brotli/
  lz4, AES-256-ZIP, kombinierte tar.*-Container, Zip-Slip-Schutz.
- **Phase 2 — Desktop Free:** Tauri-App (macOS zuerst, dann Windows/Linux),
  Drag-&-Drop, Archiv-Browser mit Vorschau, Kompressions-Regler, Fortschritt,
  signierte Updates + CI-Matrix.
- **Phase 3 — pro:** Passwort-Wiederherstellung (Dictionary/Mask), Stapel-
  verarbeitung & Presets, Splits/SFX, Lizenzsystem.
- **Phase 4 — Feinschliff:** GPU-beschleunigte Recovery, zstd-Dictionaries für
  wiederkehrende Datensätze, Kontextmenü-/Shell-Integration pro Plattform.

## 6. Bezug zur Website

Die Produktseite (`webpage`-Repo, `app/[lang]/tools/packed/`) beschreibt
Features und Preise verbindlich — Architekturentscheidungen hier müssen dazu
passen. Wortmarke `packed.` folgt `STYLEGUIDE.md` im Website-Repo
(klein, Name blau, Punkt neutral, immer über `BrandName.tsx`).

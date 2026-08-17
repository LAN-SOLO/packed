# packed

Archiv- und Kompressions-Tool für macOS, Windows und Linux: öffnet und erstellt
ZIP, 7z, TAR und moderne Formate, entpackt auch RAR und komprimiert mit den
neuesten Algorithmen (zstd, LZMA2, Brotli) so klein wie möglich. **Free**
bleibt dauerhaft kostenlos und voll nutzbar; **packed pro** (12 €/Jahr =
1 €/Monat) ergänzt Passwort-Wiederherstellung eigener Archive,
Stapelverarbeitung/Presets und Splits/SFX.

Produktseite: https://lan-solo.com/de/tools/packed/ · Plan: `PACKED_PLAN.md`
(Produktdefinition, Formate, Architektur, Roadmap).

## Status

**Phase 0 — Core & CLI (in Arbeit).** Der Rust-Core (`core/`) erkennt Formate,
listet, entpackt und erstellt Archive; eine CLI (`cli/`) treibt ihn für Skripte
und Tests. Das Tauri-App-Grundgerüst (`src-tauri/` + `src/`) steht inklusive
**In-App-Updater** (gleiches Muster wie keypile): signierte Updates von GitHub
Releases, stiller Check beim Start, „Nach Updates suchen"-Button — und vor
jeder Installation zeigt die App das Changelog, installiert wird erst nach
Bestätigung. Releases entstehen per Git-Tag `v*` (`.github/workflows/build.yml`
baut, signiert, generiert das Changelog aus den Commits und published
`latest.json`). Signatur-Key: `~/.tauri/packed-updater.key`.

### Bereits umgesetzt (Phase 0)

- **Formaterkennung** per Magic Bytes + Endung (u. a. Auflösung von `.tar.gz`
  vs. bloßem `.gz`)
- **Erstellen:** ZIP (inkl. **AES-256**-Verschlüsselung), TAR und kombinierte
  Container `.tar.gz` / `.tar.bz2` / `.tar.xz` / `.tar.zst`, sowie Einzelstrom
  `.gz` / `.bz2` / `.xz` / `.zst`
- **Öffnen/Listen/Entpacken** derselben Formate, inkl. passwortgeschützter ZIPs
- **Kompressionsprofile** (`fast` · `balanced` · `small` · `maximum`) mappen auf
  konkrete Algorithmus-Parameter (zstd bis --ultra-22, xz -9, …)
- **Zip-Slip-Schutz:** kein Archiveintrag kann aus dem Zielordner ausbrechen
- 15 Core-Tests (Roundtrips aller Formate, AES-256, Passwort-Fehler,
  Pfad-Traversal) + End-to-End-CLI

### Noch offen (Roadmap, siehe PACKED_PLAN.md)

- Phase 1: 7z (LZMA2 read/write), RAR **entpacken** (`unrar`), brotli/lz4,
  selektive Extraktion, `.tar.*` mit weiteren Codecs
- Phase 2: Tauri-Desktop-App (Drag-&-Drop, Archiv-Browser, Kompressions-Regler),
  signierte Updates + CI-Matrix (macOS/Windows/Linux)
- Phase 3 (pro): Passwort-Wiederherstellung (Wörterbuch/Maske), Stapelverarbeitung,
  Presets, Splits/SFX, Lizenzsystem

## Entwicklung

Voraussetzungen: Rust (stable). Für xz/bzip2/zstd werden C-Backends
mitkompiliert (keine System-Bibliotheken nötig).

```sh
cargo test -p packed-core          # Core-Tests
cargo build -p packed-cli          # CLI bauen → target/debug/packed

# Beispiel: Ordner maximal komprimieren, prüfen, entpacken
packed create out.tar.zst maximum ./mein-ordner
packed list out.tar.zst
packed extract out.tar.zst ./ziel
```

## Architektur

- `core/` — **packed-core**: Formaterkennung, Listing, Extraktion, Erstellung,
  Kompressionsprofile. Kein Netzwerk, keine UI-Abhängigkeiten; eine
  Implementierung für alle Plattformen.
- `cli/` — **packed-cli** (`packed`): dünne CLI über den Core, für Skripte/CI.
- `src-tauri/` + `src/` — Desktop-App (Phase 2, folgt).

**Ehrliche Grenzen** (stehen auch auf der Produktseite): RAR **erstellen** ist
unmöglich (proprietäres Format) — packed entpackt RAR und schreibt offene
Formate. Passwort-Wiederherstellung findet schwache/vergessene Passwörter per
Wörterbuch/Maske; starke AES-256-Passwörter sind mathematisch nicht zu knacken.

## Verwandte Repositories

- [webpage](https://github.com/LAN-SOLO/webpage) — lan-solo.com inkl. `/[lang]/tools/packed/`
- [keypile](https://github.com/LAN-SOLO/keypile) — Passwortmanager, gleicher Tauri-/CI-/Updater-Aufbau
- [browse](https://github.com/LAN-SOLO/browse) · [all-backed](https://github.com/LAN-SOLO/all-backed) · [secrets](https://github.com/LAN-SOLO/secrets)

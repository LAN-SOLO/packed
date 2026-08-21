import { useCallback, useEffect, useRef, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  api,
  ArchiveEntry,
  CreateFormat,
  CreateResult,
  EditOps,
  Level,
  Listing,
  PathStat,
  ProgressEvent,
  UpdateInfo,
} from './api';
import { t } from './i18n';
import UpdateModal from './components/UpdateModal';
import Help from './components/Help';

type View =
  | { kind: 'home' }
  | { kind: 'listing'; path: string; listing: Listing }
  | { kind: 'create' };

const ARCHIVE_EXTS = [
  'zip', '7z', 'rar', 'tar', 'gz', 'tgz', 'bz2', 'tbz2', 'xz', 'txz', 'zst', 'tzst', 'lz4', 'br',
];

const FORMAT_EXT: Record<CreateFormat, string> = {
  zip: 'zip',
  tar: 'tar',
  'tar.gz': 'tar.gz',
  'tar.bz2': 'tar.bz2',
  'tar.xz': 'tar.xz',
  'tar.zst': 'tar.zst',
  gzip: 'gz',
  bzip2: 'bz2',
  xz: 'xz',
  zstd: 'zst',
};

const SINGLE_STREAM: CreateFormat[] = ['gzip', 'bzip2', 'xz', 'zstd'];

function looksLikeArchive(path: string): boolean {
  const lower = path.toLowerCase();
  return ARCHIVE_EXTS.some((e) => lower.endsWith(`.${e}`));
}

function fmtBytes(b: number): string {
  if (b >= 1024 * 1024 * 1024) return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  if (b >= 1024) return `${Math.round(b / 1024)} KB`;
  return `${b} B`;
}

function baseName(path: string): string {
  return path.split('/').pop() ?? path;
}

/** Ersparnis in Prozent (positiv = kleiner geworden). */
function savingsPct(original: number, packed: number): number {
  if (original <= 0) return 0;
  return Math.round((1 - packed / original) * 100);
}

export default function App() {
  const [version, setVersion] = useState('');
  const [view, setView] = useState<View>({ kind: 'home' });
  const [update, setUpdate] = useState<UpdateInfo | null | 'unchecked'>('unchecked');
  const [checking, setChecking] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ msg: string; err: boolean } | null>(null);
  const toastTimer = useRef<number>(0);
  const [isFs, setIsFs] = useState(false);

  // listing state
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastOutput, setLastOutput] = useState<string | null>(null);
  const [extractResult, setExtractResult] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // edit state (ZIP only)
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  // Escape muss den Blur-Commit unterdrücken: das Entfernen des fokussierten
  // Inputs feuert in WebKit noch ein focusout hinterher.
  const renameCancelRef = useRef(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [armedDelete, setArmedDelete] = useState(false);
  const armTimer = useRef<number>(0);

  // create state
  const [sources, setSources] = useState<string[]>([]);
  const [format, setFormat] = useState<CreateFormat>('zip');
  const [level, setLevel] = useState<Level>('balanced');
  const [createPw, setCreatePw] = useState('');
  const [createResult, setCreateResult] = useState<CreateResult | null>(null);
  const [stats, setStats] = useState<Record<string, PathStat>>({});

  // progress (Packen/Entpacken)
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const extractTotalRef = useRef(0);

  const viewRef = useRef(view);
  viewRef.current = view;

  const toast = useCallback((msg: string, isError = false) => {
    setToastMsg({ msg, err: isError });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 4000);
  }, []);

  // Fenster füllen, nie scrollen: UI-Zoom folgt der Fenstergröße.
  useEffect(() => {
    const apply = () => {
      const scale = Math.min(window.innerWidth / 980, window.innerHeight / 660);
      (document.body.style as CSSStyleDeclaration & { zoom: string }).zoom = String(
        Math.min(1.35, Math.max(0.7, scale))
      );
      getCurrentWindow().isFullscreen().then(setIsFs).catch(() => {});
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);

  const openArchive = useCallback(
    (path: string) => {
      setBusy(true);
      api
        .inspectArchive(path)
        .then((listing) => {
          setPassword('');
          setLastOutput(null);
          setExtractResult(null);
          setSelected(new Set());
          setRenaming(null);
          setNewFolderOpen(false);
          setArmedDelete(false);
          setView({ kind: 'listing', path, listing });
        })
        .catch((err) => toast(`${t.openError}: ${String(err)}`, true))
        .finally(() => setBusy(false));
    },
    [toast]
  );

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
    // silent update check on app start; when an update exists the changelog
    // dialog opens first — installing always needs an explicit confirmation
    api
      .checkUpdate()
      .then((u) => {
        setUpdate(u);
        if (u) setShowUpdateModal(true);
      })
      .catch(() => {});
  }, []);

  // Interaktive Hilfe: Aktions-Buttons im Handbuch steuern die App
  useEffect(() => {
    const onAction = (e: Event) => {
      const cmd = (e as CustomEvent).detail;
      if (cmd === 'open') pickArchive();
      if (cmd === 'create') {
        setSources([]);
        setView({ kind: 'create' });
      }
      if (cmd === 'updates') doCheckUpdate();
    };
    window.addEventListener('help-action', onAction);
    return () => window.removeEventListener('help-action', onAction);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // F1 oder ⌘/ öffnet die Kontext-Hilfe
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F1' || ((e.metaKey || e.ctrlKey) && e.key === '/')) {
        e.preventDefault();
        openContextHelp();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fortschritts-Events der Engine
  useEffect(() => {
    const un = listen<ProgressEvent>('pack-progress', ({ payload }) => {
      setProgress(payload);
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  // Größen der Packliste nachladen
  useEffect(() => {
    if (sources.length === 0) {
      setStats({});
      return;
    }
    api
      .statPaths(sources)
      .then((list) => {
        const map: Record<string, PathStat> = {};
        for (const s of list) map[s.path] = s;
        setStats(map);
      })
      .catch(() => {});
  }, [sources]);

  // Ergebnis-Zeile zurücksetzen, wenn sich die Auswahl ändert
  useEffect(() => {
    setCreateResult(null);
  }, [sources, format, level]);

  // Eine Bearbeitungs-Runde (nur ZIP): Archiv wird sicher neu geschrieben,
  // danach ersetzt das frische Listing die Ansicht.
  const applyEdit = async (
    ops: EditOps,
    done: (entriesBefore: number, entriesAfter: number) => string
  ) => {
    if (viewRef.current.kind !== 'listing' || busy) return;
    const v = viewRef.current;
    if (v.listing.encrypted && !password) {
      toast(t.editNeedsPassword, true);
      return;
    }
    setBusy(true);
    try {
      const listing = await api.editArchive(v.path, { ...ops, password: password || undefined });
      setSelected(new Set());
      setRenaming(null);
      setNewFolderOpen(false);
      setNewFolderName('');
      setArmedDelete(false);
      setView({ kind: 'listing', path: v.path, listing });
      toast(done(v.listing.entries.length, listing.entries.length));
    } catch (err) {
      toast(`${t.editError}: ${String(err)}`, true);
    } finally {
      setBusy(false);
    }
  };
  const applyEditRef = useRef(applyEdit);
  applyEditRef.current = applyEdit;

  // Drag & Drop: Archive öffnen, Dateien in offene ZIPs oder zur Packliste
  useEffect(() => {
    const un = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type !== 'drop') return;
      const paths = event.payload.paths;
      if (paths.length === 0) return;
      if (viewRef.current.kind === 'create') {
        setSources((prev) => [...prev, ...paths.filter((p) => !prev.includes(p))]);
        return;
      }
      const archive = paths.find(looksLikeArchive);
      if (
        viewRef.current.kind === 'listing' &&
        viewRef.current.listing.format === 'ZIP' &&
        !archive
      ) {
        // Nicht-Archive in ein offenes ZIP ziehen = hinzufügen
        applyEditRef.current({ addPaths: paths }, (b, a) => t.editedAdded(Math.max(0, a - b)));
        return;
      }
      if (archive) {
        openArchive(archive);
      } else {
        setSources(paths);
        setView({ kind: 'create' });
      }
    });
    return () => {
      un.then((f) => f());
    };
  }, [openArchive]);

  const pickArchive = async () => {
    const picked = await open({
      multiple: false,
      filters: [{ name: 'Archive', extensions: ARCHIVE_EXTS }],
    });
    if (typeof picked === 'string') openArchive(picked);
  };

  // Auswahl: Klick auf Ordner nimmt den ganzen Teilbaum mit
  const toggleEntry = (name: string, isDir: boolean) => {
    if (view.kind !== 'listing') return;
    const entries = view.listing.entries;
    const prefix = name.endsWith('/') ? name : `${name}/`;
    const targets = isDir
      ? entries.filter((e) => e.name === name || e.name.startsWith(prefix)).map((e) => e.name)
      : [name];
    setSelected((prev) => {
      const next = new Set(prev);
      const allIn = targets.every((t) => next.has(t));
      targets.forEach((t) => (allIn ? next.delete(t) : next.add(t)));
      return next;
    });
  };

  const selectedFileCount =
    view.kind === 'listing'
      ? view.listing.entries.filter((e) => !e.isDir && selected.has(e.name)).length
      : 0;

  const extractSelection = async (names: string[], count: number) => {
    if (view.kind !== 'listing') return;
    const dest = await open({ directory: true, title: t.chooseDestTitle });
    if (typeof dest !== 'string') return;
    extractTotalRef.current = count;
    setBusy(true);
    setExtractResult(null);
    try {
      const n = await api.extractEntries(view.path, dest, names, password || undefined);
      setLastOutput(dest);
      setExtractResult(n);
      toast(t.extracted(n));
    } catch (err) {
      toast(`${t.extractError}: ${String(err)}`, true);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const extractSelected = () => {
    if (view.kind !== 'listing') return;
    const names = view.listing.entries
      .filter((e) => selected.has(e.name))
      .map((e) => (e.isDir && !e.name.endsWith('/') ? `${e.name}/` : e.name));
    extractSelection(names, selectedFileCount);
  };

  const extractAll = async () => {
    if (view.kind !== 'listing') return;
    const dest = await open({ directory: true, title: t.chooseDestTitle });
    if (typeof dest !== 'string') return;
    extractTotalRef.current = view.listing.entries.filter((e) => !e.isDir).length;
    setBusy(true);
    setExtractResult(null);
    try {
      const n = await api.extractArchive(view.path, dest, password || undefined);
      setLastOutput(dest);
      setExtractResult(n);
      toast(t.extracted(n));
    } catch (err) {
      toast(`${t.extractError}: ${String(err)}`, true);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  // --- ZIP-Bearbeitung: hinzufügen, neuer Ordner, umbenennen, löschen ---
  const canEdit = view.kind === 'listing' && view.listing.format === 'ZIP';

  const addToArchive = async (directory: boolean) => {
    const picked = await open({ multiple: true, directory });
    if (!picked) return;
    const paths = Array.isArray(picked) ? picked : [picked];
    if (paths.length === 0) return;
    applyEdit({ addPaths: paths }, (b, a) => t.editedAdded(Math.max(0, a - b)));
  };

  const createFolder = () => {
    const name = newFolderName.trim().replace(/^\/+|\/+$/g, '');
    if (!name) return;
    applyEdit({ addDirs: [name] }, () => t.editedFolder(name));
  };

  const startRename = (name: string) => {
    renameCancelRef.current = false;
    setRenameValue(name.endsWith('/') ? name.slice(0, -1) : name);
    setRenaming(name);
  };

  // Idempotent: Enter committet und unmountet das Input — der dabei noch
  // feuernde Blur darf nicht ein zweites Mal committen.
  const commitRename = (entry: ArchiveEntry) => {
    if (renaming !== entry.name) return;
    const to = renameValue.trim().replace(/^\/+|\/+$/g, '');
    const from = entry.isDir && !entry.name.endsWith('/') ? `${entry.name}/` : entry.name;
    const toFull = entry.isDir ? `${to}/` : to;
    setRenaming(null);
    if (!to || toFull === from) return;
    applyEdit({ renames: [{ from, to: toFull }] }, () => t.editedRenamed(to));
  };

  const cancelRename = () => {
    renameCancelRef.current = true;
    setRenaming(null);
  };

  const deleteSelected = () => {
    if (view.kind !== 'listing') return;
    if (!armedDelete) {
      // Löschen ist endgültig: erst der zweite Klick führt aus
      setArmedDelete(true);
      window.clearTimeout(armTimer.current);
      armTimer.current = window.setTimeout(() => setArmedDelete(false), 4000);
      return;
    }
    window.clearTimeout(armTimer.current);
    const names = view.listing.entries
      .filter((e) => selected.has(e.name))
      .map((e) => (e.isDir && !e.name.endsWith('/') ? `${e.name}/` : e.name));
    applyEdit({ deletes: names }, (b, a) => t.editedDeleted(Math.max(0, b - a)));
  };

  // eine geänderte Auswahl entschärft einen angefangenen Löschvorgang
  useEffect(() => {
    setArmedDelete(false);
  }, [selected]);

  const addFiles = async (directory: boolean) => {
    const picked = await open({ multiple: true, directory });
    if (!picked) return;
    const paths = Array.isArray(picked) ? picked : [picked];
    setSources((prev) => [...prev, ...paths.filter((p) => !prev.includes(p))]);
  };

  const doCreate = async () => {
    const ext = FORMAT_EXT[format];
    const dest = await save({
      title: t.saveArchiveTitle,
      defaultPath: `archiv.${ext}`,
      filters: [{ name: format, extensions: [ext.split('.').pop() ?? ext] }],
    });
    if (typeof dest !== 'string') return;
    setBusy(true);
    setCreateResult(null);
    try {
      const res = await api.createArchive(
        dest,
        format,
        sources,
        level,
        format === 'zip' ? createPw || undefined : undefined
      );
      setLastOutput(dest);
      setCreateResult(res);
      const pct = savingsPct(res.originalBytes, res.packedBytes);
      toast(
        `${t.created(res.files)} · ${fmtBytes(res.originalBytes)} → ${fmtBytes(res.packedBytes)}${
          pct > 0 ? ` · ${t.saves(pct)}` : ''
        }`
      );
    } catch (err) {
      toast(`${t.createError}: ${String(err)}`, true);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const doCheckUpdate = async () => {
    setChecking(true);
    try {
      const u = await api.checkUpdate();
      setUpdate(u);
      if (u) setShowUpdateModal(true);
      else toast(t.upToDate);
    } catch (err) {
      toast(String(err), true);
    } finally {
      setChecking(false);
    }
  };

  // Kontext-Hilfe: öffnet das Handbuch beim passenden Kapitel zur aktuellen Ansicht
  const openContextHelp = () => {
    const section =
      viewRef.current.kind === 'listing'
        ? 'extract'
        : viewRef.current.kind === 'create'
          ? 'create'
          : 'open';
    window.dispatchEvent(new CustomEvent('open-help', { detail: { mode: 'manual', section } }));
  };

  const toggleFullscreen = async () => {
    const w = getCurrentWindow();
    const next = !(await w.isFullscreen());
    await w.setFullscreen(next);
    setIsFs(next);
  };

  const singleStreamBlocked = SINGLE_STREAM.includes(format) && sources.length !== 1;

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          <span className="brand">packed</span>
          <span className="dot">.</span>
        </h1>
        <span className="subtitle">{t.subtitle}</span>
        <span className="spacer" />
        {update !== 'unchecked' && update !== null ? (
          <button className="primary small" onClick={() => setShowUpdateModal(true)}>
            {t.updateAvailable(update.version)}
          </button>
        ) : (
          <button className="small" onClick={doCheckUpdate} disabled={checking}>
            {checking ? t.updateChecking : t.checkForUpdates}
          </button>
        )}
        <button className="small" title="F1" onClick={openContextHelp}>
          {t.helpBtn}
        </button>
        <button className="small" onClick={toggleFullscreen}>
          {isFs ? t.fullscreenExit : t.fullscreenEnter}
        </button>
        {version && <span className="version">v{version}</span>}
      </header>

      {view.kind === 'home' && (
        <main className="home">
          <div className="home-cards">
            <div className="action-card">
              <h2>{t.homeOpenTitle}</h2>
              <p>{t.homeOpenText}</p>
              <button className="primary" onClick={pickArchive} disabled={busy}>
                {t.homeOpenBtn}
              </button>
            </div>
            <div className="action-card">
              <h2>{t.homeCreateTitle}</h2>
              <p>{t.homeCreateText}</p>
              <button
                className="primary"
                onClick={() => {
                  setSources([]);
                  setView({ kind: 'create' });
                }}
              >
                {t.homeCreateBtn}
              </button>
            </div>
          </div>
          <div className="drop-hint">{t.dropHint}</div>
        </main>
      )}

      {view.kind === 'listing' && (
        <main className="workview">
          <div className="worktop">
            <button onClick={() => setView({ kind: 'home' })}>← {t.back}</button>
            <span className="fname" title={view.path}>
              {baseName(view.path)}
            </span>
            <span className="badge">{view.listing.format}</span>
            {view.listing.encrypted && <span className="badge warn">{t.encryptedBadge}</span>}
            {savingsPct(view.listing.totalSize, view.listing.archiveSize) > 0 && (
              <span className="badge ok">
                −{savingsPct(view.listing.totalSize, view.listing.archiveSize)} %
              </span>
            )}
            <span className="meta">
              {t.entries(view.listing.entries.length)} · {t.contentLabel}{' '}
              {fmtBytes(view.listing.totalSize)} · {t.archiveLabel}{' '}
              {fmtBytes(view.listing.archiveSize)}
            </span>
            {canEdit && (
              <>
                <span className="spacer" />
                {newFolderOpen ? (
                  <input
                    type="text"
                    className="newfolder"
                    autoFocus
                    placeholder={t.newFolderPlaceholder}
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') createFolder();
                      if (e.key === 'Escape') {
                        setNewFolderOpen(false);
                        setNewFolderName('');
                      }
                    }}
                    onBlur={() => {
                      setNewFolderOpen(false);
                      setNewFolderName('');
                    }}
                  />
                ) : (
                  <button
                    className="small"
                    onClick={() => setNewFolderOpen(true)}
                    disabled={busy}
                  >
                    {t.newFolder}
                  </button>
                )}
                <button className="small" onClick={() => addToArchive(false)} disabled={busy}>
                  {t.addFiles}
                </button>
                <button className="small" onClick={() => addToArchive(true)} disabled={busy}>
                  {t.addFolder}
                </button>
              </>
            )}
          </div>
          <div className="entry-table">
            <div className="entry-row head">
              <span
                className="c-check"
                title={t.selectAllTitle}
                onClick={() => {
                  const all = view.listing.entries;
                  setSelected((prev) =>
                    prev.size === all.length ? new Set() : new Set(all.map((e) => e.name))
                  );
                }}
              >
                {selected.size === view.listing.entries.length && selected.size > 0 ? '☑' : '☐'}
              </span>
              <span className="c-name">{t.colName}</span>
              <span className="c-size">{t.colSize}</span>
              <span className="c-size">{t.colPacked}</span>
            </div>
            <div className="entry-scroll">
              {view.listing.entries.map((e, i) => (
                <div
                  key={i}
                  className={`entry-row sel-row${selected.has(e.name) ? ' sel' : ''}`}
                  onClick={() => toggleEntry(e.name, e.isDir)}
                  onDoubleClick={() => {
                    if (!e.isDir && !busy) extractSelection([e.name], 1);
                  }}
                >
                  <span className="c-check">{selected.has(e.name) ? '☑' : '☐'}</span>
                  {renaming === e.name ? (
                    <input
                      type="text"
                      className="rename-input"
                      autoFocus
                      value={renameValue}
                      onChange={(ev) => setRenameValue(ev.target.value)}
                      onClick={(ev) => ev.stopPropagation()}
                      onDoubleClick={(ev) => ev.stopPropagation()}
                      onBlur={() => {
                        // Klick außerhalb übernimmt die Änderung — Abbruch nur per Escape
                        if (renameCancelRef.current) {
                          renameCancelRef.current = false;
                          return;
                        }
                        commitRename(e);
                      }}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter') {
                          ev.preventDefault();
                          commitRename(e);
                        }
                        if (ev.key === 'Escape') {
                          ev.preventDefault();
                          cancelRename();
                        }
                      }}
                    />
                  ) : (
                    <span className="c-name" title={e.name}>
                      {e.isDir ? '📁 ' : ''}
                      {e.name}
                      {e.encrypted ? ' 🔒' : ''}
                    </span>
                  )}
                  {canEdit && renaming !== e.name && (
                    <button
                      className="ghost small rowbtn"
                      title={t.renameEntry}
                      disabled={busy}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        startRename(e.name);
                      }}
                      onDoubleClick={(ev) => ev.stopPropagation()}
                    >
                      ✎
                    </button>
                  )}
                  <span className="c-size">{e.isDir ? t.dirLabel : fmtBytes(e.size)}</span>
                  <span className="c-size">{e.isDir ? '' : fmtBytes(e.compressedSize)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="hint-faint">{canEdit ? t.selectHintEdit : t.selectHint}</div>
          <div className="workbottom">
            {busy && progress?.phase === 'extract' ? (
              <div className="progresswrap">
                <div className="progressbar">
                  <div
                    className="fill"
                    style={{
                      width: `${Math.min(
                        100,
                        extractTotalRef.current > 0
                          ? (progress.done / extractTotalRef.current) * 100
                          : 50
                      )}%`,
                    }}
                  />
                </div>
                <span className="progresslabel">
                  {t.progressExtract} · {progress.done}/{extractTotalRef.current} ·{' '}
                  {baseName(progress.name)}
                </span>
              </div>
            ) : (
              <>
                {view.listing.encrypted && (
                  <input
                    type="password"
                    className="pwfield"
                    placeholder={t.passwordPlaceholder}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                )}
                {extractResult !== null && (
                  <span className="result-line">✓ {t.resultExtract(extractResult)}</span>
                )}
                <span className="spacer" />
                {lastOutput && (
                  <button onClick={() => api.revealPath(lastOutput)}>{t.revealBtn}</button>
                )}
                {selected.size > 0 ? (
                  <>
                    <button className="subtle" onClick={() => setSelected(new Set())}>
                      {t.clearSelection}
                    </button>
                    {canEdit && (
                      <button
                        className={armedDelete ? 'danger' : ''}
                        onClick={deleteSelected}
                        disabled={busy}
                      >
                        {armedDelete ? t.reallyDelete : t.deleteSelected(selected.size)}
                      </button>
                    )}
                    <button onClick={extractAll} disabled={busy}>
                      {t.extractAll}
                    </button>
                    <button
                      className="primary"
                      onClick={extractSelected}
                      disabled={busy || selectedFileCount === 0}
                    >
                      {t.extractSelected(selectedFileCount)}
                    </button>
                  </>
                ) : (
                  <button className="primary" onClick={extractAll} disabled={busy}>
                    {busy ? t.extracting : t.extractAll}
                  </button>
                )}
              </>
            )}
          </div>
        </main>
      )}

      {view.kind === 'create' && (
        <main className="workview">
          <div className="worktop">
            <button onClick={() => setView({ kind: 'home' })}>← {t.back}</button>
            <span className="fname">{t.createTitle}</span>
            <span className="meta">
              {t.items(sources.length)}
              {sources.length > 0 &&
                ` · ${fmtBytes(sources.reduce((sum, p) => sum + (stats[p]?.size ?? 0), 0))}`}
            </span>
            <span className="spacer" />
            <button onClick={() => addFiles(false)}>{t.addFiles}</button>
            <button onClick={() => addFiles(true)}>{t.addFolder}</button>
          </div>
          <div className="entry-table">
            <div className="entry-scroll">
              {sources.length === 0 && <div className="dropzone">{t.createEmpty}</div>}
              {sources.map((p) => (
                <div key={p} className="entry-row">
                  <span className="c-name" title={p}>
                    {stats[p]?.isDir ? '📁 ' : ''}
                    {baseName(p)}
                  </span>
                  <span className="c-path" title={p}>
                    {p}
                  </span>
                  <span className="c-size">
                    {stats[p] ? fmtBytes(stats[p].size) : '…'}
                  </span>
                  <button
                    className="ghost small"
                    title={t.remove}
                    onClick={() => setSources((prev) => prev.filter((x) => x !== p))}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
          {busy && progress?.phase === 'create' ? (
            <div className="workbottom">
              <div className="progresswrap">
                <div className="progressbar">
                  <div
                    className="fill"
                    style={{
                      width: `${Math.min(
                        100,
                        progress.total > 0 ? (progress.done / progress.total) * 100 : 50
                      )}%`,
                    }}
                  />
                </div>
                <span className="progresslabel">
                  {t.progressCreate} · {fmtBytes(progress.done)}/{fmtBytes(progress.total)} ·{' '}
                  {baseName(progress.name)}
                </span>
              </div>
            </div>
          ) : (
          <div className="workbottom create-opts">
            <label>
              <span className="fieldlabel">{t.formatLabel}</span>
              <select value={format} onChange={(e) => setFormat(e.target.value as CreateFormat)}>
                <option value="zip">ZIP</option>
                <option value="tar">TAR</option>
                <option value="tar.gz">tar.gz</option>
                <option value="tar.bz2">tar.bz2</option>
                <option value="tar.xz">tar.xz</option>
                <option value="tar.zst">tar.zst</option>
                <option value="gzip">gzip</option>
                <option value="bzip2">bzip2</option>
                <option value="xz">xz</option>
                <option value="zstd">zstd</option>
              </select>
            </label>
            <label>
              <span className="fieldlabel">{t.levelLabel}</span>
              <select value={level} onChange={(e) => setLevel(e.target.value as Level)}>
                <option value="fast">{t.levelFast}</option>
                <option value="balanced">{t.levelBalanced}</option>
                <option value="small">{t.levelSmall}</option>
                <option value="maximum">{t.levelMaximum}</option>
              </select>
            </label>
            {format === 'zip' && (
              <label className="grow">
                <span className="fieldlabel">{t.passwordCreateLabel}</span>
                <input
                  type="password"
                  value={createPw}
                  onChange={(e) => setCreatePw(e.target.value)}
                />
              </label>
            )}
            <span className="spacer" />
            {lastOutput && (
              <button onClick={() => api.revealPath(lastOutput)}>{t.revealBtn}</button>
            )}
            <button
              className="primary"
              onClick={doCreate}
              disabled={busy || sources.length === 0 || singleStreamBlocked}
            >
              {busy ? t.creating : t.createBtn}
            </button>
          </div>
          )}
          {createResult && !busy && (
            <div className="result-line">
              ✓ {t.resultCreate(
                createResult.files,
                fmtBytes(createResult.originalBytes),
                fmtBytes(createResult.packedBytes)
              )}{' '}
              {savingsPct(createResult.originalBytes, createResult.packedBytes) > 0 ? (
                <strong>
                  · {t.saves(savingsPct(createResult.originalBytes, createResult.packedBytes))}
                </strong>
              ) : (
                <span>
                  · {t.grows(-savingsPct(createResult.originalBytes, createResult.packedBytes))}
                </span>
              )}
            </div>
          )}
          {singleStreamBlocked && <div className="hint-line">{t.singleStreamHint}</div>}
        </main>
      )}

      {showUpdateModal && update !== 'unchecked' && update !== null && (
        <UpdateModal info={update} onToast={toast} onClose={() => setShowUpdateModal(false)} />
      )}

      <Help />
      {toastMsg && <div className={`toast${toastMsg.err ? ' error' : ''}`}>{toastMsg.msg}</div>}
    </div>
  );
}

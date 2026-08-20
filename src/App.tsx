import { useCallback, useEffect, useRef, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';
import { api, CreateFormat, Level, Listing, UpdateInfo } from './api';
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

  // create state
  const [sources, setSources] = useState<string[]>([]);
  const [format, setFormat] = useState<CreateFormat>('zip');
  const [level, setLevel] = useState<Level>('balanced');
  const [createPw, setCreatePw] = useState('');

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

  // Drag & Drop: Archive öffnen bzw. Dateien zur Packliste hinzufügen
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

  const extractAll = async () => {
    if (view.kind !== 'listing') return;
    const dest = await open({ directory: true, title: t.chooseDestTitle });
    if (typeof dest !== 'string') return;
    setBusy(true);
    try {
      const n = await api.extractArchive(view.path, dest, password || undefined);
      setLastOutput(dest);
      toast(t.extracted(n));
    } catch (err) {
      toast(`${t.extractError}: ${String(err)}`, true);
    } finally {
      setBusy(false);
    }
  };

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
    try {
      const n = await api.createArchive(
        dest,
        format,
        sources,
        level,
        format === 'zip' ? createPw || undefined : undefined
      );
      setLastOutput(dest);
      toast(t.created(n));
    } catch (err) {
      toast(`${t.createError}: ${String(err)}`, true);
    } finally {
      setBusy(false);
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
            <span className="meta">
              {t.entries(view.listing.entries.length)} · {fmtBytes(view.listing.totalSize)}
            </span>
          </div>
          <div className="entry-table">
            <div className="entry-row head">
              <span className="c-name">{t.colName}</span>
              <span className="c-size">{t.colSize}</span>
              <span className="c-size">{t.colPacked}</span>
            </div>
            <div className="entry-scroll">
              {view.listing.entries.map((e, i) => (
                <div key={i} className="entry-row">
                  <span className="c-name" title={e.name}>
                    {e.isDir ? '📁 ' : ''}
                    {e.name}
                    {e.encrypted ? ' 🔒' : ''}
                  </span>
                  <span className="c-size">{e.isDir ? t.dirLabel : fmtBytes(e.size)}</span>
                  <span className="c-size">{e.isDir ? '' : fmtBytes(e.compressedSize)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="workbottom">
            {view.listing.encrypted && (
              <input
                type="password"
                className="pwfield"
                placeholder={t.passwordPlaceholder}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
            <span className="spacer" />
            {lastOutput && (
              <button onClick={() => api.revealPath(lastOutput)}>{t.revealBtn}</button>
            )}
            <button className="primary" onClick={extractAll} disabled={busy}>
              {busy ? t.extracting : t.extractAll}
            </button>
          </div>
        </main>
      )}

      {view.kind === 'create' && (
        <main className="workview">
          <div className="worktop">
            <button onClick={() => setView({ kind: 'home' })}>← {t.back}</button>
            <span className="fname">{t.createTitle}</span>
            <span className="meta">{t.items(sources.length)}</span>
            <span className="spacer" />
            <button onClick={() => addFiles(false)}>{t.addFiles}</button>
            <button onClick={() => addFiles(true)}>{t.addFolder}</button>
          </div>
          <div className="entry-table">
            <div className="entry-scroll">
              {sources.length === 0 && <div className="empty-note">{t.createEmpty}</div>}
              {sources.map((p) => (
                <div key={p} className="entry-row">
                  <span className="c-name" title={p}>
                    {baseName(p)}
                  </span>
                  <span className="c-path" title={p}>
                    {p}
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

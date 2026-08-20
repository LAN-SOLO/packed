import { invoke } from '@tauri-apps/api/core';

/** Update found on GitHub Releases (latest.json), incl. the changelog notes. */
export interface UpdateInfo {
  version: string;
  notes: string | null;
  date: string | null;
}

export interface ArchiveEntry {
  name: string;
  size: number;
  compressedSize: number;
  isDir: boolean;
  encrypted: boolean;
}

export interface Listing {
  format: string;
  formatWritable: boolean;
  encrypted: boolean;
  entries: ArchiveEntry[];
  totalSize: number;
  archiveSize: number;
}

export interface CreateResult {
  files: number;
  originalBytes: number;
  packedBytes: number;
}

export interface PathStat {
  path: string;
  size: number;
  isDir: boolean;
}

export interface ProgressEvent {
  phase: 'create' | 'extract';
  done: number;
  total: number;
  name: string;
}

export type CreateFormat =
  | 'zip'
  | 'tar'
  | 'tar.gz'
  | 'tar.bz2'
  | 'tar.xz'
  | 'tar.zst'
  | 'gzip'
  | 'bzip2'
  | 'xz'
  | 'zstd';

export type Level = 'fast' | 'balanced' | 'small' | 'maximum';

export const api = {
  inspectArchive: (path: string) => invoke<Listing>('inspect_archive', { path }),
  extractArchive: (path: string, dest: string, password?: string) =>
    invoke<number>('extract_archive', { path, dest, password: password ?? null }),
  extractEntries: (path: string, dest: string, names: string[], password?: string) =>
    invoke<number>('extract_entries', {
      path,
      dest,
      names,
      password: password ?? null,
    }),
  createArchive: (
    dest: string,
    format: CreateFormat,
    sources: string[],
    level: Level,
    password?: string
  ) =>
    invoke<CreateResult>('create_archive', {
      dest,
      format,
      sources,
      level,
      password: password ?? null,
    }),
  statPaths: (paths: string[]) => invoke<PathStat[]>('stat_paths', { paths }),
  revealPath: (path: string) => invoke<void>('reveal_path', { path }),
  checkUpdate: () => invoke<UpdateInfo | null>('check_update'),
  installUpdate: () => invoke<void>('install_update'),
};

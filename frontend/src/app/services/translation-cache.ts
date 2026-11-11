import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { AppLang } from '../models/translation.model';
import { BERGAMOT_CACHE, PACK_INDEX_KEY, bergamotKey } from './bergamot-cache';
import {
  BERGAMOT_WASM,
  CatalogPack,
  LANGUAGE_PACKS,
  catalogPack,
} from './translation-catalog';

export interface InstalledPack {
  id: string;
  src: AppLang;
  tgt: AppLang;
  bytes: number;
  savedAt: number;
}

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

export function isZstd(bytes: Uint8Array): boolean {
  return ZSTD_MAGIC.every((byte, index) => bytes[index] === byte);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = bytes.slice();
  const digest = await crypto.subtle.digest('SHA-256', copy);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function decompressZstd(bytes: Uint8Array): Promise<Uint8Array> {
  const Stream = (
    globalThis as { DecompressionStream?: new (format: string) => ReadableWritablePair }
  ).DecompressionStream;
  if (typeof Stream === 'function') {
    try {
      const stream = new Blob([bytes.slice().buffer as ArrayBuffer])
        .stream()
        .pipeThrough(new Stream('zstd'));
      const out = new Uint8Array(await new Response(stream).arrayBuffer());
      if (out.byteLength > 0) return out;
    } catch (error) {
      console.warn('DecompressionStream zstd failed', error);
    }
  }
  const { decompress } = await import('fzstd');
  return decompress(bytes);
}

async function openCache(): Promise<Cache> {
  return caches.open(BERGAMOT_CACHE);
}

function readIndex(): InstalledPack[] {
  try {
    const raw = localStorage.getItem(PACK_INDEX_KEY);
    const parsed = raw ? (JSON.parse(raw) as InstalledPack[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeIndex(packs: InstalledPack[]): void {
  localStorage.setItem(PACK_INDEX_KEY, JSON.stringify(packs));
}

async function cacheHas(path: string): Promise<boolean> {
  const cache = await openCache();
  const match = await cache.match(bergamotKey(path));
  return !!match;
}

export async function readCached(path: string): Promise<ArrayBuffer | null> {
  const cache = await openCache();
  const match = await cache.match(bergamotKey(path));
  if (!match) return null;
  return match.arrayBuffer();
}

async function writeCached(path: string, bytes: Uint8Array): Promise<void> {
  const cache = await openCache();
  await cache.put(
    bergamotKey(path),
    new Response(bytes.slice().buffer as ArrayBuffer, {
      headers: { 'Content-Type': 'application/octet-stream' },
    }),
  );
}

export async function listInstalledPacks(): Promise<InstalledPack[]> {
  const index = readIndex();
  const kept: InstalledPack[] = [];
  for (const pack of index) {
    if (await cacheHas(`pack/${pack.id}/model`)) kept.push(pack);
  }
  if (kept.length !== index.length) writeIndex(kept);
  return kept;
}

export async function deleteInstalledPack(id: string): Promise<void> {
  const cache = await openCache();
  for (const fileType of ['model', 'lex', 'vocab']) {
    await cache.delete(bergamotKey(`pack/${id}/${fileType}`));
  }
  const next = readIndex().filter((pack) => pack.id !== id);
  writeIndex(next);
  if (!next.length) await cache.delete(bergamotKey('wasm/3.0'));
}

export async function wasmIsCached(): Promise<boolean> {
  return cacheHas('wasm/3.0');
}

/**
 * Overall progress for one file in a multi-file download.
 * A missing length returns null so the bar can stay indeterminate instead of stuck at 0.
 */
export function fileProgress(
  index: number,
  count: number,
  loaded: number,
  total: number,
): number | null {
  if (count <= 0 || total <= 0) return null;
  const frac = Math.max(0, Math.min(1, loaded / total));
  return (index + frac) / count;
}

/** Maps a raw download failure to a translation string key. */
export function downloadErrorKey(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const lower = raw.toLowerCase();
  if (
    lower.includes('checksum') ||
    lower.includes('hash') ||
    lower.includes('match the mozilla')
  ) {
    return 'notes.translate.checksumFailed';
  }
  return 'notes.translate.downloadFailed';
}

export type FetchBytes = (
  url: string,
  onFile: (loaded: number, total: number) => void,
) => Promise<Uint8Array>;

async function fetchBytesWeb(
  url: string,
  onFile: (loaded: number, total: number) => void,
): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }
  const total = Number(response.headers.get('content-length') || 0);
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    onFile(bytes.byteLength, bytes.byteLength);
    return bytes;
  }
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    loaded += value.byteLength;
    onFile(loaded, total || loaded);
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function base64ToBytes(data: string): Uint8Array {
  const binary = atob(data);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Android WebView pages are served from https://localhost. Mozilla's model CDN
 * does not send Access-Control-Allow-Origin, so fetch() fails before any byte
 * arrives and the bar stays at 0. The native download uses HttpURLConnection.
 */
async function fetchBytesNative(
  url: string,
  onFile: (loaded: number, total: number) => void,
): Promise<Uint8Array> {
  const path = `bergamot-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`;
  const handle = await Filesystem.addListener('progress', (status) => {
    if (status.url !== url) return;
    onFile(status.bytes, status.contentLength || 0);
  });
  try {
    const saved = await Filesystem.downloadFile({
      url,
      path,
      directory: Directory.Cache,
      recursive: true,
      progress: true,
    });
    if (saved.path) {
      try {
        const response = await fetch(Capacitor.convertFileSrc(saved.path));
        if (response.ok) {
          const bytes = new Uint8Array(await response.arrayBuffer());
          onFile(bytes.byteLength, bytes.byteLength);
          return bytes;
        }
      } catch (error) {
        console.warn('Reading the native download through the WebView failed', error);
      }
    }
    const file = await Filesystem.readFile({ path, directory: Directory.Cache });
    if (typeof file.data !== 'string') {
      throw new Error('Could not read the downloaded file');
    }
    const bytes = base64ToBytes(file.data);
    onFile(bytes.byteLength, bytes.byteLength);
    return bytes;
  } finally {
    await handle.remove();
    await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => undefined);
  }
}

async function fetchBytes(
  url: string,
  onFile: (loaded: number, total: number) => void,
): Promise<Uint8Array> {
  if (Capacitor.isNativePlatform()) return fetchBytesNative(url, onFile);
  return fetchBytesWeb(url, onFile);
}

async function deleteCached(path: string): Promise<void> {
  const cache = await openCache();
  await cache.delete(bergamotKey(path));
}

async function downloadVerified(
  file: { url: string; sha256: string },
  onFile: (loaded: number, total: number) => void,
  fetchImpl: FetchBytes,
): Promise<Uint8Array> {
  const downloaded = await fetchImpl(file.url, onFile);
  const raw = isZstd(downloaded) ? await decompressZstd(downloaded) : downloaded;
  const hash = await sha256Hex(raw);
  if (hash !== file.sha256) {
    throw new Error('Downloaded file did not match the Mozilla checksum');
  }
  return raw;
}

export async function downloadPacks(
  packs: readonly CatalogPack[],
  includeWasm: boolean,
  onProgress: (ratio: number | null) => void,
  fetchImpl: FetchBytes = fetchBytes,
): Promise<void> {
  const files: { path: string; url: string; sha256: string }[] = [];
  if (includeWasm) {
    files.push({ path: 'wasm/3.0', url: BERGAMOT_WASM.url, sha256: BERGAMOT_WASM.sha256 });
  }
  for (const pack of packs) {
    for (const file of pack.files) {
      files.push({
        path: `pack/${pack.id}/${file.fileType}`,
        url: file.url,
        sha256: file.sha256,
      });
    }
  }
  const written: string[] = [];
  try {
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const bytes = await downloadVerified(file, (loaded, total) => {
        onProgress(fileProgress(index, files.length, loaded, total));
      }, fetchImpl);
      await writeCached(file.path, bytes);
      written.push(file.path);
      onProgress((index + 1) / files.length);
    }
  } catch (error) {
    for (const path of written) await deleteCached(path);
    throw error;
  }
  const index = readIndex();
  const savedAt = Date.now();
  for (const pack of packs) {
    const entry: InstalledPack = {
      id: pack.id,
      src: pack.src,
      tgt: pack.tgt,
      bytes: pack.bytes,
      savedAt,
    };
    const existing = index.findIndex((item) => item.id === pack.id);
    if (existing >= 0) index[existing] = entry;
    else index.push(entry);
  }
  writeIndex(index);
}

export function packsForIds(ids: readonly string[]): CatalogPack[] {
  return ids
    .map((id) => catalogPack(id))
    .filter((pack): pack is CatalogPack => !!pack);
}

export async function missingPackIds(ids: readonly string[]): Promise<string[]> {
  const missing: string[] = [];
  for (const id of ids) {
    if (!LANGUAGE_PACKS.some((pack) => pack.id === id)) {
      missing.push(id);
      continue;
    }
    if (!(await cacheHas(`pack/${id}/model`))) missing.push(id);
  }
  return missing;
}

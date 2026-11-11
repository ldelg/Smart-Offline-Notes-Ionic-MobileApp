/** Separate from the Transformers.js cache so speech-model cleanup cannot delete packs. */
export const BERGAMOT_CACHE = 'bergamot-models';

export const PACK_INDEX_KEY = 'bergamot-pack-index';

export function bergamotKey(path: string): string {
  return `https://smartnotes.local/bergamot/${path}`;
}

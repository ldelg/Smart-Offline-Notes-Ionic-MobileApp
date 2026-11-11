import { isAppLang, AppLang } from '../models/translation.model';

/**
 * Whisper's translate-to-English task is gone. A saved `task: "translate"`
 * becomes transcribe, and auto-translate to English is turned on so new
 * notes still end up in English. An auto-translate choice already stored
 * (including off) is left as the user set it.
 */
export function resolveAutoTranslate(loaded: {
  task?: unknown;
  autoTranslateTo?: unknown;
}): AppLang | null {
  if (isAppLang(loaded.autoTranslateTo)) return loaded.autoTranslateTo;
  if (loaded.autoTranslateTo === null) return null;
  if (loaded.task === 'translate') return 'en';
  return null;
}

export function settingsNeedMigration(loaded: { task?: unknown }): boolean {
  return typeof loaded.task === 'string' && loaded.task !== 'transcribe';
}

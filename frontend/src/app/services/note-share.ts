import { Share } from '@capacitor/share';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return String(error ?? '');
}

/** A dismissed sheet, or a second share while Android still has one open. */
export function shareWasCancelled(error: unknown): boolean {
  if (
    error &&
    typeof error === 'object' &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  ) {
    return true;
  }
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes('cancel') ||
    message.includes('abort') ||
    message.includes('in progress')
  );
}

export async function copyText(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  if (typeof document === 'undefined') {
    throw new Error('Clipboard is not available');
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', 'true');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.left = '-9999px';
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(area);
  if (!copied) throw new Error('Clipboard is not available');
}

export interface SharePiece {
  heading: string;
  text: string;
  kind: 'original' | 'translation';
}

/** One original part is shared as plain text. Anything else is labelled. */
export function composeShareText(parts: readonly SharePiece[]): string {
  const usable = parts
    .map((part) => ({
      heading: part.heading.trim(),
      text: part.text.trim(),
      kind: part.kind,
    }))
    .filter((part) => part.text);
  if (!usable.length) return '';
  if (usable.length === 1 && usable[0].kind === 'original') return usable[0].text;
  return usable.map((part) => `${part.heading}\n${part.text}`).join('\n\n');
}

/**
 * Opens the native share sheet. When the platform cannot share, or the sheet
 * fails for a reason other than the user dismissing it, copies the text.
 */
export async function sharePlainText(options: {
  title: string;
  text: string;
  dialogTitle: string;
}): Promise<'shared' | 'copied' | 'cancelled'> {
  const text = options.text.trim();
  if (!text) throw new Error('Nothing to share');
  try {
    const available = await Share.canShare();
    if (!available.value) {
      await copyText(text);
      return 'copied';
    }
    await Share.share({
      title: options.title,
      text,
      dialogTitle: options.dialogTitle,
    });
    return 'shared';
  } catch (error) {
    if (shareWasCancelled(error)) return 'cancelled';
    try {
      await copyText(text);
      return 'copied';
    } catch {
      throw error instanceof Error ? error : new Error('Share failed');
    }
  }
}

import { Share } from '@capacitor/share';

export function shareWasCancelled(error: unknown): boolean {
  if (
    error &&
    typeof error === 'object' &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  ) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    message.includes('cancel') ||
    message.includes('User') ||
    message.toLowerCase().includes('abort')
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

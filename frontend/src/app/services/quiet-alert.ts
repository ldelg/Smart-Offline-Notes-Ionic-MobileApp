import { AlertOptions } from '@ionic/core';

/**
 * The Android WebView draws an orange focus ring around the alert wrapper.
 * Clearing the wrapper outline keeps the dialog edges quiet.
 */
export function quietAlert(options: AlertOptions): AlertOptions {
  const current = options.htmlAttributes ?? {};
  const currentStyle = current['style'];
  const style =
    currentStyle && typeof currentStyle === 'object'
      ? { ...currentStyle, outline: 'none' }
      : { outline: 'none' };
  return {
    ...options,
    htmlAttributes: { ...current, style },
  };
}

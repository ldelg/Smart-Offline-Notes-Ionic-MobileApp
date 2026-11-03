import { Injectable, effect, inject } from '@angular/core';
import { SettingsStore } from '../store/settings.store';

/** Applies Light, Dark, or the system appearance using Ionic's class palette. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly settings = inject(SettingsStore);
  private media?: MediaQueryList;

  constructor() {
    effect(() => {
      this.settings.theme();
      this.apply();
    });
  }

  private apply(): void {
    this.media?.removeEventListener('change', this.onSystemChange);
    const preference = this.settings.theme();
    let dark = false;
    if (preference === 'dark') {
      dark = true;
    } else if (preference === 'light') {
      dark = false;
    } else {
      this.media = window.matchMedia('(prefers-color-scheme: dark)');
      dark = this.media.matches;
      this.media.addEventListener('change', this.onSystemChange);
    }
    document.documentElement.classList.toggle('ion-palette-dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  }

  private readonly onSystemChange = (): void => {
    if (this.settings.theme() === 'system') this.apply();
  };
}

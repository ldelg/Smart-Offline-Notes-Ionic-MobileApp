import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslationStore } from '../store/translation.store';

@Pipe({ name: 'translate', pure: false, standalone: true })
export class TranslatePipe implements PipeTransform {
  private readonly translationStore = inject(TranslationStore);

  transform(key: string): string {
    if (!key) return '';
    try {
      const loading = (this.translationStore as any).loading?.() as
        | boolean
        | undefined;
      const translations = (this.translationStore as any).translations?.() as
        | Record<string, unknown>
        | undefined;
      if (loading || !translations || Object.keys(translations).length === 0) {
        return '';
      }
      return this.translationStore.t(key);
    } catch {
      return this.translationStore.t(key);
    }
  }
}

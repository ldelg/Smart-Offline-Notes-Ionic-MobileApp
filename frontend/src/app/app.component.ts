import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { SettingsStore } from './store/settings.store';
import { TranslationStore } from './store/translation.store';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  private readonly settings = inject(SettingsStore);
  private readonly translationStore = inject(TranslationStore);

  constructor() {
    try {
      this.translationStore.setLanguage(this.settings.uiLanguage());
    } catch (e) {}
  }
}

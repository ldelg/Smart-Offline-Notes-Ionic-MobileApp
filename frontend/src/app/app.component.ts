import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { DocumentInboxService } from './services/document-inbox';
import { ThemeService } from './services/theme.service';
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
  private readonly theme = inject(ThemeService);
  private readonly inbox = inject(DocumentInboxService);

  constructor() {
    void this.theme;
    try {
      this.translationStore.setLanguage(this.settings.uiLanguage());
    } catch (e) {}
    this.inbox.start();
  }
}

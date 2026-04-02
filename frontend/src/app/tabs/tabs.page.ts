import { Component, inject } from '@angular/core';
import {
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel,
} from '@ionic/angular/standalone';
import { RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { micOutline, albumsOutline, settingsOutline } from 'ionicons/icons';
import { TranslationStore } from '../store/translation.store';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  standalone: true,
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, RouterLink],
})
export class TabsPage {
  protected readonly translationStore = inject(TranslationStore);

  constructor() {
    addIcons({ micOutline, albumsOutline, settingsOutline });
  }
}

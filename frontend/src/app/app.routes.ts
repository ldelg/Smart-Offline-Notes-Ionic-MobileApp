import { Routes } from '@angular/router';
import { TabsPage } from './tabs/tabs.page';

export const routes: Routes = [
  {
    path: 'tabs',
    loadComponent: () => import('./tabs/tabs.page').then((m) => m.TabsPage),
    children: [
      {
        path: 'create',
        loadComponent: () =>
          import('./create/create.page').then((m) => m.CreatePage),
      },
      {
        path: 'notes',
        loadComponent: () =>
          import('./notes/notes.page').then((m) => m.NotesPage),
      },
      {
        path: '',
        redirectTo: 'create',
        pathMatch: 'full',
      },
    ],
  },
  { path: '', redirectTo: 'tabs/create', pathMatch: 'full' },
];

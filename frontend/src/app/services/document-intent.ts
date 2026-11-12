import { PluginListenerHandle, WebPlugin, registerPlugin } from '@capacitor/core';

export interface IncomingFile {
  name?: string;
  mime?: string;
  text?: string;
  base64?: string;
  size?: number;
  error?: string;
}

export interface IncomingDocuments {
  token?: string;
  text?: string;
  subject?: string;
  files?: IncomingFile[];
}

export interface DocumentIntentPlugin {
  getPending(): Promise<IncomingDocuments>;
  consume(options: { token: string }): Promise<void>;
  addListener(
    eventName: 'documents',
    listenerFunc: (payload: IncomingDocuments) => void,
  ): Promise<PluginListenerHandle>;
}

class DocumentIntentWeb extends WebPlugin {
  async getPending(): Promise<IncomingDocuments> {
    return { files: [] };
  }

  async consume(): Promise<void> {
    return;
  }
}

export const DocumentIntent = registerPlugin<DocumentIntentPlugin>('DocumentIntent', {
  web: () => new DocumentIntentWeb(),
});

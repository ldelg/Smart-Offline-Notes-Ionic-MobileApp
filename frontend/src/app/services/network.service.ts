import { Injectable, signal } from '@angular/core';
import { Network, ConnectionStatus } from '@capacitor/network';
import { Platform } from '@ionic/angular';

@Injectable({ providedIn: 'root' })
export class NetworkService {
  // Reactive signal for network status
  readonly isOnline = signal<boolean>(true);

  constructor(private platform: Platform) {
    this.initialize();
  }

  private async initialize() {
    // Get initial status
    await this.updateStatus();

    // Listen for network status changes
    if (this.platform.is('capacitor')) {
      // Use Capacitor Network plugin on mobile
      try {
        const status = await Network.getStatus();
        this.isOnline.set(status.connected);

        // Listen to network status changes
        Network.addListener('networkStatusChange', (status: ConnectionStatus) => {
          this.isOnline.set(status.connected);
        });
      } catch (error) {
        console.warn('Network plugin not available, using fallback:', error);
        this.setupFallback();
      }
    } else {
      // Use navigator.onLine fallback for web
      this.setupFallback();
    }
  }

  private setupFallback() {
    // Set initial status
    this.isOnline.set(navigator.onLine);

    // Listen to browser online/offline events
    window.addEventListener('online', () => {
      this.isOnline.set(true);
    });

    window.addEventListener('offline', () => {
      this.isOnline.set(false);
    });
  }

  private async updateStatus() {
    if (this.platform.is('capacitor')) {
      try {
        const status = await Network.getStatus();
        this.isOnline.set(status.connected);
      } catch (error) {
        // Fallback to navigator.onLine
        this.isOnline.set(navigator.onLine);
      }
    } else {
      this.isOnline.set(navigator.onLine);
    }
  }

  /**
   * Get current network status synchronously
   */
  getStatus(): boolean {
    return this.isOnline();
  }
}


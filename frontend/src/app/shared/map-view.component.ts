import { Component, OnInit, OnDestroy, Input, ViewChild, ElementRef, inject, signal } from '@angular/core';

import { ConfigService } from '../core/services/config.service';

/**
 * Simple map marker component. Renders a static Google Map with a single pin
 * at the given lat/lng coordinates.
 *
 * Usage:
 * ```html
 * <app-map-view [lat]="3.139" [lng]="101.6869" [zoom]="15" />
 * ```
 *
 * Falls back to a placeholder div when the API key is not configured or the
 * map fails to load.
 */
@Component({
    selector: 'app-map-view',
    host: { class: 'mv-host' },
    imports: [],
    template: `
    <div class="map-wrap">
      @if (!loaded()) {
        <div class="map-placeholder">
          <span class="map-icon">&#x1F4CD;</span>
          <span class="muted">Loading map…</span>
        </div>
      }
      @if (loadError()) {
        <div class="map-placeholder">
          <span class="map-icon">&#x1F4CD;</span>
          @if (lat && lng) {
            <span class="muted">Map unavailable</span>
            <a
              class="maps-link"
              [href]="mapsUrl()"
              target="_blank"
              rel="noopener noreferrer"
            >Open in Google Maps</a>
          } @else {
            <span class="muted">No location data</span>
          }
        </div>
      }
      <div #mapContainer class="map-container" [class.map-hidden]="!mapReady()"></div>
    </div>
  `,
    styles: [
        `
      :host { display: block; }
      .map-wrap {
        width: 100%;
        height: 180px;
        border-radius: var(--radius);
        overflow: hidden;
        border: 1px solid var(--color-border);
        background: var(--color-bg);
        position: relative;
      }
      .map-container {
        width: 100%;
        height: 100%;
      }
      .map-hidden { display: none; }
      .map-placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
        height: 100%;
        color: var(--color-muted);
        font-size: 0.85rem;
      }
      .map-icon { font-size: 1.5rem; }
      .maps-link {
        font-size: 0.8rem;
        color: var(--color-primary);
        text-decoration: underline;
        cursor: pointer;
      }
      .maps-link:hover { color: var(--color-primary-dark); }
    `,
    ]
})
export class MapViewComponent implements OnInit, OnDestroy {
  /** Latitude of the pin. */
  @Input() lat?: number | null;
  /** Longitude of the pin. */
  @Input() lng?: number | null;
  /** Zoom level (default 15). */
  @Input() zoom = 15;
  /** Optional label shown below the pin. */
  @Input() label?: string | null;

  loaded = signal(false);
  loadError = signal(false);
  mapReady = signal(false);

  @ViewChild('mapContainer', { static: false }) containerRef!: ElementRef<HTMLDivElement>;

  private config = inject(ConfigService);
  private map: google.maps.Map | null = null;
  private marker: google.maps.Marker | null = null;

  /** Max retries for key resolution (50 * 200ms = 10 seconds). */
  private static readonly KEY_RETRY_MAX = 50;
  private keyRetries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  /** Fallback link to open in Google Maps. */
  mapsUrl(): string {
    if (this.lat != null && this.lng != null) {
      return `https://www.google.com/maps/dir/?api=1&destination=${this.lat},${this.lng}`;
    }
    return 'https://www.google.com/maps';
  }

  ngOnInit(): void {
    this.loadMapsApi();
  }

  ngOnDestroy(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private loadMapsApi(): void {
    const key = this.config.googleMapsApiKey;
    if (!key) {
      if (this.keyRetries < MapViewComponent.KEY_RETRY_MAX) {
        this.keyRetries++;
        this.retryTimer = setTimeout(() => this.loadMapsApi(), 200);
        return;
      }
      this.loaded.set(true);
      this.loadError.set(true);
      return;
    }
    this.keyRetries = 0;

    if (typeof google !== 'undefined' && google.maps) {
      this.loaded.set(true);
      setTimeout(() => this.initMap(), 100);
      return;
    }

    // Shared script loading — prevent duplicate <script> tags from multiple instances
    if (!MapViewComponent._mapsLoading) {
      MapViewComponent._mapsLoading = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;
        script.async = true;
        script.defer = true;
        script.onload = () => {
          // Poll until google.maps is actually defined
          let polls = 0;
          const check = setInterval(() => {
            polls++;
            if (typeof google !== 'undefined' && google.maps) {
              clearInterval(check);
              resolve();
            } else if (polls > 50) {
              clearInterval(check);
              reject(new Error('Google Maps API timeout'));
            }
          }, 200);
        };
        script.onerror = () => reject(new Error('Google Maps script load failed'));
        document.head.appendChild(script);
      });
    }
    MapViewComponent._mapsLoading
      .then(() => { this.loaded.set(true); this.initMap(); })
      .catch(() => { this.loadError.set(true); this.loaded.set(true); });
  }
  private static _mapsLoading: Promise<void> | null = null;

  private initMap(): void {
    if (this.lat == null || this.lng == null) {
      this.loadError.set(true);
      this.mapReady.set(false);
      return;
    }

    const container = this.containerRef.nativeElement as HTMLDivElement;
    if (!container) {
      setTimeout(() => this.initMap(), 100);
      return;
    }

    const position = { lat: this.lat, lng: this.lng };

    try {
      this.map = new google.maps.Map(container, {
        center: position,
        zoom: this.zoom,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        styles: [
          {
            featureType: 'poi',
            elementType: 'labels',
            stylers: [{ visibility: 'off' }],
          },
        ],
      });

      this.marker = new google.maps.Marker({
        position,
        map: this.map,
        title: this.label ?? 'Service address',
        animation: google.maps.Animation.DROP,
      });

      this.mapReady.set(true);
    } catch {
      this.loadError.set(true);
    }
  }
}

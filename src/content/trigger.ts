import { S } from '../shared/strings';
import type { TriggerAnchor } from './selection';

const GAP = 4;

export interface ShadowHost { host: HTMLDivElement; shadow: ShadowRoot }

export function getSurface(shadow: ShadowRoot): HTMLDivElement {
  let surface = shadow.querySelector<HTMLDivElement>('[data-imen-surface]');
  if (surface) return surface;

  surface = document.createElement('div');
  surface.dataset.imenSurface = 'true';
  shadow.appendChild(surface);
  return surface;
}

/** Plain DOM rather than React: this runs on every page load, and a React root per tab is weight the button does not need. */
export function createShadowHost(): ShadowHost {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.top = '0';
  host.style.left = '0';
  host.style.width = '0';
  host.style.height = '0';
  host.style.zIndex = '2147483647';
  host.setAttribute('data-imen', 'root');

  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    [data-imen-surface], [data-imen-surface] * { box-sizing: border-box; font-family: system-ui, sans-serif; }
    [data-imen-surface] { all: initial; }
    .anchor { position: fixed; }
    button {
      cursor: pointer; border: 1px solid #1d4ed8; background: #2563eb; color: #fff;
      border-radius: 6px; padding: 4px 10px; font-size: 12px; line-height: 1.4;
      box-shadow: 0 2px 8px rgba(0,0,0,.25);
    }
    .toast {
      position: fixed; right: 16px; bottom: 16px; max-width: 280px;
      background: #111827; color: #fff; border-radius: 8px; padding: 10px 12px;
      font-size: 12px; line-height: 1.5; box-shadow: 0 4px 16px rgba(0,0,0,.3);
    }
  `;
  shadow.appendChild(style);
  getSurface(shadow);
  document.body.appendChild(host);

  return { host, shadow };
}

export interface Trigger {
  show(anchor: TriggerAnchor): void;
  hide(): void;
  destroy(): void;
}

export function mountTrigger(shadow: ShadowRoot, onClick: () => void): Trigger {
  const surface = getSurface(shadow);
  const anchorElement = document.createElement('div');
  anchorElement.className = 'anchor';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = S.content.triggerLabel;
  button.setAttribute('aria-label', S.content.triggerAria);
  // mousedown would clear the selection before the click handler reads it.
  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('click', onClick);

  function hide() {
    anchorElement.remove();
    button.remove();
  }

  return {
    show(anchor) {
      anchorElement.style.left = `${anchor.x}px`;
      anchorElement.style.top = `${anchor.y + GAP}px`;
      anchorElement.appendChild(button);
      surface.appendChild(anchorElement);
    },
    hide,
    destroy() {
      hide();
      button.removeEventListener('click', onClick);
    },
  };
}

export function showToast(shadow: ShadowRoot, message: string, ms = 5000): void {
  const surface = getSurface(shadow);
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  surface.appendChild(toast);
  setTimeout(() => toast.remove(), ms);
}

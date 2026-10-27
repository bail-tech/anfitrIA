import { captureEnabled } from './capture';

/**
 * Milliseconds for everything Blemi's screens react to: chat events are stamped with it and the
 * scene reads it every frame. Real time normally; synthesized in capture mode so shots are exact.
 */
let synthetic: number | null = null;
let checked = false;

export function nowMs(): number {
  if (!checked) {
    checked = true;
    if (captureEnabled()) synthetic = 0;
  }
  return synthetic ?? performance.now();
}

export function advanceClock(ms: number) {
  nowMs();
  if (synthetic !== null) synthetic += ms;
}

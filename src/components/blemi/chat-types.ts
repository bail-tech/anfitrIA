/**
 * The chat states Blemi's screens react to (Blemia's ChatState). AnfitrIA's assistant uses a
 * subset; `paying` and `out_of_credit` stay for the screens and capture previews.
 */
export type ChatState = 'idle' | 'listening' | 'thinking' | 'working' | 'paying' | 'approval' | 'done' | 'error' | 'out_of_credit';

/** Capture mode only (?capture&chatPreview=<preview>): a fixed state so every screen can be checked visually. */
export type ChatPreview = ChatState | 'searching' | 'reading' | 'paid' | 'talking';

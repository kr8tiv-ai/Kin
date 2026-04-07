/**
 * Ambient type declarations for @picovoice/porcupine-web.
 * Optional dependency — used by useWakeWord hook when NEXT_PUBLIC_PICOVOICE_ACCESS_KEY is set.
 * Dynamic-imported at runtime; this stub prevents TS2307 at compile time.
 */
declare module '@picovoice/porcupine-web' {
  export enum BuiltInKeyword {
    Alexa = 'Alexa',
    Americano = 'Americano',
    Blueberry = 'Blueberry',
    Bumblebee = 'Bumblebee',
    Computer = 'Computer',
    Grapefruit = 'Grapefruit',
    Grasshopper = 'Grasshopper',
    HeyGoogle = 'Hey Google',
    HeyBarista = 'Hey Barista',
    HeySiri = 'Hey Siri',
    Jarvis = 'Jarvis',
    OkGoogle = 'Ok Google',
    Picovoice = 'Picovoice',
    Porcupine = 'Porcupine',
    Terminator = 'Terminator',
  }

  export interface PorcupineDetection {
    index: number;
    label: string;
  }

  export class PorcupineWorker {
    static create(
      accessKey: string,
      keywords: Array<BuiltInKeyword | { base64: string; label?: string }>,
      detectionCallback: (detection: PorcupineDetection) => void,
    ): Promise<PorcupineWorker>;
    start(): Promise<void>;
    stop(): Promise<void>;
    release(): Promise<void>;
    readonly sampleRate: number;
    readonly frameLength: number;
    readonly version: string;
  }
}

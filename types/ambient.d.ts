/**
 * Ambient module declarations for optional/external packages
 * that are dynamically imported but not installed as dependencies.
 *
 * These stubs prevent TS2307 "Cannot find module" errors while
 * preserving the dynamic-import pattern used at runtime.
 */

declare module '@metaplex-foundation/umi-bundle-defaults' {
  export function createUmi(endpoint: string): any;
}

declare module '@metaplex-foundation/mpl-candy-machine' {
  export function mplCandyMachine(): any;
  export function mintV2(...args: any[]): any;
  export function fetchCandyMachine(...args: any[]): any;
  export function fetchCandyGuard(...args: any[]): any;
}

declare module '@metaplex-foundation/umi' {
  export function keypairIdentity(keypair: any): any;
  export function createSignerFromKeypair(umi: any, keypair: any): any;
  export function publicKey(address: string): any;
  export function generateSigner(umi: any): any;
  export function some(value: any): any;
  export function none(): any;
  export function transactionBuilder(): any;
}

declare module '@metaplex-foundation/mpl-toolbox' {
  export function setComputeUnitLimit(umi: any, params: any): any;
  export function transferSol(umi: any, params: any): any;
}

declare module '@metaplex-foundation/mpl-token-metadata' {
  export function mplTokenMetadata(): any;
  export function fetchDigitalAsset(umi: any, mint: any): Promise<any>;
  export function fetchAllDigitalAssetByOwner(umi: any, owner: any): Promise<any[]>;
  export function createNft(umi: any, params: any): any;
  export function verifyCollectionV1(umi: any, params: any): any;
  export function transferV1(umi: any, params: any): any;
}

declare module 'bs58' {
  const bs58: {
    decode(input: string): Uint8Array;
    encode(input: Uint8Array): string;
  };
  export default bs58;
}




declare module 'http-proxy-3' {
  import type { IncomingMessage, ServerResponse } from 'http';
  import type { Socket } from 'net';

  interface ProxyServerOptions {
    target?: string | { host: string; port: number };
    ws?: boolean;
    xfwd?: boolean;
    changeOrigin?: boolean;
    [key: string]: any;
  }

  interface ProxyServer {
    web(req: IncomingMessage, res: ServerResponse, opts?: ProxyServerOptions): void;
    ws(req: IncomingMessage, socket: Socket, head: Buffer, opts?: ProxyServerOptions): void;
    on(event: string, listener: (...args: any[]) => void): this;
    close(): void;
  }

  export function createProxyServer(opts?: ProxyServerOptions): ProxyServer;
}

declare module 'cloudflared' {
  /** Absolute path to the cloudflared binary */
  export const bin: string;
  /** Download and install cloudflared to the given path */
  export function install(bin: string): Promise<void>;
  /** Service management for cloudflared system service */
  export const service: {
    /** Install cloudflared as a system service with the given tunnel token */
    install(token: string): void;
  };
}

declare module '@picovoice/porcupine-web' {
  /** Built-in wake word keywords available without custom model training. */
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

  /** Detection result from Porcupine wake word engine. */
  export interface PorcupineDetection {
    /** Index of the detected keyword (0-based) */
    index: number;
    /** Label of the detected keyword */
    label: string;
  }

  /** Porcupine Web Worker for wake word detection in a web audio context. */
  export class PorcupineWorker {
    /**
     * Create a PorcupineWorker instance.
     * @param accessKey Picovoice access key
     * @param keywords Array of built-in keyword names or custom keyword objects
     * @param detectionCallback Callback invoked on wake word detection
     */
    static create(
      accessKey: string,
      keywords: Array<BuiltInKeyword | { base64: string; label?: string }>,
      detectionCallback: (detection: PorcupineDetection) => void,
    ): Promise<PorcupineWorker>;

    /** Start processing audio from the default microphone. */
    start(): Promise<void>;

    /** Stop processing audio. */
    stop(): Promise<void>;

    /** Release all resources held by the worker. */
    release(): Promise<void>;

    /** The sample rate expected by the engine (typically 16000). */
    readonly sampleRate: number;

    /** The frame length expected by the engine. */
    readonly frameLength: number;

    /** The Porcupine engine version. */
    readonly version: string;
  }
}

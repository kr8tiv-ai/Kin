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

declare module 'discord.js' {
  export class Client {
    constructor(options: any);
    user: any;
    guilds: any;
    login(token: string): Promise<string>;
    on(event: string, listener: (...args: any[]) => void): this;
    once(event: string, listener: (...args: any[]) => void): this;
    destroy(): Promise<void>;
  }
  export class REST {
    constructor(options?: any);
    setToken(token: string): this;
    put(route: string, options?: any): Promise<any>;
  }
  export class Routes {
    static applicationCommands(id: string): string;
  }
  export class SlashCommandBuilder {
    setName(name: string): this;
    setDescription(desc: string): this;
    addStringOption(fn: (option: any) => any): this;
    addBooleanOption(fn: (option: any) => any): this;
    toJSON(): any;
  }
  export class EmbedBuilder {
    setTitle(title: string): this;
    setDescription(desc: string): this;
    setColor(color: number): this;
    addFields(...fields: any[]): this;
    setFooter(footer: any): this;
    setTimestamp(): this;
  }
  export class ActionRowBuilder<T = any> {
    addComponents(...components: any[]): this;
  }
  export class ButtonBuilder {
    setCustomId(id: string): this;
    setLabel(label: string): this;
    setStyle(style: any): this;
    setEmoji(emoji: string): this;
  }
  export const ButtonStyle: Record<string, number>;
  export const GatewayIntentBits: Record<string, number>;
  export const Events: {
    readonly ClientReady: string;
    readonly InteractionCreate: string;
    readonly MessageCreate: string;
    readonly Warn: string;
    readonly Error: string;
  };
  export const Partials: Record<string, number>;
  export const ChannelType: Record<string, number>;
  export type Interaction = any;
  export type Message = any;
  export type ChatInputCommandInteraction = any;
}

declare module '@whiskeysockets/baileys' {
  export default function makeWASocket(config: any): any;
  export function useMultiFileAuthState(folder: string): Promise<any>;
  export const DisconnectReason: { loggedOut: number; [key: string]: number };
  export function fetchLatestBaileysVersion(): Promise<{ version: number[] }>;
  export function makeCacheableSignalKeyStore(keys: any, logger: any): any;
  export function getContentType(content: any): string | undefined;
  export function downloadMediaMessage(message: any, type: string, options?: any): Promise<Buffer>;
  export const proto: any;
  export namespace proto {
    type IWebMessageInfo = any;
  }
  export type WAMessageContent = any;
  export type WAMessageKey = any;
  export type WASocket = any;
  export type BaileysEventMap = any;
}

declare module '@hapi/boom' {
  export function isBoom(err: any): boolean;
  export class Boom extends Error {
    output: { statusCode: number; payload: any };
    constructor(message?: string, options?: any);
  }
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

declare module 'dockerode' {
  interface ContainerCreateOptions {
    Image?: string;
    name?: string;
    Cmd?: string[];
    Env?: string[];
    ExposedPorts?: Record<string, Record<string, never>>;
    HostConfig?: {
      CpuShares?: number;
      Memory?: number;
      PortBindings?: Record<string, Array<{ HostPort: string }>>;
      RestartPolicy?: { Name: string; MaximumRetryCount?: number };
      NetworkMode?: string;
      Binds?: string[];
    };
    Labels?: Record<string, string>;
    [key: string]: any;
  }

  interface ContainerInspectInfo {
    Id: string;
    Name: string;
    State: {
      Status: string;
      Running: boolean;
      Paused: boolean;
      Restarting: boolean;
      OOMKilled: boolean;
      Dead: boolean;
      Pid: number;
      ExitCode: number;
      Error: string;
      StartedAt: string;
      FinishedAt: string;
    };
    NetworkSettings: {
      Ports: Record<string, Array<{ HostIp: string; HostPort: string }> | null>;
    };
    Config: {
      Image: string;
      Labels: Record<string, string>;
    };
    [key: string]: any;
  }

  interface Container {
    id: string;
    start(): Promise<void>;
    stop(opts?: { t?: number }): Promise<void>;
    remove(opts?: { force?: boolean; v?: boolean }): Promise<void>;
    inspect(): Promise<ContainerInspectInfo>;
    stats(opts?: { stream?: boolean }): Promise<any>;
  }

  interface ImageInfo {
    Id: string;
    RepoTags: string[];
    [key: string]: any;
  }

  class Docker {
    constructor(opts?: { socketPath?: string; host?: string; port?: number; protocol?: string });
    createContainer(opts: ContainerCreateOptions): Promise<Container>;
    getContainer(id: string): Container;
    listContainers(opts?: { all?: boolean; filters?: any }): Promise<any[]>;
    ping(): Promise<string>;
    pull(image: string, opts?: any): Promise<NodeJS.ReadableStream>;
    modem: { followProgress(stream: any, onFinished: (err: any, output: any) => void): void };
  }

  export default Docker;
}

/**
 * alibabacloud-nls 官方包没有附带 TypeScript 类型声明，
 * 这里按实际使用的 API 补一份最小声明。
 */
declare module 'alibabacloud-nls' {
  export interface SpeechSynthesizerConfig {
    url: string;
    appkey: string;
    token: string;
  }

  export interface StartParams {
    voice: string;
    format?: string;
    sample_rate?: number;
    volume?: number;
    speech_rate?: number;
    pitch_rate?: number;
    enable_subtitle?: boolean;
    text?: string;
    [key: string]: unknown;
  }

  export class SpeechSynthesizer {
    constructor(config: SpeechSynthesizerConfig, enableRealTime?: boolean);

    defaultStartParams(voice?: string): StartParams;

    on(event: 'meta', handler: (message: string) => void): void;
    on(event: 'data', handler: (data: Buffer) => void): void;
    on(event: 'completed', handler: (message: string) => void): void;
    on(event: 'closed', handler: () => void): void;
    on(event: 'failed' | 'TaskFailed', handler: (message: string) => void): void;

    start(param: StartParams, enablePing?: boolean, pingInterval?: number): Promise<string>;

    shutdown(): void;
  }
}

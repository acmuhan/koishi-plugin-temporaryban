import { Context, Schema } from 'koishi';
export declare const name = "koishi-plugin-temporaryban";
export interface BadWordItem {
    code: string;
    word: string;
}
export interface WhitelistItem {
    userId: string;
}
export interface SmtpConfig {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    senderName: string;
    senderEmail: string;
    receivers: string[];
}
export interface ApiConfig {
    apiUrl: string;
    apiId: string;
    apiKey: string;
}
export interface GroupConfig {
    id: string;
    groupId: string;
    enable: boolean;
    detectionMethod: 'local' | 'api';
    localBadWordDict: string;
    whitelist: WhitelistItem[];
    triggerThreshold: number;
    triggerWindowMinutes: number;
    muteMinutes: number;
}
export interface Config {
    smtp: SmtpConfig;
    api: ApiConfig;
    groups: GroupConfig[];
}
export declare const Config: Schema<Config>;
export declare function apply(ctx: Context, config: Config): void;

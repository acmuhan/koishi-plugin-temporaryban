import { Context } from 'koishi';
import { Config, BadWordTable } from './config';
import { WhitelistTable } from './services/whitelist';
export * from './config';
export declare const name = "koishi-plugin-temporaryban";
export declare const inject: string[];
export interface IgnoredWordTable {
    id: number;
    groupId: string;
    word: string;
    createdAt: Date;
}
export interface ViolationTable {
    id: number;
    userId: string;
    groupId: string;
    words: string[];
    content: string;
    timestamp: Date;
}
declare module 'koishi' {
    interface Tables {
        temporaryban_badwords: BadWordTable;
        temporaryban_message_history: MessageHistoryTable;
        temporaryban_whitelist: WhitelistTable;
        temporaryban_ignored_words: IgnoredWordTable;
        temporaryban_violations: ViolationTable;
    }
    interface Context {
        console: any;
    }
}
export interface MessageHistoryTable {
    id: number;
    groupId: string;
    userId: string;
    content: string;
    timestamp: Date;
    messageId?: string;
}
export declare function apply(ctx: Context, config: Config): void;

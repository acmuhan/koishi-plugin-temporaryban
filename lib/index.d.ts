import { Context } from 'koishi';
import { Config, BadWordTable } from './config';
import { WhitelistTable } from './services/whitelist';
export * from './config';
export declare const name = "koishi-plugin-temporaryban";
export declare const inject: string[];
declare module 'koishi' {
    interface Tables {
        temporaryban_badwords: BadWordTable;
        temporaryban_message_history: MessageHistoryTable;
        temporaryban_whitelist: WhitelistTable;
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

import { Context } from 'koishi';
import { Config, BadWordTable } from './config';
export * from './config';
export declare const name = "koishi-plugin-temporaryban";
export declare const inject: string[];
declare module 'koishi' {
    interface Tables {
        temporaryban_badwords: BadWordTable;
    }
}
export declare function apply(ctx: Context, config: Config): void;

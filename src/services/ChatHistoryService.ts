import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ApiMessage } from '../provider';
import { Logger } from '../utils/logger';

/**
 * ChatHistoryService: 负责会话历史在硬盘上的存储、加载、列表和删除。
 * 与内存中的 HistoryManager 完全解耦，只处理文件 I/O。
 * 借鉴 opengravity-logic 的 chatCommand.ts 中关于 checkpoint 文件操作的逻辑。
 */
export class ChatHistoryService {
    private readonly SESSIONS_DIR_NAME = '.opengravity/sessions';

    constructor() {}

    private async getSessionsDirPath(): Promise<string | undefined> {
        const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!rootPath) {
            return undefined;
        }
        const sessionsDir = path.join(rootPath, this.SESSIONS_DIR_NAME);
        try {
            await fs.promises.mkdir(sessionsDir, { recursive: true });
            return sessionsDir;
        } catch (error) {
            Logger.error(`[OPGV] Failed to create sessions directory: ${error}`);
            return undefined;
        }
    }

    /**
     * 将当前会话历史保存为快照。
     * @param tag 快照标签。
     * @param history 要保存的 ApiMessage[] 数组。
     */
    async saveCheckpoint(tag: string, history: ApiMessage[]): Promise<boolean> {
        const sessionsDir = await this.getSessionsDirPath();
        if (!sessionsDir) return false;

        const filePath = path.join(sessionsDir, `${tag}.json`);
        try {
            // TODO: 未来可在此处添加 authType 等元数据
            const dataToSave = JSON.stringify({ history, timestamp: Date.now() }, null, 2);
            await fs.promises.writeFile(filePath, dataToSave, 'utf-8');
            Logger.info(`[OPGV] Session checkpoint saved: ${tag}`);
            return true;
        } catch (error) {
            Logger.error(`[OPGV] Failed to save session checkpoint '${tag}': ${error}`);
            return false;
        }
    }

    /**
     * 加载指定标签的会话快照。
     * @param tag 快照标签。
     * @returns 对应的 ApiMessage[] 数组，如果不存在则返回 undefined。
     */
    async loadCheckpoint(tag: string): Promise<{ history: ApiMessage[], timestamp: number } | undefined> {
        const sessionsDir = await this.getSessionsDirPath();
        if (!sessionsDir) return undefined;

        const filePath = path.join(sessionsDir, `${tag}.json`);
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const data = JSON.parse(content);
            Logger.info(`[OPGV] Session checkpoint loaded: ${tag}`);
            // TODO: 未来可在此处添加 authType 兼容性检查
            return { history: data.history, timestamp: data.timestamp };
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                Logger.warn(`[OPGV] Session checkpoint '${tag}' not found.`);
            } else {
                Logger.error(`[OPGV] Failed to load session checkpoint '${tag}': ${error}`);
            }
            return undefined;
        }
    }

    /**
     * 列出所有可用的会话快照。
     * @returns 包含 { tag, timestamp } 对象的数组。
     */
    async listCheckpoints(): Promise<{ tag: string, timestamp: number }[]> {
        const sessionsDir = await this.getSessionsDirPath();
        if (!sessionsDir) return [];

        try {
            const files = await fs.promises.readdir(sessionsDir);
            const checkpoints: { tag: string, timestamp: number }[] = [];
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const tag = path.basename(file, '.json');
                    const filePath = path.join(sessionsDir, file);
                    try {
                        const stats = await fs.promises.stat(filePath);
                        checkpoints.push({ tag, timestamp: stats.mtimeMs });
                    } catch (error) {
                        Logger.warn(`[OPGV] Failed to stat file '${filePath}': ${error}`);
                    }
                }
            }
            // 按时间倒序排列，最新的在前
            checkpoints.sort((a, b) => b.timestamp - a.timestamp);
            return checkpoints;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return []; // 目录不存在，没有快照
            }
            Logger.error(`[OPGV] Failed to list session checkpoints: ${error}`);
            return [];
        }
    }

    /**
     * 删除指定标签的会话快照。
     * @param tag 快照标签。
     * @returns 是否成功删除。
     */
    async deleteCheckpoint(tag: string): Promise<boolean> {
        const sessionsDir = await this.getSessionsDirPath();
        if (!sessionsDir) return false;

        const filePath = path.join(sessionsDir, `${tag}.json`);
        try {
            await fs.promises.unlink(filePath);
            Logger.info(`[OPGV] Session checkpoint deleted: ${tag}`);
            return true;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                Logger.warn(`[OPGV] Attempted to delete non-existent checkpoint: '${tag}'`);
                return true; // 即使文件不存在，也可以视为成功删除
            }
            Logger.error(`[OPGV] Failed to delete session checkpoint '${tag}': ${error}`);
            return false;
        }
    }
}

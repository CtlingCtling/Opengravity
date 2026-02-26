import * as vscode from 'vscode';
import * as path from 'path';
import { ApiMessage } from '../provider';
import { Logger } from '../utils/logger';

/**
 * ChatHistoryService: 负责会话历史在硬盘上的存储、加载、列表和删除。
 * [安全修复] 加入写入队列，防止并发写入导致文件损坏 (Issue 3)。
 */
export class ChatHistoryService {
    private readonly SESSIONS_DIR_NAME = '.opengravity/sessions';
    private _writeQueue: Promise<void> = Promise.resolve();

    constructor() {}

    private async getSessionsDirUri(): Promise<vscode.Uri | undefined> {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!root) { return undefined; }
        const sessionsDir = vscode.Uri.joinPath(root, this.SESSIONS_DIR_NAME);
        try {
            await vscode.workspace.fs.createDirectory(sessionsDir);
            return sessionsDir;
        } catch (error) {
            Logger.error(`[OPGV] Failed to ensure sessions directory: ${error}`);
            return undefined;
        }
    }

    /**
     * 将当前会话历史保存为快照。
     * 使用队列确保串行写入。
     */
    async saveCheckpoint(tag: string, history: ApiMessage[]): Promise<boolean> {
        // [修复] 将写入操作加入队列
        const result = new Promise<boolean>((resolve) => {
            this._writeQueue = this._writeQueue.then(async () => {
                const sessionsDirUri = await this.getSessionsDirUri();
                if (!sessionsDirUri) {
                    resolve(false);
                    return;
                }

                const fileUri = vscode.Uri.joinPath(sessionsDirUri, `${tag}.json`);
                try {
                    const dataToSave = JSON.stringify({ history, timestamp: Date.now() }, null, 2);
                    await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(dataToSave));
                    Logger.info(`[OPGV] Session checkpoint saved: ${tag}`);
                    resolve(true);
                } catch (error) {
                    Logger.error(`[OPGV] Failed to save session checkpoint '${tag}': ${error}`);
                    resolve(false);
                }
            });
        });
        return result;
    }

    /**
     * 加载指定标签的会话快照。
     */
    async loadCheckpoint(tag: string): Promise<{ history: ApiMessage[], timestamp: number } | undefined> {
        const sessionsDirUri = await this.getSessionsDirUri();
        if (!sessionsDirUri) { return undefined; }

        const fileUri = vscode.Uri.joinPath(sessionsDirUri, `${tag}.json`);
        try {
            const rawContent = await vscode.workspace.fs.readFile(fileUri);
            const data = JSON.parse(new TextDecoder().decode(rawContent));
            Logger.info(`[OPGV] Session checkpoint loaded: ${tag}`);
            return { history: data.history, timestamp: data.timestamp };
        } catch (error: any) {
            // 静默处理文件不存在的情况
            return undefined;
        }
    }

    /**
     * 列出所有可用的会话快照。
     */
    async listCheckpoints(): Promise<{ tag: string, timestamp: number }[]> {
        const sessionsDirUri = await this.getSessionsDirUri();
        if (!sessionsDirUri) { return []; }

        try {
            const entries = await vscode.workspace.fs.readDirectory(sessionsDirUri);
            const checkpoints: { tag: string, timestamp: number }[] = [];
            for (const [name, type] of entries) {
                if (type === vscode.FileType.File && name.endsWith('.json')) {
                    const tag = path.basename(name, '.json');
                    const fileUri = vscode.Uri.joinPath(sessionsDirUri, name);
                    try {
                        const stats = await vscode.workspace.fs.stat(fileUri);
                        checkpoints.push({ tag, timestamp: stats.mtime });
                    } catch (error) {
                        Logger.warn(`[OPGV] Failed to stat file '${name}': ${error}`);
                    }
                }
            }
            checkpoints.sort((a, b) => b.timestamp - a.timestamp);
            return checkpoints;
        } catch (error: any) {
            return [];
        }
    }

    /**
     * 删除指定标签的会话快照。
     */
    async deleteCheckpoint(tag: string): Promise<boolean> {
        const sessionsDirUri = await this.getSessionsDirUri();
        if (!sessionsDirUri) { return false; }

        const fileUri = vscode.Uri.joinPath(sessionsDirUri, `${tag}.json`);
        try {
            await vscode.workspace.fs.delete(fileUri);
            Logger.info(`[OPGV] Session checkpoint deleted: ${tag}`);
            return true;
        } catch (error: any) {
            return false;
        }
    }
}

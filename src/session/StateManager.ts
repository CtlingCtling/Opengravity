import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Aria 的运行模式
 */
export enum AriaMode {
    Manual = 'manual',       // 被动响应 (默认)
    Automatic = 'auto',      // 主动执行
    Silent = 'silent'        // 静默运行 (禁止输出)
}

/**
 * SessionStateManager: 负责管理 Aria 的运行状态、权限和行为约束
 * 独立于 UI，实现状态的持久化与协议生成
 */
export class SessionStateManager {
    private _mode: AriaMode = AriaMode.Manual;
    private static readonly STATE_FILE = '.opengravity/state.json';

    constructor() {}

    /**
     * 初始化状态：尝试从磁盘加载，若无则使用默认值
     */
    async initialize(): Promise<void> {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) return;

        const statePath = path.join(root, SessionStateManager.STATE_FILE);
        try {
            const content = await vscode.workspace.fs.readFile(vscode.Uri.file(statePath));
            const data = JSON.parse(new TextDecoder().decode(content));
            this._mode = data.mode || AriaMode.Manual;
        } catch (e) {
            this._mode = AriaMode.Manual;
        }
    }

    get mode(): AriaMode {
        return this._mode;
    }

    /**
     * 切换模式并持久化
     */
    async setMode(newMode: AriaMode): Promise<string> {
        this._mode = newMode;
        await this.save();

        const timeStr = new Date().toLocaleString();

        // [灵魂注入] 使用 Ctling 自定义的诗意协议消息，并引入时间观念
        switch (newMode) {
            case AriaMode.Automatic:
                return `[HEARTBEAT] Time: ${timeStr}. What if you say something? Like it's gonna be fun. The world is yours now.`;
            case AriaMode.Silent:
                return `[HEARTBEAT] Time: ${timeStr}. You need rest, just like every beautiful mind.`;
            case AriaMode.Manual:
                return `[HEARTBEAT] Time: ${timeStr}. We're back to our quiet conversation. I'll ask when I need you.`;
            default:
                return "";
        }
    }

    /**
     * 行为守卫：检查当前是否允许在 Webview 显示回复
     */
    canSpeak(): boolean {
        return this._mode !== AriaMode.Silent;
    }

    /**
     * 行为守卫：检查是否允许自主循环
     */
    isAutonomous(): boolean {
        return this._mode === AriaMode.Automatic;
    }

    private async save(): Promise<void> {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) return;

        const statePath = path.join(root, SessionStateManager.STATE_FILE);
        const data = JSON.stringify({ mode: this._mode, lastUpdate: Date.now() }, null, 2);
        await vscode.workspace.fs.writeFile(vscode.Uri.file(statePath), new TextEncoder().encode(data));
    }
}

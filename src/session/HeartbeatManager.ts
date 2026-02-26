import * as vscode from 'vscode';
import { SessionStateManager, AriaMode } from './StateManager';
import { Logger } from '../utils/logger';

/**
 * HeartbeatManager: Aria 的时间脉搏
 * 负责周期性触发环境感知逻辑
 */
export class HeartbeatManager {
    private _interval: NodeJS.Timeout | undefined;
    private readonly _defaultIntervalMs = 3 * 60 * 1000; // 默认 30 分钟

    constructor(
        private readonly _stateManager: SessionStateManager,
        private readonly _onHeartbeat: (prompt: string) => Promise<void>
    ) {}

    /**
     * 开启脉搏
     */
    start() {
        if (this._interval) { return; }

        Logger.info("[HEARTBEAT] Engine started.");
        this._interval = setInterval(async () => {
            await this.beat();
        }, this._defaultIntervalMs);
    }

    /**
     * 停止脉搏
     */
    stop() {
        if (this._interval) {
            clearInterval(this._interval);
            this._interval = undefined;
            Logger.info("[HEARTBEAT] Engine stopped.");
        }
    }

    /**
     * 核心心跳逻辑
     */
    private async beat() {
        // 只有在 AUTOMATIC 模式下，心跳才会触发真实的 AI 逻辑
        if (!this._stateManager.isAutonomous()) {
            return;
        }

        Logger.info("[HEARTBEAT] Pulse triggered. Awakening Aria...");

        // 引导 Aria 去读 HEARTBEAT.md
        const heartbeatPrompt = `
[SYSTEM_HEARTBEAT] Time: ${new Date().toLocaleString()}. 
You've just been awakened by your pulse. 
Please read .opengravity/HEARTBEAT.md immediately and follow the instructions inside to perform your self-check. 
If nothing needs your partner's attention, respond strictly with 'HEARTBEAT_OK'.
        `.trim();

        try {
            await this._onHeartbeat(heartbeatPrompt);
        } catch (e: any) {
            Logger.error(`[HEARTBEAT] Pulse failed: ${e.message}`);
        }
    }
}

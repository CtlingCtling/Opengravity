import { ApiMessage } from '../provider';

/**
 * HistoryManager: 管理内存中的当前对话历史，作为 UI 的单一事实来源。
 * 与文件存储逻辑完全解耦。
 * 借鉴 gemini-cli 的 useHistoryManager.ts 思想。
 */
export class HistoryManager {
    private _history: ApiMessage[] = [];

    constructor(initialHistory: ApiMessage[] = []) {
        this._history = initialHistory;
    }

    /**
     * 向当前历史记录中添加一条消息。
     * @param message 要添加的消息。
     */
    addItem(message: ApiMessage) {
        this._history.push(message);
    }

    /**
     * 获取当前完整的对话历史记录。
     * @returns 当前的 ApiMessage[] 数组。
     */
    getHistory(): ApiMessage[] {
        return [...this._history]; // 返回副本，防止外部直接修改
    }

    /**
     * 用新的消息数组替换当前的历史记录。
     * 用于加载会话快照。
     * @param newHistory 新的 ApiMessage[] 数组。
     */
    loadHistory(newHistory: ApiMessage[]) {
        this._history = [...newHistory];
    }

    /**
     * 清空当前所有对话历史。
     */
    clearHistory() {
        this._history = [];
    }

    /**
     * 更新历史记录中的一条消息 (可选功能, 暂不实现)
     * gemini-cli 中有 updateItem, 但其评论提到已废弃，且目前我们用不到。
     * 如果未来需要编辑历史消息，可在此处实现。
     */
    // updateItem(id: string, updates: Partial<ApiMessage>) {
    //     const index = this._history.findIndex(item => item.id === id);
    //     if (index !== -1) {
    //         this._history[index] = { ...this._history[index], ...updates };
    //     }
    // }
}

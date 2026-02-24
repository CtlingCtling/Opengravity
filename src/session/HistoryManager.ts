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
    /**
     * 全量协议自愈逻辑 (The Great Healer)
     * 扫描整个历史记录，修复所有不符合 [assistant(tool_calls) -> tool(result)] 规范的片段。
     * 这能彻底解决由于历史记录中存在“断头工具调用”而导致的 API 400 错误。
     */
    getSanitizedHistory(): ApiMessage[] {
        const sanitized: ApiMessage[] = [];
        const history = this._history;

        for (let i = 0; i < history.length; i++) {
            const current = history[i];
            sanitized.push(current);

            // 如果当前消息是 AI 发起的工具调用
            if (current.role === 'assistant' && current.tool_calls && current.tool_calls.length > 0) {
                // 检查下一条消息是否是对应的工具结果
                const next = history[i + 1];
                
                // 如果没有下一条，或者下一条不是 tool 角色，或者 ID 不匹配
                // 我们必须在这里插入“伪造”的错误结果来闭合协议链
                const hasResults = next && next.role === 'tool';
                
                if (!hasResults) {
                    current.tool_calls.forEach(tc => {
                        sanitized.push({
                            role: 'tool',
                            tool_call_id: tc.id,
                            content: "[REPAIR] This tool execution was interrupted. Protocol chain restored."
                        });
                    });
                }
            }
        }
        return sanitized;
    }

    /**
     * 更新最后一条消息的内容。
     * 用于在用户采纳/拒绝后，修改 Tool 消息的状态。
     */
    updateLastMessage(content: string) {
        if (this._history.length > 0) {
            this._history[this._history.length - 1].content = content;
        }
    }
}

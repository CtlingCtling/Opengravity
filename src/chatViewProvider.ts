import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AIProvider, ApiMessage } from './provider';
import { McpHost } from './mcp/mcpHost';
import { ToolExecutor } from './tools/executor';
import { OPGV_TOOLS } from './tools/definitions';
import { Logger } from './utils/logger';
import { CommandDispatcher } from './commands/CommandDispatcher';
import { HistoryManager } from './session/HistoryManager'; // 引入 HistoryManager
import { ChatHistoryService } from './services/ChatHistoryService'; // 引入 ChatHistoryService
import { DiffContentProvider } from './utils/diffProvider';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'opengravity.chatView';
    private _view?: vscode.WebviewView;
    private _recursionDepth = 0;
    private static MAX_RECURSION_DEPTH = 5;
    private _commandDispatcher: CommandDispatcher;
    private _historyManager: HistoryManager; // 使用 HistoryManager 管理内存状态
    private _chatHistoryService: ChatHistoryService; // 使用 ChatHistoryService 管理持久化
    private _pendingDiff?: { originalUri: vscode.Uri, newContent: string, diffUri: vscode.Uri }; // 挂起的 Diff
    private _isWaitingForApproval = false; // 审批锁
    private _isProcessing = false; // [新增] 全局处理锁：防止协议冲突

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _getAIProvider: () => AIProvider | null,
        private readonly _mcpHost: McpHost,
        private readonly _systemPrompt: string
    ) {
        this._commandDispatcher = new CommandDispatcher();
        this._historyManager = new HistoryManager(); // 初始化内存状态
        this._chatHistoryService = new ChatHistoryService(); // 初始化持久化服务
    }

    public async resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        
        // 加载最后会话历史
        const lastSession = await this._chatHistoryService.loadCheckpoint('session_history');
        if (lastSession && lastSession.history) {
            this._historyManager.loadHistory(lastSession.history);
        }

        webviewView.webview.options = { enableScripts: true, localResourceRoots: [this._extensionUri] };
        webviewView.webview.html = await this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'webviewLoaded':
                    const currentHistory = this._historyManager.getHistory();
                    if (currentHistory.length > 0) {
                        this._postWebviewMessage('restoreHistory', currentHistory.filter(m => (m.role === 'user' || m.role === 'assistant') && m.content).map(m => ({ role: m.role === 'assistant' ? 'ai' : 'user', content: m.content || "" })));
                    }
                    break;
                case 'userInput':
                    if (this._isProcessing) return;
                    await this.handleUserMessage(data.value);
                    break;
                case 'saveAndClear':
                    await this.handleSaveAndClear();
                    break;
// ...
                case 'linkActiveFile':
                    await this.handleLinkActiveFile();
                    break;
                case 'saveAndClear':
                    await this.handleSaveAndClear();
                    break;
                case 'insertCode':
                    const editor = vscode.window.activeTextEditor;
                    if (editor) {
                        editor.edit(b => b.insert(editor.selection.active, data.value));
                    }
                    break;
                case 'applyLastDiff':
                    await this.handleApplyDiff();
                    break;
                case 'cancelLastDiff':
                    await this.handleCancelDiff();
                    break;
                case 'runTerminal':
                    const t = vscode.window.activeTerminal || vscode.window.createTerminal("OPGV");
                    t.show(); t.sendText(data.value);
                    break;
                case 'fillInput':
                    break;
            }
        });
    }

    /**
     * 处理“采纳修改” (对外公开接口)
     */
    public async handleApplyDiff() {
        if (this._pendingDiff) {
            try {
                // 1. 执行写文件
                const encoder = new TextEncoder();
                await vscode.workspace.fs.writeFile(this._pendingDiff.originalUri, encoder.encode(this._pendingDiff.newContent));
                
                // 2. 清理状态
                DiffContentProvider.clear(this._pendingDiff.diffUri);
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                
                // 3. [关键修复] 更新历史记录中的 Tool 消息，而不是添加 User 消息
                // 这保证了协议顺序：assistant (tool_calls) -> tool (SUCCESS) -> assistant
                const successMsg = `[SUCCESS] User APPROVED and applied the changes to \`${path.basename(this._pendingDiff.originalUri.fsPath)}\`.`;
                this._historyManager.updateLastMessage(successMsg);
                
                this._isWaitingForApproval = false;
                vscode.commands.executeCommand('setContext', 'opengravity.diffVisible', false);
                this._pendingDiff = undefined;

                vscode.window.showInformationMessage('✅ 修改已应用。');

                // 4. 触发 AI 自动执行下一步 (此时 AI 会看到 SUCCESS 状态)
                await this.handleUserMessage("", true);
            } catch (err: any) {
                vscode.window.showErrorMessage(`应用修改失败: ${err.message}`);
            }
        }
    }

    /**
     * 处理“拒绝修改” (对外公开接口)
     */
    public async handleCancelDiff() {
        if (this._pendingDiff) {
            DiffContentProvider.clear(this._pendingDiff.diffUri);
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            
            // [关键修复] 更新 Tool 消息为 REJECTED
            const rejectMsg = `[REJECTED] User declined the changes to \`${path.basename(this._pendingDiff.originalUri.fsPath)}\`.`;
            this._historyManager.updateLastMessage(rejectMsg);

            this._isWaitingForApproval = false;
            vscode.commands.executeCommand('setContext', 'opengravity.diffVisible', false);
            this._pendingDiff = undefined;

            // 触发 AI 重新思考 (此时 AI 会看到 REJECTED 状态)
            await this.handleUserMessage("", true);
        }
    }

    private async handleUserMessage(content: string, isToolResponse: boolean = false) {
        if (!this._view) {
            return;
        }
        const provider = this._getAIProvider();
        if (!provider) {
            this._postWebviewMessage('error', 'API key missing');
            return;
        }

        // --- 指令拦截钩子 ---
        if (!isToolResponse && content) {
            const dispatchResult = await this._commandDispatcher.dispatch(
                content,
                provider,
                this._mcpHost,
                this._view.webview,
                this._extensionUri,
                async (fakeMsg) => {
                    // 用于注入合成消息的回调逻辑（TOML用）
                    this._historyManager.addItem({ role: 'user', content: fakeMsg });
                    await this.handleUserMessage("", true);
                },
                this._historyManager,
                this._chatHistoryService,
                this // 传入 ChatViewProvider 实例
            );

            // 如果指令已执行并被消费，则停止后续 AI 流
            if (dispatchResult) {
                if (dispatchResult.status === 'error') {
                    this._postWebviewMessage('error', dispatchResult.message);
                }
                return;
            }
        }
        // ------------------

        if (isToolResponse) {
            this._recursionDepth++;
        } else {
            this._recursionDepth = 0;
        }

        if (this._recursionDepth > ChatViewProvider.MAX_RECURSION_DEPTH) {
            const errMessage = `[OPGV] Recursion depth exceeded (${ChatViewProvider.MAX_RECURSION_DEPTH}). Stopping tool auto-resuming to prevent infinite loops.`;
            Logger.error(errMessage);
            this._postWebviewMessage('error', 'Maximum recursion depth reached. Possible infinite tool execution loop.');
            this._recursionDepth = 0;
            return;
        }

        await this._ensureSystemPrompt();
        if (content && !isToolResponse) {
            this._historyManager.addItem({ role: 'user', content });
        }

        this._isProcessing = true; // 锁定输入

        try {
            this._postWebviewMessage('streamStart', undefined);
            const allTools = await this._getAvailableTools();
            
            // [关键修复] 获取经过协议自愈的历史记录，防止 400 错误
            const sanitizedHistory = this._historyManager.getSanitizedHistory();
            
            const aiResponse = await this._getAIResponse(provider, sanitizedHistory, allTools);

            this._historyManager.addItem(aiResponse);
            this._postWebviewMessage('streamEnd', undefined);
            
            // 自动保存当前进度
            await this._chatHistoryService.saveCheckpoint('session_history', this._historyManager.getHistory());

            if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
                await this._executeToolCalls(aiResponse.tool_calls);
                
                // 检查是否正在等待用户审批。如果是，则中断递归。
                if (this._isWaitingForApproval) {
                    Logger.info("[OPGV] Truncating auto-resume loop: Waiting for user approval on code changes.");
                    vscode.commands.executeCommand('setContext', 'opengravity.diffVisible', true);
                    return; 
                }

                Logger.info("[OPGV] All tools done. Auto-resuming...");
                await this.handleUserMessage("", true);
            }
        } catch (err: any) { 
            this._handleProcessingError(err);
        } finally {
            this._isProcessing = false; // [关键修复] 无论成功失败，必须释放锁
        }
    }

    private _postWebviewMessage(type: string, value: any, dataType?: string) {
        if (this._view) {
            this._view.webview.postMessage({ type, value, dataType });
        }
    }

    private _handleProcessingError(err: any) {
        Logger.error("[OPGV] Error in handleUserMessage: ", err);
        this._postWebviewMessage('error', err.message || 'An unknown error occurred.');
    }

    /**
     * 外部接口：强制刷新系统提示词（用于 /memory refresh）
     */
    public async refreshSystemPrompt() {
        this._historyManager.clearHistory();
        await this._ensureSystemPrompt();
        await this._chatHistoryService.saveCheckpoint('session_history', this._historyManager.getHistory());
        this._postWebviewMessage('clearView', undefined);
        this._postWebviewMessage('restoreHistory', [{ role: 'ai', content: '✅ **系统记忆已刷新**\n\n已重新加载 GEMINI.md 和 MCP 协议上下文。' }]);
    }

    private async handleLinkActiveFile() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const prompt = `[CONTEXT: \`${path.basename(editor.document.fileName)}\`]\n\`\`\`\n${editor.document.getText()}\n\`\`\`\n\n`;
        this._postWebviewMessage('fillInput', prompt);
    }

    private async handleSaveAndClear() {
        const currentHistory = this._historyManager.getHistory();
        if (currentHistory.length <= 1) {
            return;
        }
        
        // 使用 ChatHistoryService 保存并清空
        const saveTag = `archive_${Date.now()}`;
        await this._chatHistoryService.saveCheckpoint(saveTag, currentHistory);
        await this._chatHistoryService.deleteCheckpoint('session_history');
        
        this._historyManager.clearHistory();
        this._postWebviewMessage('clearView', undefined);
        
        vscode.window.showInformationMessage(`会话已保存为 ${saveTag} 并清空。`);
    }

    // 辅助方法重构
    private async _ensureSystemPrompt() {
        if (this._historyManager.getHistory().length === 0) {
            let systemContent = this._systemPrompt;
            
            const mcpPrompts = await this._mcpHost.getPromptsForAI();
            if (mcpPrompts.length > 0) {
                systemContent += "\n\n## Available MCP Prompts:\n";
                mcpPrompts.forEach(p => {
                    systemContent += `- [${p.serverName}] ${p.name}: ${p.description}\n`;
                });
            }

            const mcpResources = await this._mcpHost.getResourcesForAI();
            if (mcpResources.length > 0) {
                systemContent += "\n\n## Available MCP Resources:\n";
                mcpResources.forEach(r => {
                    systemContent += `- [${r.serverName}] ${r.name} (URI: ${r.uri}): ${r.description}\n`;
                });
            }

            this._historyManager.addItem({ role: 'system', content: systemContent });
        }
    }

    private async _storeUserMessage(content: string) {
        this._historyManager.addItem({ role: 'user', content });
        await this._chatHistoryService.saveCheckpoint('session_history', this._historyManager.getHistory());
    }

    private async _getAvailableTools(): Promise<any[]> {
        const mcpTools = await this._mcpHost.getToolsForAI();
        const opgvTools = OPGV_TOOLS;
        return [...mcpTools, ...opgvTools];
    }

    private async _getAvailablePrompts(): Promise<any[]> {
        return await this._mcpHost.getPromptsForAI();
    }

    private async _getAIResponse(provider: AIProvider, messages: ApiMessage[], allTools: any[]): Promise<ApiMessage> {
        return await provider.generateContentStream(
            messages,
            (update) => {
                this._postWebviewMessage(
                    'streamUpdate',
                    update.delta,
                    update.type
                );
            },
            allTools
        );
    }

    private async _executeToolCalls(toolCalls: any[]) {
        this._postWebviewMessage(
            'streamUpdate', 
            `\n\n> 🔧 **OPGV Action:** Executing ${toolCalls.length} tools...\n`, 
            'content'
        );
        for (const toolCall of toolCalls) {
            let result = "";
            const funcName = toolCall.function.name;
            let args;
            try {
                args = JSON.parse(toolCall.function.arguments);
            } catch (e: any) {
                Logger.error(`[OPGV] Error parsing tool call arguments for ${funcName}:`, e);
                result = JSON.stringify({
                    error: `Failed to parse arguments for tool '${funcName}'. Error: ${e.message}`,
                    rawArguments: toolCall.function.arguments
                });
                this._historyManager.addItem({ role: 'tool', tool_call_id: toolCall.id, content: result });
                continue; 
            }
            if (funcName === 'read_file') {
                result = await ToolExecutor.read_file(args);
            } else if (funcName === 'write_file') {
                result = await ToolExecutor.write_file(args);
            } else if (funcName === 'replace') {
                // [Surgical Edit 联动] 标记进入审批锁定状态
                this._isWaitingForApproval = true;
                
                const fullPath = (ToolExecutor as any).getSafePath(args.path);
                if (fullPath) {
                    try {
                        const content = await fs.promises.readFile(fullPath, 'utf-8');
                        const firstIndex = content.indexOf(args.old_string);
                        if (firstIndex !== -1 && content.lastIndexOf(args.old_string) === firstIndex) {
                            const newContent = content.slice(0, firstIndex) + args.new_string + content.slice(firstIndex + args.old_string.length);
                            const uri = vscode.Uri.file(fullPath);
                            
                            // 使用 DiffContentProvider.register 确保内容被正确缓存
                            const diffUri = DiffContentProvider.register(uri, newContent);
                            
                            this._pendingDiff = {
                                originalUri: uri,
                                newContent: newContent,
                                diffUri: diffUri
                            };
                        }
                    } catch (e) {
                        Logger.error(`[OPGV] Failed to prepare pending diff: ${e}`);
                    }
                }
                result = await ToolExecutor.replace(args);
                // [关键新增] 显式通知 Webview 渲染侧边栏按钮面板
                this._postWebviewMessage('showApprovalPanel', undefined);
            } else if (funcName === 'run_command') {
                // [Phase 7] 启用终端流式反馈，并确保结果回传给 AI
                result = await ToolExecutor.run_command(args, (chunk) => {
                    this._postWebviewMessage('streamUpdate', chunk, 'terminal');
                });
            } else if (funcName === 'get_mcp_prompt') {
                result = await this._mcpHost.getPromptContent(args.server_name, args.prompt_name, args.arguments);
            } else if (funcName === 'get_mcp_resource') {
                result = await this._mcpHost.getResourceContent(args.server_name, args.uri);
            } else {
                result = await this._mcpHost.executeTool(funcName, args);
            }
            this._historyManager.addItem({ role: 'tool', tool_call_id: toolCall.id, content: result });
        }
        await this._chatHistoryService.saveCheckpoint('session_history', this._historyManager.getHistory());
    }

    private async _getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'chat.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'chat.css'));
        const ansiUpUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'libs', 'ansi_up.js'));
        const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'chat.html');
        
        let html = await fs.promises.readFile(htmlPath.fsPath, 'utf8');
        html = html.replace('{{styleUri}}', styleUri.toString());
        html = html.replace('{{scriptUri}}', scriptUri.toString());
        html = html.replace('{{ansiUpUri}}', ansiUpUri.toString());
        
        return html;
    }
}
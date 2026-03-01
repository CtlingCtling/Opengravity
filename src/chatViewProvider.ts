import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AIProvider, ApiMessage } from './provider';
import { McpHost } from './mcp/mcpHost';
import { ToolExecutor } from './tools/executor';
import { OPGV_TOOLS } from './tools/definitions';
import { Logger } from './utils/logger';
import { CommandDispatcher } from './commands/CommandDispatcher';
import { HistoryManager } from './session/HistoryManager'; 
import { ChatHistoryService } from './services/ChatHistoryService'; 
import { DiffContentProvider } from './utils/diffProvider';
import { TemplateManager } from './utils/templateManager';
import { SessionStateManager, OpengravityMode } from './session/StateManager';
import { HeartbeatManager } from './session/HeartbeatManager';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'opengravity.chatView';
    private _view?: vscode.WebviewView;
    private _recursionDepth = 0;
    private static readonly DEFAULT_MAX_DEPTH = 10; 
    private static readonly AUTO_MAX_DEPTH = 100;   
    private _commandDispatcher: CommandDispatcher;
    private _historyManager: HistoryManager; 
    private _chatHistoryService: ChatHistoryService; 
    private _stateManager: SessionStateManager; 
    private _heartbeatManager?: HeartbeatManager; 
    private _pendingDiff?: { originalUri: vscode.Uri, newContent: string, diffUri: vscode.Uri }; 
    private _pendingToolCallId?: string; 
    private _isWaitingForApproval = false; 
    private _isProcessing = false; 
    private _systemPrompt: string;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _getAIProvider: () => Promise<AIProvider | null>,
        private readonly _mcpHost: McpHost,
        systemPrompt: string
    ) {
        this._systemPrompt = systemPrompt;
        this._commandDispatcher = new CommandDispatcher(this._extensionUri);
        this._historyManager = new HistoryManager(); 
        this._chatHistoryService = new ChatHistoryService(); 
        this._stateManager = new SessionStateManager(); 
    }

    public async resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        await this._stateManager.initialize();

        // [UI 同步] 发送初始模式
        this._postWebviewMessage('updateMode', this._stateManager.mode);

        // [Init 2.0] 初始化预检
        const workflowReady = await TemplateManager.isWorkflowInitialized();
        if (!workflowReady) {
            this._postWebviewMessage('updateStatus', 'not-initialized');
        }

        if (!this._heartbeatManager) {
            this._heartbeatManager = new HeartbeatManager(
                this._stateManager,
                async (prompt) => {
                    await this.handleUserMessage(prompt, false, true);
                }
            );
            this._heartbeatManager.start();
        }

        const lastSession = await this._chatHistoryService.loadCheckpoint('session_history');
        if (lastSession && lastSession.history) {
            this._historyManager.loadHistory(lastSession.history);
        }

        webviewView.webview.options = { enableScripts: true, localResourceRoots: [this._extensionUri] };
        webviewView.webview.html = await this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'webviewLoaded':
                    // [Init 2.0] 握手：Webview 就绪后立即同步环境状态
                    const hasWorkspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;
                    if (!hasWorkspace) {
                        this.postState('no-workspace');
                    } else {
                        const workflowReady = await TemplateManager.isWorkflowInitialized();
                        this.postState(workflowReady ? 'initialized' : 'not-initialized');
                    }

                    // [UI 同步] 发送当前模式
                    this._postWebviewMessage('updateMode', this._stateManager.mode);

                    // 恢复历史
                    const currentHistory = this._historyManager.getHistory();
                    if (currentHistory.length > 0) {
                        this._postWebviewMessage(
                            'restoreHistory', 
                            currentHistory.filter(m => (m.role === 'user' || m.role === 'assistant') && m.content).map(m => ({ role: m.role === 'assistant' ? 'ai' : 'user', content: m.content || "" })));
                    }
                    break;
                case 'userInput':
                    if (this._isProcessing) { return; }
                    await this.handleUserMessage(data.value);
                    break;
                case 'saveAndClear':
                    await this.handleSaveAndClear();
                    break;
                case 'linkActiveFile':
                    await this.handleLinkActiveFile();
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
                case 'abortTask':
                    await this.handleAbortTask();
                    break;
            }
        });
    }

    /**
     * 紧急阻断：停止所有正在进行的工作
     */
    private async handleAbortTask() {
        Logger.warn("[OPGV] EMERGENCY STOP triggered by user (Esc key).");
        
        // 1. 重置所有锁和状态
        this._isProcessing = false;
        this._recursionDepth = 0;
        
        // 2. 如果有挂起的审批，强制清理
        if (this._isWaitingForApproval) {
            if (this._pendingDiff) {
                DiffContentProvider.clear(this._pendingDiff.diffUri);
                this._pendingDiff = undefined;
            }
            this._pendingToolCallId = undefined;
            this._isWaitingForApproval = false;
            vscode.commands.executeCommand('setContext', 'opengravity.diffVisible', false);
        }

        // 3. UI 反馈
        this._postWebviewMessage('error', '🚨 **STOPPED**: All active tasks have been terminated by user command.');
        vscode.window.showWarningMessage('🚨 Opengravity: 任务已强制停止。');
    }

    public async handleApplyDiff() {
        if (this._pendingDiff && this._pendingToolCallId) {
            try {
                const encoder = new TextEncoder();
                await vscode.workspace.fs.writeFile(this._pendingDiff.originalUri, encoder.encode(this._pendingDiff.newContent));
                DiffContentProvider.clear(this._pendingDiff.diffUri);
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                const successMsg = `[SUCCESS] User APPROVED and applied the changes to \`${path.basename(this._pendingDiff.originalUri.fsPath)}\`.`;
                this._historyManager.updateToolResult(this._pendingToolCallId, successMsg);
                this._isWaitingForApproval = false;
                this._pendingToolCallId = undefined;
                vscode.commands.executeCommand('setContext', 'opengravity.diffVisible', false);
                this._pendingDiff = undefined;
                vscode.window.showInformationMessage('✅ 修改已应用。');
                await this.handleUserMessage("", true);
            } catch (err: any) {
                vscode.window.showErrorMessage(`应用修改失败: ${err.message}`);
            }
        }
    }

    public async handleCancelDiff() {
        if (this._pendingDiff && this._pendingToolCallId) {
            DiffContentProvider.clear(this._pendingDiff.diffUri);
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            const rejectMsg = `[REJECTED] User declined the changes to \`${path.basename(this._pendingDiff.originalUri.fsPath)}\`.`;
            this._historyManager.updateToolResult(this._pendingToolCallId, rejectMsg);
            this._isWaitingForApproval = false;
            this._pendingToolCallId = undefined;
            vscode.commands.executeCommand('setContext', 'opengravity.diffVisible', false);
            this._pendingDiff = undefined;
            await this.handleUserMessage("", true);
        }
    }

    private async handleUserMessage(content: string, isToolResponse: boolean = false, isSilent: boolean = false) {
        if (!this._view) { return; }
        const provider = await this._getAIProvider();
        if (!provider) {
            this._postWebviewMessage('error', 'API key missing');
            return;
        }

        if (!isToolResponse && content && !isSilent) {
            const dispatchResult = await this._commandDispatcher.dispatch(
                content, provider, this._mcpHost, this._view.webview, this._extensionUri,
                async (fakeMsg) => {
                    this._historyManager.addItem({ role: 'user', content: fakeMsg });
                    await this.handleUserMessage("", true);
                },
                this._historyManager, this._chatHistoryService, this._stateManager, this
            );
            if (dispatchResult) {
                if (dispatchResult.status === 'error') { this._postWebviewMessage('error', dispatchResult.message); }
                return;
            }
        }

        if (isToolResponse) {
            this._recursionDepth++;
        } else if (content.trim() !== "" && !isSilent) {
            this._recursionDepth = 0;
        }

        const isAuto = this._stateManager.isAutonomous();
        const maxDepth = isAuto ? ChatViewProvider.AUTO_MAX_DEPTH : ChatViewProvider.DEFAULT_MAX_DEPTH;

        if (this._recursionDepth > maxDepth) {
            Logger.warn(`[OPGV] Max recursion reached: ${this._recursionDepth}`);
            if (!isSilent) { this._postWebviewMessage('error', `Maximum recursion depth (${maxDepth}) reached.`); }
            return;
        }

        await this._ensureSystemPrompt();
        if (content && !isToolResponse) {
            this._historyManager.addItem({ role: 'user', content });
        }

        this._isProcessing = true; 
        try {
            const canSpeak = this._stateManager.canSpeak() && !isSilent;
            if (canSpeak){ this._postWebviewMessage('streamStart', undefined); }

            const allTools = await this._getAvailableTools();
            const sanitizedHistory = this._historyManager.getSanitizedHistory();
            
            const onUpdate = (update: any) => {
                if (canSpeak) { this._postWebviewMessage('streamUpdate', update.delta, update.type); }
            };

            const aiResponse = await provider.generateContentStream(sanitizedHistory, onUpdate, allTools);

            if (aiResponse.content === 'HEARTBEAT_OK') {
                Logger.info("[HEARTBEAT] Opengravity said OK.");
                return; 
            }

            this._historyManager.addItem(aiResponse);
            if (canSpeak) { this._postWebviewMessage('streamEnd', undefined); }
            
            await this._chatHistoryService.saveCheckpoint('session_history', this._historyManager.getHistory());

            if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
                await this._executeToolCalls(aiResponse.tool_calls);
                if (this._isWaitingForApproval) {
                    vscode.commands.executeCommand('setContext', 'opengravity.diffVisible', true);
                    return; 
                }
                await this.handleUserMessage("", true, isSilent);
            }
        } catch (err: any) { 
            this._handleProcessingError(err);
        } finally {
            this._isProcessing = false; 
        }
    }

    private _postWebviewMessage(type: string, value: any, dataType?: string) {
        if (this._view) { this._view.webview.postMessage({ type, value, dataType }); }
    }

    private _handleProcessingError(err: any) {
        Logger.error("[OPGV] Error in handleUserMessage: ", err);
        this._postWebviewMessage('error', err.message || 'An unknown error occurred.');
    }

    /**
     * 发送环境状态给 Webview (Init 2.0)
     */
    public postState(state: 'no-workspace' | 'not-initialized' | 'initialized') {
        this._postWebviewMessage('updateStatus', state);
    }

    /**
     * 对外接口：重新加载指令集 (用于 /init 后的热重载)
     */
    public async reloadCommands() {
        await this._commandDispatcher.reload();
        this._postWebviewMessage('updateStatus', 'commands-reloaded');
    }

    public async refreshSystemPrompt() {
        this._historyManager.clearHistory();
        this._systemPrompt = await TemplateManager.getSystemPrompt(this._extensionUri);
        await this._ensureSystemPrompt(); 
        await this._chatHistoryService.saveCheckpoint('session_history', this._historyManager.getHistory());
        this._postWebviewMessage('clearView', undefined);
        this._postWebviewMessage('restoreHistory', [{ role: 'ai', content: '✅ **系统记忆已刷新**\n\n已重新加载最新的 SYSTEM.md 和 MCP 协议上下文。' }]);
    }

    private async handleLinkActiveFile() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        const prompt = `[CONTEXT: \`${path.basename(editor.document.fileName)}\`]\n\`\`\`\n${editor.document.getText()}\n\`\`\`\n\n`;
        this._postWebviewMessage('fillInput', prompt);
    }

    private async handleSaveAndClear() {
        const currentHistory = this._historyManager.getHistory();
        if (currentHistory.length <= 1) { return; }
        const saveTag = `archive_${Date.now()}`;
        await this._chatHistoryService.saveCheckpoint(saveTag, currentHistory);
        await this._chatHistoryService.deleteCheckpoint('session_history');
        this._historyManager.clearHistory();
        this._postWebviewMessage('clearView', undefined);
        vscode.window.showInformationMessage(`会话已保存为 ${saveTag} 并清空。`);
    }

    private async _ensureSystemPrompt() {
        if (this._historyManager.getHistory().length === 0) {
            let systemContent = this._systemPrompt;
            const mcpPrompts = await this._mcpHost.getPromptsForAI();
            if (mcpPrompts.length > 0) {
                systemContent += "\n\n## Available MCP Prompts:\n" + mcpPrompts.map(p => `- [${p.serverName}] ${p.name}: ${p.description}`).join('\n');
            }
            const mcpResources = await this._mcpHost.getResourcesForAI();
            if (mcpResources.length > 0) {
                systemContent += "\n\n## Available MCP Resources:\n" + mcpResources.map(r => `- [${r.serverName}] ${r.name} (URI: ${r.uri}): ${r.description}\n`);
            }
            this._historyManager.addItem({ role: 'system', content: systemContent });
        }
    }

    private async _getAvailableTools(): Promise<any[]> {
        const mcpTools = await this._mcpHost.getToolsForAI();
        const opgvTools = OPGV_TOOLS;
        return [...mcpTools, ...opgvTools];
    }

    private async _executeToolCalls(toolCalls: any[]) {
        this._postWebviewMessage('streamUpdate', `Processing ${toolCalls.length} tools...`, 'tool_status');
        for (const tc of toolCalls) {
            this._historyManager.addItem({ role: 'tool', tool_call_id: tc.id, content: "[EXECUTING]" });
        }

        let isInterrupted = false;
        for (let i = 0; i < toolCalls.length; i++) {
            const toolCall = toolCalls[i];
            const funcName = toolCall.function.name;
            let result = "";
            let args;

            if (isInterrupted) {
                this._historyManager.updateToolResult(toolCall.id, "[SKIPPED]");
                continue;
            }

            try {
                args = JSON.parse(toolCall.function.arguments);
            } catch (e: any) {
                this._historyManager.updateToolResult(toolCall.id, `[ERROR] ${e.message}`);
                continue; 
            }

            if (funcName === 'read_file') {
                this._postWebviewMessage('streamUpdate', `🔍 **Reading**: \`${args.path}\`...`, 'tool_status');
                result = await ToolExecutor.read_file(args);
                this._postWebviewMessage('streamUpdate', `✅ **Read Complete**: \`${args.path}\` (${result.length} bytes)`, 'tool_status');
            } else if (funcName === 'write_file') {
                this._postWebviewMessage('streamUpdate', `Writing to \`${args.path}\`...`, 'tool_status');
                result = await ToolExecutor.write_file(args);
                this._postWebviewMessage('streamUpdate', `Success.`, 'tool_status');
            } else if (funcName === 'replace') {
                const isAuto = this._stateManager.isAutonomous();
                const isPersonalityFile = args.path.startsWith('.opengravity/');

                // [高级逻辑] 自进化特权：如果是人格文件或处于自动模式，免审批执行
                if (isAuto || isPersonalityFile) {
                    if (isPersonalityFile && !isAuto) {
                        Logger.info(`[SELF-EVOLUTION] Aria is updating her personality: ${args.path}`);
                    }
                    result = await ToolExecutor.replace(args);
                } else {
                    // 修改业务代码且处于 Manual 模式：必须审批
                    this._isWaitingForApproval = true;
                    this._pendingToolCallId = toolCall.id;

                    // 获取上下文并手动标记染色 (Diff 预览)
                    const fullPath = (ToolExecutor as any).getSafePath(args.path);
                    let diffMd = "";
                    try {
                        const fullContent = await fs.promises.readFile(fullPath, 'utf-8');
                        const lines = fullContent.split('\n');
                        const index = fullContent.indexOf(args.old_string);
                        if (index !== -1) {
                            const startLine = fullContent.slice(0, index).split('\n').length;
                            const oldLines = args.old_string.split('\n');
                            const newLines = args.new_string.split('\n');
                            const endLine = startLine + oldLines.length - 1;

                            const contextBefore = lines.slice(Math.max(0, startLine - 3), startLine - 1);
                            const contextAfter = lines.slice(endLine, Math.min(lines.length, endLine + 2));

                            diffMd = `Proposed changes for \`${args.path}\`:\n\n\`\`\`diff\n`;
                            contextBefore.forEach((l: string) => diffMd += `  ${l}\n`);
                            oldLines.forEach((l: string) => diffMd += `-${l}\n`);
                            newLines.forEach((l: string) => diffMd += `+${l}\n`);
                            contextAfter.forEach((l: string) => diffMd += `  ${l}\n`);
                            diffMd += "```";
                        }
                    } catch (e) {
                        diffMd = `Proposed changes for \`${args.path}\` (context unavailable):\n\n\`\`\`diff\n-${args.old_string}\n+${args.new_string}\n\`\`\``;
                    }

                    this._postWebviewMessage('streamUpdate', diffMd, 'diff');

                    const fullPathSafe = (ToolExecutor as any).getSafePath(args.path);
                    if (fullPathSafe) {
                        try {
                            const content = await fs.promises.readFile(fullPathSafe, 'utf-8');
                            const firstIndex = content.indexOf(args.old_string);
                            if (firstIndex !== -1) {
                                const newContent = content.slice(0, firstIndex) + args.new_string + content.slice(firstIndex + args.old_string.length);
                                const uri = vscode.Uri.file(fullPathSafe);
                                const diffUri = DiffContentProvider.register(uri, newContent);
                                this._pendingDiff = { originalUri: uri, newContent, diffUri };
                            }
                        } catch (e) {}
                    }

                    result = await ToolExecutor.replace(args);
                    this._postWebviewMessage('showApprovalPanel', undefined);
                    this._historyManager.updateToolResult(toolCall.id, result);
                    isInterrupted = true;
                    continue; 
                }
            }
 else if (funcName === 'run_command') {
                result = await ToolExecutor.run_command(args, (chunk) => {
                    this._postWebviewMessage('streamUpdate', chunk, 'terminal');
                });
            } else {
                result = await this._mcpHost.executeTool(funcName, args);
            }
            this._historyManager.updateToolResult(toolCall.id, result);
        }
        await this._chatHistoryService.saveCheckpoint('session_history', this._historyManager.getHistory());
    }

    private async _getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'chat.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'chat.css'));
        const ansiUpUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'libs', 'ansi_up.js'));
        const purifyUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'libs', 'purify.min.js'));
        const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'chat.html');
        let html = await fs.promises.readFile(htmlPath.fsPath, 'utf8');
        html = html.replace('{{styleUri}}', styleUri.toString()).replace('{{scriptUri}}', scriptUri.toString()).replace('{{ansiUpUri}}', ansiUpUri.toString()).replace('{{purifyUri}}', purifyUri.toString());
        return html;
    }
}

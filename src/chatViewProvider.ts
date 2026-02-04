/**
 * ## chatViewProvider.ts - 提供聊天视图，交互界面...
 * #EXPLAINATION:
 * 定义 ChatViewProvider 类，创建和管理聊天窗口。
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AIProvider, ApiMessage } from './provider';
import { McpHost } from './mcp/mcpHost';
import { ToolExecutor } from './tools/executor';
import { OPGV_TOOLS } from './tools/definitions';

/**
 * ## ChatViewProvider Class
 * #EXPALINATION:
 * 创建和管理聊天窗口
 * 
 * private:
 * - _view: Webview 视图实例
 * - _apiMessages: 存储与 AI 交互的消息数组。(DeepSeekdocs里面要求的)
 * 
 *  构造函数参数:
 * - _extensionUri: 扩展的 URI
 * - _getAIProvider: 获取函数
 * - _mcpHost: MCP 主机实例
 * - _systemPrompt: 系统提示词
 * 
 * 
 * public:
 * - resolveWebviewView: 设置视图
 * - handleUserMessage: 处理用户消息
 * - handleLinkActiveFile: 链接当前活动文件
 * - handleSaveAndClear: 保存和清除聊天记录
 * - getHistoryPath: 获取历史记录文件路径
 * - saveSessionToDisk: 将当前会话保存到磁盘
 * - loadSessionFromDisk: 从磁盘加载会话历史
 * - restoreUIHistory: 恢复历史记录
 * - _getHtmlForWebview: HTML
 */

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'opengravity.chatView';
    private _view?: vscode.WebviewView;
    private _apiMessages: ApiMessage[] = [];

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _getAIProvider: () => AIProvider | null,
        private readonly _mcpHost: McpHost,
        private readonly _systemPrompt: string
    ) {}

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        this.loadSessionFromDisk();

        webviewView.webview.options = { enableScripts: true, localResourceRoots: [this._extensionUri] };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'webviewLoaded':
                    if (this._apiMessages.length > 0) {
                        webviewView.webview.postMessage({ type: 'restoreHistory', value: this._apiMessages });
                    }
                    break;
                case 'userInput':
                    await this.handleUserMessage(data.value);
                    break;
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
                case 'applyDiff':
                    vscode.commands.executeCommand('opengravity.showDiff', data.value);
                    break;
                case 'runTerminal':
                    const t = vscode.window.activeTerminal || vscode.window.createTerminal("TARS");
                    t.show(); t.sendText(data.value);
                    break;
                case 'fillInput':
                    break;
            }
        });
    }

    private async handleUserMessage(content: string, isToolResponse: boolean = false) {
        if (!this._view) {
            return;
        }
        const provider = this._getAIProvider();
        if (!provider) {
            this._view.webview.postMessage({ type: 'error', value: 'API KEY MISSING' });
            return;
        }

        if (this._apiMessages.length === 0) {
            this._apiMessages.push({ role: 'system', content: this._systemPrompt });
        }

        if (content && !isToolResponse) {
            this._apiMessages.push({ role: 'user', content });
            this.saveSessionToDisk();
        }

        try {
            this._view.webview.postMessage({ type: 'streamStart' });
            const mcpTools = await this._mcpHost.getToolsForAI();
            const opgvTools = OPGV_TOOLS;
            const allTools = [...mcpTools, ...opgvTools];
            const aiResponse = await provider.generateContentStream(
                this._apiMessages, 
                (update) => {
                    this._view?.webview.postMessage({ 
                        type: 'streamUpdate', 
                        dataType: update.type, 
                        value: update.delta 
                    });
                },
                allTools
            );

            this._apiMessages.push(aiResponse);
            this._view.webview.postMessage({ type: 'streamEnd' });
            this.saveSessionToDisk();

            if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
                this._view.webview.postMessage({ 
                    type: 'streamUpdate', 
                    dataType: 'content', 
                    value: `\n\n> 🔧 **TARS Action:** Executing ${aiResponse.tool_calls.length} tools...\n` 
                });
                for (const toolCall of aiResponse.tool_calls) {
                    let result = "";
                    const funcName = toolCall.function.name;
                    const args = JSON.parse(toolCall.function.arguments);
                    if (funcName === 'read_file') {
                        result = await ToolExecutor.read_file(args);
                    } else if (funcName === 'write_file') {
                        result = await ToolExecutor.write_file(args);
                    } else if (funcName === 'run_command') {
                        result = await ToolExecutor.run_command(args);
                    } else {
                        result = await this._mcpHost.executeTool(funcName, args);
                    }
                    this._apiMessages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: result
                    });
                }
                this.saveSessionToDisk();
                console.log("[OPGV] All tools done. Auto-resuming...");
                await this.handleUserMessage("", true);
            }
        } catch (err: any) { 
            this._view.webview.postMessage({ type: 'error', value: err.message }); 
        }
    }

    private async handleLinkActiveFile() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const prompt = `[CONTEXT: \`${path.basename(editor.document.fileName)}\`]\n\`\`\`\n${editor.document.getText()}\n\`\`\`\n\n`;
        this._view?.webview.postMessage({ type: 'fillInput', value: prompt });
    }

    private async handleSaveAndClear() {
        if (this._apiMessages.length <= 1) {
            return;
        }
        const root = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        if (!root) {
            return;
        }
        const savePath = path.join(root, 'reviews', `archive_${Date.now()}.md`);
        let output = "# Archive\n\n";
        this._apiMessages.forEach(m => { 
            if (m.content) {
                output += `### [${m.role.toUpperCase()}]\n${m.content}\n\n---\n\n`; 
            }
        });
        try {
            fs.mkdirSync(path.dirname(savePath), { recursive: true });
            fs.writeFileSync(savePath, output, 'utf-8');
            this._apiMessages = [];
            const hp = this.getHistoryPath();
            if (hp && fs.existsSync(hp)) {
                fs.unlinkSync(hp);
            }
            this._view?.webview.postMessage({ type: 'clearView' });
        } catch (e: any) { vscode.window.showErrorMessage(e.message); }
    }

    private getHistoryPath() {
        const root = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        return root ? path.join(root, '.opengravity', 'session_history.json') : undefined;
    }

    private saveSessionToDisk() {
        const hp = this.getHistoryPath();
        if (hp) {
            fs.mkdirSync(path.dirname(hp), { recursive: true });
            fs.writeFileSync(hp, JSON.stringify(this._apiMessages, null, 2), 'utf-8');
        }
    }

    private loadSessionFromDisk() {
        const hp = this.getHistoryPath();
        if (hp && fs.existsSync(hp)) {
            try { this._apiMessages = JSON.parse(fs.readFileSync(hp, 'utf-8')); }
            catch { this._apiMessages = []; }
        }
    }

    private restoreUIHistory() {
        const uiHistory = this._apiMessages
            .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content)
            .map(m => ({ role: m.role === 'assistant' ? 'ai' : 'user', content: m.content || "" }));
        this._view?.webview.postMessage({ type: 'restoreHistory', value: uiHistory });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <style>
        :root { --bg: var(--vscode-sideBar-background); --fg: var(--vscode-terminal-foreground); --user-c: var(--vscode-terminal-ansiCyan); --ai-c: var(--vscode-terminal-ansiGreen); --border: var(--vscode-panel-border); --gray: #666; }
        body { margin: 0; padding: 0; height: 100vh; display: flex; flex-direction: column; background-color: var(--bg); color: var(--fg); font-family: 'JetBrains Mono', monospace; font-size: 12px; }
        #chat-box { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 20px; }
        .msg { border-left: 2px solid transparent; padding-left: 10px; }
        .user { border-left-color: var(--user-c); color: var(--user-c); }
        .ai { border-left-color: var(--ai-c); }
        .reasoning { margin: 10px 0; padding: 8px; border: 1px dashed #666; background: rgba(255,255,255,0.03); color: #888; font-size: 0.9em; display: none; white-space: pre-wrap; }
        .reasoning::before { content: ":: THOUGHT_PROCESS"; display: block; font-weight: bold; margin-bottom: 5px; opacity: 0.5; }
        pre { background: rgba(0,0,0,0.3); border: 1px solid #333; padding: 10px; position: relative; cursor: pointer; overflow-x: auto; }
        pre:hover::after { content: "CLICK TO INSERT"; position: absolute; top: 2px; right: 5px; font-size: 9px; color: var(--ai-c); }
        .code-container { margin: 10px 0; border: 1px solid #333; background: rgba(0,0,0,0.2); }
        .code-header { display: flex; gap: 10px; padding: 5px 10px; background: #222; border-bottom: 1px solid #333; }
        .action-link { font-size: 9px; cursor: pointer; color: var(--ai-c); font-weight: bold; }
        #bottom-container { border-top: 1px solid var(--border); padding: 10px; background: var(--bg); }
        #action-bar { display: flex; gap: 8px; margin-bottom: 8px; }
        .btn { font-size: 10px; cursor: pointer; padding: 2px 6px; border: 1px solid #666; color: #666; }
        .btn:hover { border-color: var(--fg); color: var(--fg); }
        .input-wrapper { display: flex; border: 1px solid var(--border); padding: 6px; background: rgba(0,0,0,0.2); }
        textarea { flex: 1; background: transparent; border: none; color: inherit; font-family: inherit; outline: none; resize: none; }
    </style>
</head>
<body>
    <div id="chat-box"></div>
    <div id="bottom-container">
        <div id="action-bar"><div class="btn" onclick="linkFile()">[LINK_FILE]</div><div class="btn" onclick="saveClear()">[SAVE_&_CLEAR]</div></div>
        <div class="input-wrapper"><span style="color:var(--ai-c); margin-right:8px; font-weight:bold">></span><textarea id="input" rows="1" placeholder="Option+Enter to Send"></textarea></div>
        <div style="font-size:9px;color:#666;text-align:right;margin-top:4px">⌥ Option + Enter to SEND</div>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        const chatBox = document.getElementById('chat-box');
        const input = document.getElementById('input');

        function linkFile() { vscode.postMessage({ type: 'linkActiveFile' }); }
        function saveClear() { vscode.postMessage({ type: 'saveAndClear' }); }

        document.addEventListener('click', e => {
            const pre = e.target.closest('pre');
            if (pre) {
                const code = pre.innerText.replace("CLICK TO INSERT", "").trim();
                vscode.postMessage({ type: 'insertCode', value: code });
            }
        });

        input.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = this.scrollHeight + 'px';
        });

        input.addEventListener('keydown', e => {
            if (e.key === 'Enter' && e.altKey) {
                e.preventDefault();
                input.style.height = 'auto';
                const val = input.value.trim();
                if (!val) return;
                appendMsg('user', val);
                vscode.postMessage({ type: 'userInput', value: val });
                input.value = '';
                input.style.height = 'auto';
            }
        });

        let curRes = null, curCnt = null, mdBuf = "";
        let curEof = null;

        function appendMsg(role, text) {
            const div = document.createElement('div');
            div.className = 'msg ' + role;
            const label = role === 'user' ? 'USER' : 'OPENGRAVITY';
            div.innerHTML = \`<div style="font-weight:bold;margin-bottom:5px">[\${label}]</div><div class="reasoning"></div><div class="content"></div>\`;
            if (role === 'user') div.querySelector('.content').textContent = text;
            chatBox.appendChild(div);
            chatBox.scrollTop = chatBox.scrollHeight;
            return div;
        }

        window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.type === 'streamStart') {
                if (curEof) curEof.remove();
                const div = appendMsg('ai', '');
                curRes = div.querySelector('.reasoning');
                curCnt = div.querySelector('.content');
                mdBuf = "";
            } else if (msg.type === 'streamUpdate') {
                if (msg.dataType === 'reasoning') { curRes.style.display = 'block'; curRes.textContent += msg.value; }
                else { mdBuf += msg.value; curCnt.innerHTML = marked.parse(mdBuf); }
                chatBox.scrollTop = chatBox.scrollHeight;
            } else if (msg.type === 'streamEnd') {
                if (curCnt) {
                    const eofTag = document.createElement('span');
                    eofTag.textContent = ' [EOF]';
                    eofTag.style.color = 'var(--gray)';
                    eofTag.style.fontWeight = 'bold';
                    eofTag.style.fontSize = '10px';
                    curCnt.appendChild(eofTag);
                }
                curRes = null; curCnt = null; mdBuf = "";
            } else if (msg.type === 'clearView') {
                chatBox.innerHTML = '<div style="color:var(--ai-c)">[SYSTEM] Memory Purged. Archive Created.</div>';
            } else if (msg.type === 'restoreHistory') {
                chatBox.innerHTML = '';
                msg.value.forEach(m => {
                    const div = appendMsg(m.role === 'assistant' ? 'ai' : 'user', m.content);
                    if (m.role === 'assistant') {
                        div.querySelector('.content').innerHTML = marked.parse(m.content || '');
                    } else {
                        div.querySelector('.content').textContent = m.content || '';
                    }
                    chatBox.scrollTop = chatBox.scrollHeight;
                });
                if (curEof) curEof.remove();
                curEof = null;

            } else if (msg.type === 'fillInput') {
                input.value = msg.value; input.focus();
                input.style.height = 'auto';
                input.style.height = input.scrollHeight + 'px';
            } else if (msg.type === 'error') {
                const div = document.createElement('div');
                div.style.color = "red";
                div.textContent = "[!] " + msg.value;
                chatBox.appendChild(div);
            }
        });
        vscode.postMessage({ type: 'webviewLoaded' });
    </script>
</body>
</html>`;
    }
}
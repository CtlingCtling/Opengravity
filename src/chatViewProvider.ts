import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AIProvider } from './provider';
import { loadSystemPrompt } from './utils/promptLoader';

interface ChatMessage {
    role: 'user' | 'ai';
    content: string;
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'opengravity.chatView';
    private _view?: vscode.WebviewView;
    private _chatHistory: ChatMessage[] = [];

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _getAIProvider: () => AIProvider | null
    ) {}

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'webviewLoaded':
                    if (this._chatHistory.length > 0) {
                        webviewView.webview.postMessage({ type: 'restoreHistory', value: this._chatHistory });
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
                    await this.handleInsertCode(data.value);
                    break;
            }
        });
    }

    private async handleLinkActiveFile() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage("ERR: NO ACTIVE FILE OPEN");
            return;
        }
        const fileName = path.basename(editor.document.fileName);
        const fileContent = editor.document.getText();
        const prompt = `[CONTEXT_LINK: \`${fileName}\`]\n内容如下：\n\`\`\`\n${fileContent}\n\`\`\`\n请分析此文件。`;
        await this.handleUserMessage(prompt);
    }

    private async handleSaveAndClear() {
        if (this._chatHistory.length === 0) return;
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        const rootPath = workspaceFolders[0].uri.fsPath;
        const savePath = path.join(rootPath, 'reviews', `chat_archive_${Date.now()}.md`);

        let output = "# Opengravity Chat Archive\n\n";
        this._chatHistory.forEach(m => {
            output += `### [${m.role.toUpperCase()}]\n${m.content}\n\n---\n\n`;
        });

        try {
            const dir = path.dirname(savePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(savePath, output, 'utf-8');
            this._chatHistory = [];
            this._view?.webview.postMessage({ type: 'clearView' });
            vscode.window.showInformationMessage(`Archive saved to reviews/`);
        } catch (e: any) {
            vscode.window.showErrorMessage(`Export failed: ${e.message}`);
        }
    }

    private async handleInsertCode(code: string) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            editor.edit(editBuilder => {
                editBuilder.insert(editor.selection.active, code);
            });
        }
    }

    private async handleUserMessage(content: string) {
        if (!this._view) return;
        this._chatHistory.push({ role: 'user', content });
        const provider = this._getAIProvider();
        if (!provider) return;

        try {
            const systemPrompt = await loadSystemPrompt();
            this._view.webview.postMessage({ type: 'streamStart' });
            let fullContent = "";
            await provider.generateContentStream(content, (update) => {
                this._view?.webview.postMessage({ type: 'streamUpdate', dataType: update.type, value: update.delta });
                if (update.type === 'content') fullContent += update.delta;
            }, systemPrompt);
            this._chatHistory.push({ role: 'ai', content: fullContent });
            this._view.webview.postMessage({ type: 'streamEnd' });
        } catch (err: any) {
            this._view.webview.postMessage({ type: 'error', value: err.message });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <style>
        :root {
            --bg: var(--vscode-sideBar-background);
            --fg: var(--vscode-terminal-foreground);
            --user-color: var(--vscode-terminal-ansiCyan);
            --ai-color: var(--vscode-terminal-ansiGreen);
            --border: var(--vscode-panel-border);
            --gray: #666;
        }

        body {
            margin: 0; padding: 0; height: 100vh; display: flex; flex-direction: column;
            background-color: var(--bg); color: var(--fg);
            font-family: var(--vscode-editor-font-family), 'JetBrains Mono', monospace; 
            font-size: 12px;
        }

        /* 聊天区域 */
        #chat-box { 
            flex: 1; overflow-y: auto; padding: 15px; 
            display: flex; flex-direction: column; gap: 20px; 
        }

        .msg { border-left: 2px solid transparent; padding-left: 10px; }
        .msg-user { border-left-color: var(--user-color); color: var(--user-color); }
        .msg-ai { border-left-color: var(--ai-color); }

        .reasoning {
            margin: 10px 0; padding: 8px; border: 1px dashed var(--gray);
            background: rgba(255,255,255,0.03); color: var(--gray);
            font-size: 0.9em; display: none; white-space: pre-wrap;
        }
        .reasoning::before { content: ":: THOUGHT_PROCESS"; display: block; font-weight: bold; margin-bottom: 5px; opacity: 0.5; }

        /* 代码块样式 */
        pre { 
            background: rgba(0,0,0,0.3); border: 1px solid #333; padding: 10px; 
            position: relative; cursor: pointer; overflow-x: auto;
        }
        pre:hover::after {
            content: "CLICK TO INSERT"; position: absolute; top: 2px; right: 5px;
            font-size: 9px; color: var(--ai-color);
        }

        /* 底部固定区域 */
        #bottom-container {
            border-top: 1px solid var(--border);
            background: var(--bg);
            padding: 10px;
        }

        /* 按钮工具栏 - 现在在输入框上方 */
        #action-bar {
            display: flex; gap: 8px; margin-bottom: 8px;
        }

        .btn {
            font-size: 10px; cursor: pointer; padding: 2px 6px;
            border: 1px solid var(--gray); color: var(--gray);
            transition: 0.2s; user-select: none;
        }
        .btn:hover { border-color: var(--fg); color: var(--fg); background: rgba(255,255,255,0.05); }

        /* 输入包装器 */
        .input-wrapper { 
            display: flex; border: 1px solid var(--border); 
            padding: 6px; background: rgba(0,0,0,0.2); 
        }
        textarea { 
            flex: 1; background: transparent; border: none; 
            color: inherit; font-family: inherit; outline: none; 
            resize: none; max-height: 150px;
        }
        .hint { font-size: 9px; color: var(--gray); text-align: right; margin-top: 4px; }
    </style>
</head>
<body>
    <div id="chat-box">
        <div style="color:var(--gray); opacity:0.5">Opengravity OS v1.0.4 initialized...</div>
    </div>

    <div id="bottom-container">
        <!-- 按钮移动到了这里 -->
        <div id="action-bar">
            <div class="btn" onclick="linkFile()">[LINK_ACTIVE_FILE]</div>
            <div class="btn" onclick="saveClear()">[SAVE_&_ARCHIVE]</div>
        </div>
        
        <div class="input-wrapper">
            <span style="color:var(--ai-color); margin-right:8px; font-weight:bold">></span>
            <textarea id="input" rows="1" placeholder="Type command..."></textarea>
        </div>
        <div class="hint">⌥ Option + Enter to EXECUTE</div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const chatBox = document.getElementById('chat-box');
        const input = document.getElementById('input');

        function linkFile() { vscode.postMessage({ type: 'linkActiveFile' }); }
        function saveClear() { vscode.postMessage({ type: 'saveAndClear' }); }

        // 点击代码块插入
        document.addEventListener('click', e => {
            const pre = e.target.closest('pre');
            if (pre) {
                // 仅提取文本内容，不含提示语
                const code = pre.innerText.replace("CLICK TO INSERT", "").trim();
                vscode.postMessage({ type: 'insertCode', value: code });
            }
        });

        // 自动增高
        input.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });

        // Option + Enter 发送
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter' && e.altKey) {
                e.preventDefault();
                const val = input.value.trim();
                if (!val) return;
                appendMsg('user', val);
                vscode.postMessage({ type: 'userInput', value: val });
                input.value = '';
                input.style.height = 'auto';
            }
        });

        let currentRes = null, currentCnt = null, mdBuf = "";

        function appendMsg(role, text) {
            const div = document.createElement('div');
            div.className = 'msg msg-' + role;
            const label = role === 'user' ? 'USER' : 'GRAVITY';
            div.innerHTML = \`<div style="font-weight:bold;margin-bottom:5px">[\${label}]</div>
                             <div class="reasoning"></div><div class="content"></div>\`;
            if (role === 'user') div.querySelector('.content').textContent = text;
            chatBox.appendChild(div);
            chatBox.scrollTop = chatBox.scrollHeight;
            return div;
        }

        window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.type === 'streamStart') {
                const div = appendMsg('ai', '');
                currentRes = div.querySelector('.reasoning');
                currentCnt = div.querySelector('.content');
                mdBuf = "";
            } else if (msg.type === 'streamUpdate') {
                if (msg.dataType === 'reasoning') {
                    currentRes.style.display = 'block';
                    currentRes.textContent += msg.value;
                } else {
                    mdBuf += msg.value;
                    currentCnt.innerHTML = marked.parse(mdBuf);
                }
                chatBox.scrollTop = chatBox.scrollHeight;
            } else if (msg.type === 'clearView') {
                chatBox.innerHTML = '<div style="color:var(--ai-color)">[SYSTEM] Session archived to /reviews. Output buffer cleared.</div>';
            } else if (msg.type === 'restoreHistory') {
                chatBox.innerHTML = '';
                msg.value.forEach(m => {
                    const div = appendMsg(m.role, m.content);
                    if (m.role === 'ai') div.querySelector('.content').innerHTML = marked.parse(m.content);
                });
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
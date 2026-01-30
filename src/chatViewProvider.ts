import * as vscode from 'vscode';
import { AIProvider } from './provider';
// 【修改】引入你写好的工具函数
import { loadSystemPrompt } from './utils/promptLoader';

// 定义消息接口
interface ChatMessage {
    role: 'user' | 'ai';
    content: string;
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'opengravity.chatView';
    private _view?: vscode.WebviewView;
    
    // 内存中的历史记录
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

        // 视图加载时，恢复历史记录
        if (this._chatHistory.length > 0) {
            webviewView.webview.postMessage({ type: 'restoreHistory', value: this._chatHistory });
        }

        // 监听前端消息
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'userInput': {
                    const provider = this._getAIProvider();
                    
                    // 1. 记录用户消息
                    const userMsg: ChatMessage = { role: 'user', content: data.value };
                    this._chatHistory.push(userMsg);

                    if (!provider) {
                        webviewView.webview.postMessage({ type: 'error', value: 'ERR: API KEY NOT FOUND IN SETTINGS' });
                        return;
                    }

                    try {
                        // 【修改】直接调用你封装好的 loadSystemPrompt，不需要传参了
                        // 它会自动按优先级查找 SYSTEM.md
                        const systemPrompt = await loadSystemPrompt();

                        // 3. 通知前端：开始接收流
                        webviewView.webview.postMessage({ type: 'streamStart' });

                        // 4. 调用流式接口
                        let fullContent = "";
                        await provider.generateContentStream(
                            data.value,
                            (update) => {
                                // 实时转发给前端
                                webviewView.webview.postMessage({ 
                                    type: 'streamUpdate', 
                                    dataType: update.type, // 'reasoning' | 'content'
                                    value: update.delta 
                                });
                                
                                // 后端只收集正文用于存储
                                if (update.type === 'content') {
                                    fullContent += update.delta;
                                }
                            },
                            systemPrompt
                        );

                        // 5. 记录 AI 完整回复
                        this._chatHistory.push({ role: 'ai', content: fullContent });
                        
                        // 6. 结束流
                        webviewView.webview.postMessage({ type: 'streamEnd' });

                    } catch (err: any) {
                        webviewView.webview.postMessage({ type: 'error', value: `SYS_ERR: ${err.message}` });
                    }
                    break;
                }
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <style>
        :root {
            --bg-color: var(--vscode-editor-background);
            --text-color: var(--vscode-editor-foreground);
            --accent-color: var(--vscode-textLink-foreground);
            --border-color: var(--vscode-panel-border);
            --code-bg: var(--vscode-textBlockQuote-background);
            --user-msg-bg: var(--vscode-button-secondaryBackground);
            --ai-msg-border: var(--vscode-activityBar-activeBorder);
        }

        body {
            background-color: var(--bg-color);
            color: var(--text-color);
            font-family: 'JetBrains Mono', 'Fira Code', var(--vscode-editor-font-family), monospace;
            margin: 0;
            padding: 0;
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            font-size: 13px;
            line-height: 1.5;
        }

        /* 滚动条 */
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }

        #chat-container {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 24px;
        }

        /* 消息块通用样式 */
        .message {
            display: flex;
            flex-direction: column;
            max-width: 100%;
            animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

        /* 用户消息：极简风格 */
        .msg-user {
            align-items: flex-end;
        }
        .msg-user .bubble {
            background: var(--user-msg-bg);
            padding: 8px 12px;
            border-radius: 6px;
            border-bottom-right-radius: 2px;
            color: var(--text-color);
            max-width: 85%;
            word-wrap: break-word;
            border: 1px solid var(--border-color);
        }
        .msg-user .label {
            font-size: 10px;
            color: var(--accent-color);
            margin-bottom: 4px;
            opacity: 0.8;
        }

        /* AI 消息：现代 TUI 风格 */
        .msg-ai {
            align-items: flex-start;
            padding-left: 12px;
            border-left: 2px solid var(--ai-msg-border);
        }
        .msg-ai .label {
            font-weight: bold;
            color: var(--accent-color);
            margin-bottom: 6px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        /* 思考过程：日志风格 */
        .thought-process {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            color: #888;
            background: var(--code-bg);
            padding: 8px;
            margin-bottom: 10px;
            border-radius: 4px;
            border: 1px dashed #444;
            display: none; /* 默认隐藏 */
        }
        .thought-process.active {
            display: block;
        }
        .thought-process::before {
            content: "⚡ ANALYZING...";
            display: block;
            font-weight: bold;
            margin-bottom: 4px;
            color: #aaa;
        }

        /* 正文内容 */
        .markdown-body p { margin: 0 0 10px 0; }
        .markdown-body pre { 
            background: #111; 
            padding: 10px; 
            border-radius: 4px; 
            overflow-x: auto; 
            border: 1px solid #333;
        }
        .markdown-body code {
            font-family: inherit;
            background: #222;
            padding: 2px 4px;
            border-radius: 3px;
            color: #e6cd69;
        }

        /* 输入区域 */
        #input-area {
            padding: 15px;
            border-top: 1px solid var(--border-color);
            background: var(--bg-color);
        }
        .input-box {
            position: relative;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 8px;
            display: flex;
            flex-direction: column;
        }
        .input-box:focus-within {
            border-color: var(--vscode-focusBorder);
        }
        
        textarea {
            background: transparent;
            border: none;
            color: var(--text-color);
            font-family: inherit;
            font-size: 13px;
            resize: none;
            outline: none;
            min-height: 24px;
            max-height: 200px;
        }

        .input-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 6px;
            font-size: 10px;
            color: #666;
        }
        
        .key-hint span {
            background: #333;
            padding: 2px 4px;
            border-radius: 3px;
            color: #ccc;
        }

    </style>
</head>
<body>
    <div id="chat-container">
        <div class="message msg-ai">
            <div class="label">🤖 TARS</div>
            <div class="markdown-body">
                Ready. 设定参数确认：Option+Enter 发送。<br>
                请输入指令...
            </div>
        </div>
    </div>

    <div id="input-area">
        <div class="input-box">
            <textarea id="prompt-input" placeholder="Ask TARS anything... (-help for commands)" rows="1"></textarea>
            <div class="input-footer">
                <div class="key-hint"><span>⌥ Option</span> + <span>Enter</span> to send</div>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const chatContainer = document.getElementById('chat-container');
        const inputField = document.getElementById('prompt-input');

        // 自动增高输入框
        inputField.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = this.scrollHeight + 'px';
        });

        // 监听按键：Option(Alt) + Enter 发送
        inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.altKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        function sendMessage() {
            const text = inputField.value.trim();
            if (!text) return;

            appendUserMessage(text);
            vscode.postMessage({ type: 'userInput', value: text });
            
            inputField.value = '';
            inputField.style.height = 'auto';
        }

        function appendUserMessage(text) {
            const div = document.createElement('div');
            div.className = 'message msg-user';
            div.innerHTML = \`
                <div class="label">YOU</div>
                <div class="bubble">\${text}</div>
            \`;
            chatContainer.appendChild(div);
            scrollToBottom();
        }

        // 当前活动的 AI 响应组件
        let currentThought = null;
        let currentContent = null;
        let mdBuffer = "";

        window.addEventListener('message', event => {
            const msg = event.data;

            if (msg.type === 'streamStart') {
                const div = document.createElement('div');
                div.className = 'message msg-ai';
                div.innerHTML = \`
                    <div class="label">🤖 TARS</div>
                    <div class="thought-process"></div>
                    <div class="markdown-body"></div>
                \`;
                chatContainer.appendChild(div);
                
                currentThought = div.querySelector('.thought-process');
                currentContent = div.querySelector('.markdown-body');
                mdBuffer = "";
                scrollToBottom();
            }
            else if (msg.type === 'streamUpdate') {
                if (msg.dataType === 'reasoning') {
                    if (!currentThought.classList.contains('active')) {
                        currentThought.classList.add('active');
                    }
                    currentThought.textContent += msg.value;
                } else {
                    mdBuffer += msg.value;
                    currentContent.innerHTML = marked.parse(mdBuffer);
                }
                scrollToBottom();
            }
            else if (msg.type === 'streamEnd') {
                currentThought = null;
                currentContent = null;
                mdBuffer = "";
            }
            else if (msg.type === 'restoreHistory') {
                // 简单恢复历史记录
                chatContainer.innerHTML = '';
                msg.value.forEach(m => {
                    if (m.role === 'user') appendUserMessage(m.content);
                    else {
                        const div = document.createElement('div');
                        div.className = 'message msg-ai';
                        div.innerHTML = \`
                            <div class="label">🤖 TARS</div>
                            <div class="markdown-body">\${marked.parse(m.content)}</div>
                        \`;
                        chatContainer.appendChild(div);
                    }
                });
            }
            else if (msg.type === 'error') {
                const div = document.createElement('div');
                div.className = 'message msg-ai';
                div.innerHTML = \`<div class="label" style="color:red">⚠️ SYSTEM ERROR</div><div>\${msg.value}</div>\`;
                chatContainer.appendChild(div);
            }
        });

        function scrollToBottom() {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    </script>
</body>
</html>`;
    }
}
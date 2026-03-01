const vscode = acquireVsCodeApi();

// --- Initialization: AnsiUp ---
let ansiUp = null;
try {
    if (typeof AnsiUp !== 'undefined') {
        ansiUp = new AnsiUp();
    }
} catch (e) {
    console.error("AnsiUp init error:", e);
}

// --- DOM Elements ---
const chatBox = document.getElementById('chat-box');
const inputArea = document.getElementById('input');
const inputHighlighter = document.getElementById('input-highlighter');

// --- Global State ---
let currentStreamMsg = null;
let markdownBuffer = "";
let hasInitPrompted = false; // [新增] 防止重复提示

// --- Status Bar ---
function updateStatusBar(mode) {
    const modeEl = document.getElementById('status-mode');
    if (modeEl) {
        modeEl.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
    }
}

// --- Overlay Control ---
function updateOverlay(status) {
    const overlay = document.getElementById('overlay');
    const msg = document.getElementById('overlay-message');
    const icon = document.getElementById('overlay-icon');

    switch (status) {
        case 'no-workspace':
            overlay.classList.remove('hidden');
            overlay.style.backgroundColor = 'rgba(128, 0, 0, 0.9)'; // 红色半透明
            icon.textContent = '🚫';
            msg.innerHTML = '<strong>No main folder for workspace.</strong><br>Please open a folder to use Opengravity.';
            break;
        case 'not-initialized':
            overlay.classList.remove('hidden');
            overlay.style.backgroundColor = 'var(--vscode-sideBar-background)';
            icon.textContent = '🛠️';
            msg.innerHTML = '<strong>Aria is waiting.</strong><br>Type <span style="color:var(--accent-blue)">/init</span> to start your workflow.';
            break;
        case 'initialized':
        case 'commands-reloaded':
            overlay.classList.add('hidden');
            break;
    }
}

// --- UI State Control ---
function setInputEnabled(enabled) {
    inputArea.disabled = !enabled;
    inputArea.style.opacity = enabled ? "1" : "0.5";
    inputArea.placeholder = enabled ? "⌥ + Enter to Send" : "Opengravity is working...";
    if (enabled) {
        inputArea.focus();
    }
}

// --- Input Highlighting Logic ---
function syncHighlighter() {
    let text = inputArea.value;
    
    // 转义 HTML 字符
    text = escapeHtml(text);

    // 实时染色正则
    // 1. /slash 指令 (蓝色)
    text = text.replace(/^(\/\w+)/g, '<span class="hl-slash">$1</span>');
    // 2. @path 引用 (绿色)
    text = text.replace(/(@[\w\.\/\-\"]+)/g, '<span class="hl-at">$1</span>');
    // 3. !shell 指令 (红色)
    text = text.replace(/^(!\w+)/g, '<span class="hl-shell">$1</span>');

    // 换行处理：为了让 div 和 textarea 的换行完全一致
    inputHighlighter.innerHTML = text + (text.endsWith('\n') ? ' ' : '');
}

// --- Input Handling ---
function performSend() {
    if (inputArea.disabled) return;
    const text = inputArea.value.trim();
    if (text) {
        appendMessage('user', text);
        vscode.postMessage({ type: 'userInput', value: text });
        inputArea.value = '';
        inputArea.style.height = 'auto';
        inputHighlighter.innerHTML = ''; // 清空高亮层
        setInputEnabled(false); // 发送后立即锁定
    }
}

inputArea.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 150) + 'px';
    syncHighlighter(); // 实时同步高亮
});

// 处理滚动同步
inputArea.addEventListener('scroll', function() {
    inputHighlighter.scrollTop = this.scrollTop;
});

inputArea.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && e.altKey) {
        e.preventDefault();
        performSend();
    }
});

// --- Message Rendering ---
function appendMessage(role, text = "") {
    const msgDiv = document.createElement('div');
    msgDiv.className = `msg ${role}`;
    
    // 角色标签
    const label = role === 'user' ? 'USER' : 'OPENGRAVITY';
    
    // [核心重构] 根据角色构建完全不同的 DOM 结构
    if (role === 'user') {
        msgDiv.innerHTML = `
            <div class="role-label">${label}</div>
            <div class="content"></div>
        `;
    } else {
        msgDiv.innerHTML = `
            <div class="role-label">${label}</div>
            <div class="reasoning"></div>
            <div class="content"></div>
            <div class="attachments"></div>
        `;
    }

    const contentDiv = msgDiv.querySelector('.content');
    if (text) {
        if (role === 'user' && text.startsWith('/')) {
            // 高亮显示指令
            const parts = text.split(' ');
            const cmd = parts[0];
            const rest = parts.slice(1).join(' ');
            contentDiv.innerHTML = `<span class="command-highlight">${escapeHtml(cmd)}</span> ${escapeHtml(rest)}`;
        } else {
            contentDiv.innerHTML = role === 'user' ? escapeHtml(text) : safeParseMarkdown(text);
        }
        
        // 触发高亮
        msgDiv.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
    }

    chatBox.appendChild(msgDiv);
    scrollToBottom();

    return {
        element: msgDiv,
        role: role,
        content: contentDiv,
        attachments: msgDiv.querySelector('.attachments') || null
    };
}

function safeParseMarkdown(text) {
    try {
        const rawHtml = marked.parse(text);
        if (typeof DOMPurify !== 'undefined') {
            return DOMPurify.sanitize(rawHtml);
        }
        return rawHtml;
    } catch (e) {
        const fallback = text.replace(/\n/g, '<br>');
        return (typeof DOMPurify !== 'undefined') ? DOMPurify.sanitize(fallback) : fallback;
    }
}

function scrollToBottom() {
    // [智能滚动] 只有当用户本来就在底部附近时，才自动跟随滚动
    const threshold = 50; 
    const isAtBottom = chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight < threshold;
    if (isAtBottom) {
        chatBox.scrollTop = chatBox.scrollHeight;
    }
}

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// --- Widget System ---
function getOrCreateWidget(msgObj, id, title) {
    if (!msgObj.attachments) return null;
    let widget = msgObj.attachments.querySelector(`.widget-block[data-id="${id}"]`);
    if (!widget) {
        widget = document.createElement('div');
        widget.className = 'widget-block';
        widget.setAttribute('data-id', id);
        widget.innerHTML = `
            <div class="widget-header">
                <span>${title}</span>
            </div>
            <div class="widget-body"></div>
        `;
        msgObj.attachments.appendChild(widget);
    }
    return widget.querySelector('.widget-body');
}

// --- Thinking Process ---
function getOrCreateReasoning(msgObj) {
    // 再次双重保险：非 AI 消息绝不处理思考逻辑
    if (msgObj.role !== 'ai' && msgObj.role !== 'assistant') return null;

    let reasoningBlock = msgObj.element.querySelector('.reasoning');
    if (!reasoningBlock) return null;

    if (!reasoningBlock.innerHTML) {
        reasoningBlock.innerHTML = `
            <div class="reasoning-toggle">
                <span class="reasoning-icon">▼</span> <span>Thinking Process</span>
            </div>
            <div class="reasoning-content"></div>
        `;
        reasoningBlock.querySelector('.reasoning-toggle').onclick = () => {
            reasoningBlock.classList.toggle('open');
            scrollToBottom();
        };
    }
    return reasoningBlock.querySelector('.reasoning-content');
}

// --- Approval Widget ---
function showApprovalWidget(msgObj) {
    if (!msgObj.attachments || msgObj.attachments.querySelector('.approval-widget')) return;

    const widget = document.createElement('div');
    widget.className = 'approval-widget';
    widget.innerHTML = `
        <div class="widget-block">
            <div class="widget-header">✨ Code Change Proposal</div>
            <div class="widget-body">
                <p style="margin: 0 0 10px 0; font-size: 11px; opacity: 0.8;">Opengravity proposes modifications. Review in Diff Editor.</p>
                <div class="approval-buttons">
                    <button class="btn btn-primary" id="btn-approve">Apply</button>
                    <button class="btn btn-danger" id="btn-reject">Decline</button>
                </div>
            </div>
        </div>
    `;

    widget.querySelector('#btn-approve').onclick = () => {
        vscode.postMessage({ type: 'applyLastDiff' });
        widget.remove();
    };
    widget.querySelector('#btn-reject').onclick = () => {
        vscode.postMessage({ type: 'cancelLastDiff' });
        widget.remove();
    };

    msgObj.attachments.appendChild(widget);
    scrollToBottom();
}

// --- Message Handler ---
window.addEventListener('message', event => {
    const msg = event.data;

    switch (msg.type) {
        case 'updateMode':
            updateStatusBar(msg.value);
            break;

        case 'updateStatus':
            if (msg.value === 'no-workspace') {
                appendMessage('system', '🚫 **No workspace folder open.** Opengravity requires a project folder to function.');
            } else if (msg.value === 'not-initialized' && !hasInitPrompted) {
                appendMessage('ai', '🌌 **Welcome.** Your workspace is structurally ready, but the project workflow is not yet active. Type `/init` to begin.');
                hasInitPrompted = true;
            }
            break;

        case 'aiResponse':
            appendMessage('ai', msg.value);
            setInputEnabled(true);
            break;

        case 'error':
            const errorDiv = document.createElement('div');
            errorDiv.className = 'msg ai error-msg'; // 增加一个 error 样式类
            errorDiv.innerHTML = `<div class="role-label">SYSTEM_ERROR</div><div class="content" style="color: var(--accent-red); font-weight: bold;">${safeParseMarkdown(msg.value)}</div>`;
            chatBox.appendChild(errorDiv);
            setInputEnabled(true); // 发生错误必须解锁
            scrollToBottom();
            break;

        case 'streamStart':
            currentStreamMsg = appendMessage('ai');
            markdownBuffer = "";
            setInputEnabled(false); // 开始说话，锁定输入
            break;

                case 'streamUpdate':
                    let targetMsg = currentStreamMsg;
                    if (!targetMsg) {
                        const aiMsgs = document.querySelectorAll('.msg.ai');
                        if (aiMsgs.length > 0) {
                            const lastAi = aiMsgs[aiMsgs.length - 1];
                            targetMsg = {
                                element: lastAi,
                                content: lastAi.querySelector('.content'),
                                attachments: lastAi.querySelector('.attachments'),
                                role: 'ai'
                            };
                        }
                    }
        
                    if (!targetMsg) return;
        
                    if (msg.dataType === 'reasoning') {
                        const reasoningContent = getOrCreateReasoning(targetMsg);
                        if (reasoningContent) {
                            reasoningContent.textContent += msg.value;
                            reasoningContent.scrollTop = reasoningContent.scrollHeight;
                        }
                    } else if (msg.dataType === 'terminal') {
                        const termBody = getOrCreateWidget(targetMsg, 'terminal', 'Terminal');
                        if (termBody) {
                            if (ansiUp) { termBody.innerHTML += ansiUp.ansi_to_html(msg.value); }
                            else { termBody.textContent += msg.value; }
                            termBody.scrollTop = termBody.scrollHeight;
                        }
                    } else if (msg.dataType === 'diff') {
                        const diffBody = getOrCreateWidget(targetMsg, 'diff', 'Code Changes');
                        if (diffBody) {
                            const lines = msg.value.split('\n');
                            let html = '<div class="diff-view">';
                            lines.forEach(line => {
                                if (line.startsWith('+')) {
                                    html += `<div class="diff-added">${escapeHtml(line)}</div>`;
                                } else if (line.startsWith('-')) {
                                    html += `<div class="diff-removed">${escapeHtml(line)}</div>`;
                                } else if (!line.startsWith('```') && !line.includes('Proposed changes')) {
                                    html += `<div>${escapeHtml(line)}</div>`;
                                }
                            });
                            html += '</div>';
                            diffBody.innerHTML = html;
                        }
                    } else if (msg.dataType === 'tool_status') {
                        const statusBody = getOrCreateWidget(targetMsg, 'action', 'Tool Action');
                        if (statusBody) statusBody.innerHTML = safeParseMarkdown(msg.value);
                    } else {
                        markdownBuffer += msg.value;
                        targetMsg.content.innerHTML = safeParseMarkdown(markdownBuffer);
                    }
                    scrollToBottom();
                    break;
        

        case 'streamEnd':
            if (currentStreamMsg) {
                // [核心增强] 流结束时触发语法高亮
                currentStreamMsg.element.querySelectorAll('pre code').forEach((block) => {
                    hljs.highlightElement(block);
                });
            }
            currentStreamMsg = null;
            setInputEnabled(true); // 结束说话，解锁输入
            break;

        case 'showApprovalPanel':
            const aiMsgs = document.querySelectorAll('.msg.ai');
            if (aiMsgs.length > 0) {
                const lastAi = aiMsgs[aiMsgs.length - 1];
                showApprovalWidget({ 
                    element: lastAi, 
                    attachments: lastAi.querySelector('.attachments'),
                    role: 'ai'
                });
            }
            break;
            
        case 'restoreHistory':
            chatBox.innerHTML = '';
            msg.value.forEach(m => appendMessage(m.role === 'ai' ? 'ai' : 'user', m.content));
            break;
            
        case 'fillInput':
            inputArea.value = msg.value;
            syncHighlighter(); // 填充时也要高亮
            inputArea.focus();
            break;

        case 'clearView':
            chatBox.innerHTML = '';
            break;
    }
});

// Signal ready
vscode.postMessage({ type: 'webviewLoaded' });

// --- Global Key Listeners ---
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        vscode.postMessage({ type: 'abortTask' });
    }
});

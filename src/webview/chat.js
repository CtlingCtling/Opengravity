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
let hasInitPrompted = false;
let isWaitingForApproval = false; // [新增] 审批状态标志

// --- IntelliSense State ---
const suggestionsBox = document.getElementById('suggestions-box');
let currentSuggestions = [];
let activeSuggestionIndex = -1;
let suggestionTrigger = null; // '/' or '@'

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
            msg.innerHTML = '<strong>Opengravity is waiting.</strong><br>Type <span style="color:var(--accent-blue)">/init</span> to start your workflow.';
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
    const text = inputArea.value;
    
    // [借鉴 gemini-cli] 定义核心正则 (支持转义与边界检查)
    const SLASH_REGEX = /^\/[a-z0-9_-]+/i;
    const AT_REGEX = /(?<!\\)@[a-z0-9_.\/\-\[\]]+/gi;
    const SHELL_REGEX = /(?<!\\)![a-z0-9_-]+/gi;

    let html = '';
    let lastIndex = 0;

    // 1. 处理 Slash 指令 (仅限全局开头)
    const slashMatch = text.match(SLASH_REGEX);
    if (slashMatch && slashMatch.index === 0) {
        html += `<span class="hl-slash">${escapeHtml(slashMatch[0])}</span>`;
        lastIndex = slashMatch[0].length;
    }

    // 2. 处理剩余文本的 Tokenization (At 引用与 Shell 指令)
    const remainingText = text.slice(lastIndex);
    const tokens = [];
    
    // 找出所有匹配项并排序
    let m;
    while ((m = AT_REGEX.exec(text)) !== null) {
        if (m.index < lastIndex) continue;
        tokens.push({ index: m.index, length: m[0].length, type: 'hl-at', text: m[0] });
    }
    AT_REGEX.lastIndex = 0; // 重置正则状态

    while ((m = SHELL_REGEX.exec(text)) !== null) {
        if (m.index < lastIndex) continue;
        // 避免与 Slash 或已识别的 Token 重叠
        if (!tokens.some(t => m.index >= t.index && m.index < t.index + t.length)) {
            tokens.push({ index: m.index, length: m[0].length, type: 'hl-shell', text: m[0] });
        }
    }
    SHELL_REGEX.lastIndex = 0;

    tokens.sort((a, b) => a.index - b.index);

    // 拼装 HTML
    tokens.forEach(token => {
        // 添加 Token 之前的普通文本
        html += escapeHtml(text.slice(lastIndex, token.index));
        // 添加高亮 Token
        html += `<span class="${token.type}">${escapeHtml(token.text)}</span>`;
        lastIndex = token.index + token.length;
    });

    // 添加剩余文本
    html += escapeHtml(text.slice(lastIndex));

    // [核心修正] 换行对齐：如果文本以换行符结尾，必须补一个空格，否则 div 高度不会塌陷
    inputHighlighter.innerHTML = html + (text.endsWith('\n') ? ' ' : '');
}

// --- IntelliSense UI ---
function renderSuggestions() {
    if (!suggestionsBox) return;
    if (currentSuggestions.length === 0) {
        suggestionsBox.classList.add('hidden');
        return;
    }

    suggestionsBox.innerHTML = currentSuggestions.map((s, i) => `
        <div class="suggestion-item ${i === activeSuggestionIndex ? 'active' : ''}" data-index="${i}">
            <span class="suggestion-label">${escapeHtml(s.label)}</span>
            <span class="suggestion-desc">${escapeHtml(s.desc)}</span>
        </div>
    `).join('');
    
    suggestionsBox.classList.remove('hidden');

    // [Auto-Scroll Logic]
    if (activeSuggestionIndex !== -1 && suggestionsBox.children[activeSuggestionIndex]) {
        const activeEl = suggestionsBox.children[activeSuggestionIndex];
        if (activeEl.offsetTop < suggestionsBox.scrollTop) {
            suggestionsBox.scrollTop = activeEl.offsetTop;
        } else if (activeEl.offsetTop + activeEl.clientHeight > suggestionsBox.scrollTop + suggestionsBox.clientHeight) {
            suggestionsBox.scrollTop = activeEl.offsetTop + activeEl.clientHeight - suggestionsBox.clientHeight;
        }
    }
    
    suggestionsBox.querySelectorAll('.suggestion-item').forEach(el => {
        el.onclick = () => {
            activeSuggestionIndex = parseInt(el.dataset.index);
            applySuggestion();
        };
    });
}

function applySuggestion() {
    if (activeSuggestionIndex < 0 || activeSuggestionIndex >= currentSuggestions.length) return;
    
    const suggestion = currentSuggestions[activeSuggestionIndex];
    const text = inputArea.value;
    const cursorPos = inputArea.selectionStart;
    const textBeforeCursor = text.slice(0, cursorPos);
    const lastTriggerIndex = textBeforeCursor.lastIndexOf(suggestionTrigger);
    
    if (lastTriggerIndex !== -1) {
        const newText = text.slice(0, lastTriggerIndex) + suggestion.value + ' ' + text.slice(cursorPos);
        inputArea.value = newText;
        const newCursorPos = lastTriggerIndex + suggestion.value.length + 1;
        inputArea.selectionStart = inputArea.selectionEnd = newCursorPos;
        syncHighlighter();
    }
    
    closeSuggestions();
}

function closeSuggestions() {
    currentSuggestions = [];
    activeSuggestionIndex = -1;
    suggestionTrigger = null;
    if (suggestionsBox) suggestionsBox.classList.add('hidden');
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

    // [IntelliSense 探测]
    const text = this.value;
    const cursorPos = this.selectionStart;
    const textBeforeCursor = text.slice(0, cursorPos);
    
    // 探测触发字符
    const lastAt = textBeforeCursor.lastIndexOf('@');
    const lastSlash = textBeforeCursor.lastIndexOf('/');
    
    // @ 补全：必须是行首或空格后
    if (lastAt !== -1 && (lastAt === 0 || textBeforeCursor[lastAt-1] === ' ' || textBeforeCursor[lastAt-1] === '\n')) {
        suggestionTrigger = '@';
        const query = textBeforeCursor.slice(lastAt + 1);
        vscode.postMessage({ type: 'getSuggestions', trigger: '@', query });
    } 
    // / 补全：仅限最开始
    else if (lastSlash === 0) {
        suggestionTrigger = '/';
        const query = textBeforeCursor.slice(1);
        vscode.postMessage({ type: 'getSuggestions', trigger: '/', query });
    } else {
        closeSuggestions();
    }
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

    const type = msgObj.element.dataset.approvalType || 'diff';
    const isCommand = type === 'command';

    const headerText = isCommand ? '🚀 Shell Command Proposal' : '✨ Code Change Proposal';
    const descText = isCommand 
        ? 'Opengravity requests to execute a shell command. Please review carefully.' 
        : 'Opengravity proposes modifications. Review in Diff Editor.';
    const approveText = isCommand ? 'Run Command' : 'Apply Change';
    const rejectText = isCommand ? 'Cancel' : 'Decline';
    const approveBtnClass = isCommand ? 'btn-primary' : 'btn-primary'; // 可以给命令换个颜色，暂且保持一致

    const widget = document.createElement('div');
    widget.className = 'approval-widget';
    widget.innerHTML = `
        <div class="widget-block">
            <div class="widget-header">${headerText}</div>
            <div class="widget-body">
                <p style="margin: 0 0 10px 0; font-size: 11px; opacity: 0.8;">${descText}</p>
                <div class="approval-buttons">
                    <button class="btn ${approveBtnClass}" id="btn-approve">${approveText}</button>
                    <button class="btn btn-danger" id="btn-reject">${rejectText}</button>
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
            isWaitingForApproval = false; // [修复] 重置审批状态
            scrollToBottom();
            break;

        case 'streamStart':
            currentStreamMsg = appendMessage('ai');
            markdownBuffer = "";
            setInputEnabled(false); // 开始说话，锁定输入
            isWaitingForApproval = false; // [修复] 重置审批状态
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
                            // 标记当前消息为 diff 类型，供审批 Widget 判断
                            targetMsg.element.dataset.approvalType = 'diff';
                        }
                    } else if (msg.dataType === 'command_preview') {
                        // [新增] Shell 命令预览
                        const cmdBody = getOrCreateWidget(targetMsg, 'cmd_preview', 'Command to Execute');
                        if (cmdBody) {
                            // 去掉 markdown 代码块标记，只保留命令内容
                            const cleanCmd = msg.value.replace(/```bash\n|```/g, '').trim();
                            cmdBody.innerHTML = `<div style="font-family: monospace; color: #30d158; background: #1c1c1e; padding: 10px; border-radius: 6px;">$ ${escapeHtml(cleanCmd)}</div>`;
                            // 标记当前消息为 command 类型
                            targetMsg.element.dataset.approvalType = 'command';
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
            isWaitingForApproval = true;
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

        case 'updateSuggestions':
            currentSuggestions = msg.value;
            activeSuggestionIndex = currentSuggestions.length > 0 ? 0 : -1;
            renderSuggestions();
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

// --- Input Area Listeners (Highlighting & IntelliSense) ---
inputArea.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 150) + 'px';
    syncHighlighter(); 

    // [IntelliSense 探测]
    const text = this.value;
    const cursorPos = this.selectionStart;
    const textBeforeCursor = text.slice(0, cursorPos);
    
    // 探测触发字符
    const lastAt = textBeforeCursor.lastIndexOf('@');
    const lastSlash = textBeforeCursor.lastIndexOf('/');
    
    // @ 补全：必须是行首或空格后
    if (lastAt !== -1 && (lastAt === 0 || textBeforeCursor[lastAt-1] === ' ' || textBeforeCursor[lastAt-1] === '\n')) {
        suggestionTrigger = '@';
        const query = textBeforeCursor.slice(lastAt + 1);
        vscode.postMessage({ type: 'getSuggestions', trigger: '@', query });
    } 
    // / 补全：仅限最开始
    else if (lastSlash === 0) {
        suggestionTrigger = '/';
        const query = textBeforeCursor.slice(1);
        vscode.postMessage({ type: 'getSuggestions', trigger: '/', query });
    } else {
        closeSuggestions();
    }
});

inputArea.addEventListener('scroll', function() {
    inputHighlighter.scrollTop = this.scrollTop;
});

inputArea.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && e.altKey) {
        e.preventDefault();
        performSend();
    }
});

// --- Global Key Listeners (Navigation & Approval) ---
window.addEventListener('keydown', (e) => {
    // 1. IntelliSense 键盘操控 (优先拦截)
    if (suggestionsBox && !suggestionsBox.classList.contains('hidden')) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeSuggestionIndex = (activeSuggestionIndex + 1) % currentSuggestions.length;
            renderSuggestions();
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeSuggestionIndex = (activeSuggestionIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
            renderSuggestions();
            return;
        }
        if (e.key === 'Tab' || e.key === 'Enter') {
            e.preventDefault();
            applySuggestion();
            return;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            closeSuggestions();
            return;
        }
    }

    // 2. 审批键盘操控
    if (e.key === 'Enter' && isWaitingForApproval && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        vscode.postMessage({ type: 'applyLastDiff' });
        const widget = document.querySelector('.approval-widget');
        if (widget) widget.remove();
        isWaitingForApproval = false;
        return;
    }

    // 3. 紧急阻断 / 取消审批
    if (e.key === 'Escape') {
        if (isWaitingForApproval) {
            vscode.postMessage({ type: 'cancelLastDiff' });
            const widget = document.querySelector('.approval-widget');
            if (widget) widget.remove();
            isWaitingForApproval = false;
        } else {
            vscode.postMessage({ type: 'abortTask' });
        }
    }
});

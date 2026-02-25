import { ChatViewProvider } from '../../chatViewProvider';
import * as vscode from 'vscode';
import { AIProvider } from '../../provider';
import { McpHost } from '../../mcp/mcpHost';
import { HistoryManager } from '../../session/HistoryManager';
import { ChatHistoryService } from '../../services/ChatHistoryService';

// 模拟外部依赖
jest.mock('vscode', () => ({
    WebviewView: jest.fn(),
    window: {
        activeTextEditor: undefined,
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn()
    },
    workspace: {
        workspaceFolders: [{ uri: { fsPath: '/mock/project' } }],
        fs: {
            writeFile: jest.fn().mockResolvedValue(undefined)
        }
    },
    Uri: {
        joinPath: jest.fn((uri, ...parts) => ({ fsPath: parts.join('/'), path: parts.join('/'), scheme: 'file' })),
        file: jest.fn(path => ({ fsPath: path, path, scheme: 'file' }))
    }
}), { virtual: true });

// 模拟状态管理者和服务
jest.mock('../../session/HistoryManager');
jest.mock('../../services/ChatHistoryService');

describe('ChatViewProvider 集成测试 (架构对齐版)', () => {
    let provider: ChatViewProvider;
    let mockAIProvider: jest.Mocked<AIProvider>;
    let mockMcpHost: jest.Mocked<McpHost>;
    let mockWebviewView: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockAIProvider = { generateContentStream: jest.fn() } as any;
        mockMcpHost = {
            getToolsForAI: jest.fn().mockResolvedValue([]),
            getPromptsForAI: jest.fn().mockResolvedValue([]),
            getResourcesForAI: jest.fn().mockResolvedValue([]),
            executeTool: jest.fn()
        } as any;

        mockWebviewView = {
            webview: {
                options: {},
                onDidReceiveMessage: jest.fn(),
                postMessage: jest.fn(),
                asWebviewUri: jest.fn(uri => uri),
                html: ''
            }
        };

        // 核心 Mock 修复：确保 loadCheckpoint 返回可迭代对象
        (ChatHistoryService.prototype.loadCheckpoint as jest.Mock).mockResolvedValue({ history: [] });
        (HistoryManager.prototype.getHistory as jest.Mock).mockReturnValue([]);

        provider = new ChatViewProvider(
            { fsPath: '/mock/extension' } as any,
            async () => mockAIProvider,
            mockMcpHost,
            "System Prompt Base"
        );
    });

    it('初始化时应该通过 ChatHistoryService 加载 session_history', async () => {
        await provider.resolveWebviewView(mockWebviewView);
        expect(ChatHistoryService.prototype.loadCheckpoint).toHaveBeenCalledWith('session_history');
    });

    it('用户消息发送后，应该调用 HistoryManager.addItem 并触发 AI', async () => {
        // 模拟 AI 的简单回复
        mockAIProvider.generateContentStream.mockResolvedValue({ role: 'assistant', content: 'Hello' });
        (HistoryManager.prototype.getHistory as jest.Mock).mockReturnValue([{ role: 'user', content: 'Hi' }]);

        await provider.resolveWebviewView(mockWebviewView);
        const messageHandler = mockWebviewView.webview.onDidReceiveMessage.mock.calls[0][0];
        
        await messageHandler({ type: 'userInput', value: 'Hi' });

        expect(HistoryManager.prototype.addItem).toHaveBeenCalled();
        expect(mockAIProvider.generateContentStream).toHaveBeenCalled();
    });
});

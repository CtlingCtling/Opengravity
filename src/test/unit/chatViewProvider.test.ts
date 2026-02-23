import { ChatViewProvider } from '../../chatViewProvider';
import * as vscode from 'vscode';
import { AIProvider } from '../../provider';
import { McpHost } from '../../mcp/mcpHost';
import { Logger } from '../../utils/logger';
import * as fs from 'fs';

// 模拟外部依赖
jest.mock('vscode', () => ({
    WebviewView: jest.fn(),
    window: {
        activeTextEditor: undefined,
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn()
    },
    workspace: {
        workspaceFolders: [{ uri: { fsPath: '/mock/project' } }]
    },
    Uri: {
        joinPath: jest.fn((uri, ...parts) => ({ fsPath: parts.join('/') }))
    }
}), { virtual: true });

// 模拟 fs 模块，防止真实 IO
jest.mock('fs', () => ({
    promises: {
        mkdir: jest.fn().mockResolvedValue(undefined),
        writeFile: jest.fn().mockResolvedValue(undefined),
        readFile: jest.fn().mockResolvedValue('[]'),
        access: jest.fn().mockResolvedValue(undefined)
    }
}));

jest.mock('../../utils/logger');

describe('ChatViewProvider 集成测试', () => {
    let provider: ChatViewProvider;
    let mockAIProvider: jest.Mocked<AIProvider>;
    let mockMcpHost: jest.Mocked<McpHost>;
    let mockWebviewView: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // 实例化 Mock 对象
        mockAIProvider = {
            generateContentStream: jest.fn()
        } as any;

        mockMcpHost = {
            getToolsForAI: jest.fn().mockResolvedValue([]),
            getPromptsForAI: jest.fn().mockResolvedValue([]),
            getResourcesForAI: jest.fn().mockResolvedValue([]),
            executeTool: jest.fn(),
            getPromptContent: jest.fn()
        } as any;

        mockWebviewView = {
            webview: {
                options: {},
                onDidReceiveMessage: jest.fn(),
                postMessage: jest.fn(),
                asWebviewUri: jest.fn(uri => uri)
            }
        };

        provider = new ChatViewProvider(
            { fsPath: '/mock/extension' } as any,
            () => mockAIProvider,
            mockMcpHost,
            "System Prompt Base"
        );
    });

    it('should inject MCP information into system prompt on first message', async () => {
        // 模拟 MCP 返回一些资源和工具
        mockMcpHost.getPromptsForAI.mockResolvedValue([
            { serverName: 'test', name: 'expert', description: 'desc', arguments: [] }
        ]);
        
        // 模拟 AI 的简单回复
        mockAIProvider.generateContentStream.mockResolvedValue({
            role: 'assistant',
            content: 'Hello'
        });

        // 模拟 resolveWebviewView 被调用（初始化）
        await provider.resolveWebviewView(mockWebviewView);

        // 获取 handleUserMessage
        const messageHandler = mockWebviewView.webview.onDidReceiveMessage.mock.calls[0][0];
        await messageHandler({ type: 'userInput', value: 'Hi' });

        // 验证 AIProvider 收到的第一条消息（System Prompt）是否包含了 MCP 信息
        const sentMessages = mockAIProvider.generateContentStream.mock.calls[0][0];
        const systemMessage = sentMessages.find(m => m.role === 'system');
        
        expect(systemMessage).toBeDefined();
        if (systemMessage) {
            expect(systemMessage.content).toContain('Available MCP Prompts');
            expect(systemMessage.content).toContain('test');
            expect(systemMessage.content).toContain('expert');
        }
    });

    it('should correctly route tool calls to McpHost', async () => {
        // 模拟 AI 返回一个工具调用
        mockAIProvider.generateContentStream.mockResolvedValueOnce({
            role: 'assistant',
            content: '',
            tool_calls: [{
                id: 'call_1',
                function: {
                    name: 'server__tool',
                    arguments: JSON.stringify({ arg: 1 })
                }
            }]
        }).mockResolvedValueOnce({
            role: 'assistant',
            content: 'Done'
        });

        mockMcpHost.executeTool.mockResolvedValue('Tool Result');

        await provider.resolveWebviewView(mockWebviewView);
        const messageHandler = mockWebviewView.webview.onDidReceiveMessage.mock.calls[0][0];
        await messageHandler({ type: 'userInput', value: 'Use tool' });

        // 验证是否调用了 mcpHost.executeTool
        expect(mockMcpHost.executeTool).toHaveBeenCalledWith('server__tool', { arg: 1 });
    });
});

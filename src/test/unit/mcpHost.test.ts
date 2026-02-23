import { McpHost } from '../../mcp/mcpHost';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

// 模拟 vscode
jest.mock('vscode', () => ({
    workspace: {
        workspaceFolders: [{ uri: { fsPath: '/mock/project' } }]
    },
    window: {
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn()
    }
}), { virtual: true });

// 模拟 fs
jest.mock('fs', () => ({
    promises: {
        access: jest.fn(),
        readFile: jest.fn()
    }
}));

// 模拟 MCP SDK
jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
    Client: jest.fn().mockImplementation(() => ({
        connect: jest.fn().mockResolvedValue(undefined),
        request: jest.fn(),
        close: jest.fn()
    }))
}), { virtual: true });

jest.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
    StdioClientTransport: jest.fn()
}), { virtual: true });

describe('McpHost 协议合规性测试', () => {
    let mcpHost: McpHost;

    beforeEach(() => {
        jest.clearAllMocks();
        mcpHost = new McpHost();
    });

    it('startup 应该正确加载配置并连接服务器', async () => {
        const mockConfig = {
            mcpServers: {
                "test-server": { command: "node", args: ["server.js"] }
            }
        };

        // 模拟配置文件存在且内容正确
        (fs.promises.access as jest.Mock).mockResolvedValue(undefined);
        (fs.promises.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockConfig));

        await mcpHost.startup();

        // 验证是否创建了 Client 实例
        expect(Client).toHaveBeenCalled();
        
        // 验证是否使用了正确的 capabilities (Host 端规范)
        const clientOptions = (Client as jest.Mock).mock.calls[0][1];
        expect(clientOptions.capabilities).toBeDefined();
        // 客户端不应该在顶层 capabilities 中包含 tools/prompts/resources
        expect(clientOptions.capabilities.tools).toBeUndefined();
    });

    it('getResourceContent 应该发出标准的 resources/read 请求', async () => {
        // 先手动注入一个 mock client 到 mcpHost (通过 startup 模拟)
        const mockClient = {
            request: jest.fn().mockResolvedValue({
                contents: [{ text: "mock resource content" }]
            })
        };
        (mcpHost as any).clients.set('test-server', mockClient);

        const uri = 'file:///mock/resource';
        const result = await mcpHost.getResourceContent('test-server', uri);

        // 验证请求的方法名和参数是否符合 MCP 标准
        expect(mockClient.request).toHaveBeenCalledWith(
            { method: 'resources/read', params: { uri } },
            expect.anything()
        );
        expect(result).toBe('mock resource content');
    });
});

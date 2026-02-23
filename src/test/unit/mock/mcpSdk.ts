import { jest } from '@jest/globals';

/**
 * 模拟 MCP SDK 的 StdioClientTransport
 */
export class StdioClientTransport {
    constructor(public params: any) {}
}

/**
 * 模拟 MCP SDK 的 Client 类
 */
export class Client {
    constructor(public info: any, public options: any) {}

    // 核心模拟方法：request
    // 在测试中，我们可以通过 client.request.mockResolvedValue(...) 来定义预期的服务器返回
    request = jest.fn();

    // 模拟连接与关闭
    connect = jest.fn(async () => {});
    close = jest.fn(async () => {});
}

/**
 * 导出必要的结果 Schema 模拟
 * 实际上我们只需要它们作为 request 方法的参数占位符
 */
export const CallToolResultSchema = {};
export const ListToolsResultSchema = {};
export const ListPromptsResultSchema = {};
export const GetPromptResultSchema = {};
export const ListResourcesResultSchema = {};
export const ReadResourceResultSchema = {};

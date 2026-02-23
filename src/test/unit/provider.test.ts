import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import { DeepSeekProvider } from '../../provider';
import OpenAI from 'openai';

// 1. 定义一个外部变量持有 Mock 函数，方便在测试用例中访问
const mockCreate = jest.fn();

// 2. 使用工厂函数模式模拟 openai 模块
jest.mock('openai', () => {
    return {
        __esModule: true,
        default: jest.fn().mockImplementation(() => ({
            chat: {
                completions: {
                    create: mockCreate
                }
            }
        }))
    };
});

describe('DeepSeekProvider Unit Tests', () => {
    let provider: DeepSeekProvider;
    const mockApiKey = 'test-key';

    beforeEach(() => {
        // 清理 Mock 函数的状态，确保测试用例之间不互相干扰
        mockCreate.mockReset();
        provider = new DeepSeekProvider(mockApiKey);
    });

    test('应该正确处理内容块和推理块', async () => {
        const mockOnUpdate = jest.fn();
        const mockStream = (async function* () {
            yield { choices: [{ delta: { reasoning_content: 'Thought: ' } }] };
            yield { choices: [{ delta: { content: 'Hello ' } }] };
            yield { choices: [{ delta: { content: 'world!' } }] };
        })();

        // 使用 any 断言绕过复杂的 Stream 类型检查
        (mockCreate as any).mockResolvedValue(mockStream);

        const result = await provider.generateContentStream([], mockOnUpdate as any);

        // 验证回调是否按预期触发
        expect(mockOnUpdate).toHaveBeenCalledWith({ type: 'reasoning', delta: 'Thought: ' });
        expect(mockOnUpdate).toHaveBeenCalledWith({ type: 'content', delta: 'Hello ' });
        expect(mockOnUpdate).toHaveBeenCalledWith({ type: 'content', delta: 'world!' });

        // 验证最终合并的返回结果
        expect(result.content).toBe('Hello world!');
        expect(result.reasoning_content).toBe('Thought: ');
    });

    test('应该处理并修复格式错误的工具调用参数', async () => {
        const mockStream = (async function* () {
            // 保持 yield 的对象结构尽可能简单且一致
            yield { choices: [{ delta: { 
                tool_calls: [{ 
                    index: 0, 
                    id: '1', 
                    function: { name: 'test_tool', arguments: '{"key": "val' }
                }] 
            } }] };
            yield { choices: [{ delta: { 
                tool_calls: [{ 
                    index: 0, 
                    function: { arguments: 'ue"}' } 
                }] 
            } }] };
        })();

        (mockCreate as any).mockResolvedValue(mockStream);

        const result = await provider.generateContentStream([], () => {});

        // 验证不完整的 JSON 块是否被正确拼接并解析为合法的 JSON 字符串
        expect(result.tool_calls?.[0].function.arguments).toBe('{"key":"value"}');
    });

    test('当 API 出错时应记录错误并返回错误消息', async () => {
        const mockOnUpdate = jest.fn();
        const apiError = new Error('API Rate Limit Exceeded');

        (mockCreate as any).mockRejectedValue(apiError);

        const result = await provider.generateContentStream([], mockOnUpdate as any);

        // 验证回调是否通知了错误
        expect(mockOnUpdate).toHaveBeenCalledWith({ 
            type: 'content', 
            delta: expect.stringContaining('[API Error]') 
        });

        // 验证最终返回的对象包含错误内容
        expect(result.content).toBe('API Rate Limit Exceeded');
    });
});

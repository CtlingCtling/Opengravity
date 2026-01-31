import OpenAI from "openai";
import { OPGV_TOOLS } from "./tools/definitions"; 

export interface StreamUpdate {
    type: 'reasoning' | 'content';
    delta: string;
}

// 定义完善的消息结构，支持工具角色
export interface ApiMessage {
    role: 'user' | 'assistant' | 'system' | 'tool'; 
    content: string;
    reasoning_content?: string; 
    tool_calls?: any[];
    tool_call_id?: string;
}

export interface AIProvider {
    generateContentStream(
        messages: ApiMessage[], 
        onUpdate: (update: StreamUpdate) => void
    ): Promise<ApiMessage>;
}

export class DeepSeekProvider implements AIProvider {
    private openai: OpenAI;

    constructor(apiKey: string) {
        this.openai = new OpenAI({
            baseURL: 'https://api.deepseek.com', 
            apiKey: apiKey,
        });
    }

    async generateContentStream(
        messages: ApiMessage[], 
        onUpdate: (update: StreamUpdate) => void
    ): Promise<ApiMessage> {
        try {
            // 1. 按照官方建议：清理历史消息中的 reasoning_content
            // 仅保留 role 和 content，并回传之前的 tool_calls 记录
            const cleanedMessages = messages.map(m => ({
                role: m.role,
                content: m.content,
                tool_calls: m.tool_calls,
                tool_call_id: m.tool_call_id
            }));

            // 2. 发起 API 请求，挂载工具箱
            const stream = await this.openai.chat.completions.create({
                model: "deepseek-reasoner",
                messages: cleanedMessages as any,
                stream: true,
                tools: OPGV_TOOLS as any, // 👈 必须开启工具调用
                tool_choice: "auto"
            });

            let fullContent = "";
            let fullReasoning = "";
            
            // 【关键】用于累积流式传输中的工具调用碎片
            let toolCallsBuffer: any[] = [];

            for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta;
                if (!delta) {
                    continue;
                }
                
                // A. 处理思维链 (Reasoning)
                const reasoning = (delta as any).reasoning_content;
                if (reasoning) {
                    fullReasoning += reasoning;
                    onUpdate({ type: 'reasoning', delta: reasoning });
                }

                // B. 处理正文 (Content)
                if (delta.content) {
                    fullContent += delta.content;
                    onUpdate({ type: 'content', delta: delta.content });
                }

                // C. 处理工具调用碎片 (Tool Calls)
                if (delta.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        if (tc.index === undefined) {
                            continue;
                        }
                        // 初始化该索引的工具对象
                        if (!toolCallsBuffer[tc.index]) {
                            toolCallsBuffer[tc.index] = {
                                id: tc.id,
                                type: "function",
                                function: { name: tc.function?.name, arguments: "" }
                            };
                        }
                        
                        // 累加参数碎片（arguments 在流中是分散的字符串）
                        if (tc.function?.arguments) {
                            toolCallsBuffer[tc.index].function.arguments += tc.function.arguments;
                        }
                    }
                }
            }

            // 返回完整的回复对象，包含累积好的 tool_calls
            return { 
                role: 'assistant', 
                content: fullContent, 
                reasoning_content: fullReasoning,
                tool_calls: toolCallsBuffer.length > 0 ? toolCallsBuffer : undefined
            };

        } catch (error: any) {
            const errorText = `[❌]API Error: ${error.message}`;
            onUpdate({ type: 'content', delta: errorText });
            return { role: 'assistant', content: errorText };
        }
    }
}

// 同样的逻辑应用到 Gemini (如果未来你要用 Gemini 的工具调用，结构是一样的)
export class GeminiProvider implements AIProvider {
    private apiKey: string;
    constructor(apiKey: string) { this.apiKey = apiKey; }

    async generateContentStream(
        messages: ApiMessage[], 
        onUpdate: (update: StreamUpdate) => void
    ): Promise<ApiMessage> {
        const msg = "Gemini 引擎暂未在当前版本适配工具调用。";
        onUpdate({ type: 'content', delta: msg });
        return { role: 'assistant', content: msg };
    }
}
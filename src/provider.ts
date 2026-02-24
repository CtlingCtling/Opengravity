import OpenAI from "openai";
import { Logger } from './utils/logger';

export interface StreamUpdate { type: 'reasoning' | 'content'; delta: string; }
export interface ApiMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string | null;
    reasoning_content?: string;
    tool_calls?: any[];
    tool_call_id?: string;
}

export interface AIProvider {
    generateContentStream(messages: ApiMessage[], onUpdate: (update: StreamUpdate) => void, tools?: any[]): Promise<ApiMessage>;
}

export class DeepSeekProvider implements AIProvider {
    private openai: OpenAI;
    private static readonly MAX_TOKENS = 8192;

    constructor(apiKey: string) {
        this.openai = new OpenAI({ baseURL: 'https://api.deepseek.com/v1', apiKey });
    }

    async generateContentStream(messages: ApiMessage[], onUpdate: (update: StreamUpdate) => void, tools?: any[]): Promise<ApiMessage> {
        try {
            const cleanedMessages = messages.map(m => {
                const msg: any = { role: m.role, content: m.content };
            
                if (m.tool_calls) {
                    msg.tool_calls = m.tool_calls;
                    msg.reasoning_content = m.reasoning_content;
                }

                if (m.tool_call_id) {
                    msg.tool_call_id = m.tool_call_id;
                }
            
                return msg;
            });

            const stream = await this.openai.chat.completions.create({
                model: "deepseek-reasoner",
                messages: cleanedMessages as any,
                stream: true,
                tools: tools && tools.length > 0 ? tools : undefined,
                tool_choice: "auto",
                max_tokens: DeepSeekProvider.MAX_TOKENS
            });

            let fullContent = "", fullReasoning = "", toolCallsBuffer: any[] = [];

            for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta;
                if (!delta) {
                    continue;
                }
                const reasoning = (delta as any).reasoning_content;
                if (reasoning) { fullReasoning += reasoning; onUpdate({ type: 'reasoning', delta: reasoning }); }
                if (delta.content) { fullContent += delta.content; onUpdate({ type: 'content', delta: delta.content }); }
                if (delta.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        if (tc.index === undefined) {
                            continue;
                        }
                        if (!toolCallsBuffer[tc.index]) {
                            toolCallsBuffer[tc.index] = { id: tc.id, type: "function", function: { name: tc.function?.name, arguments: "" } };
                        }
                        if (tc.function?.arguments) {
                            toolCallsBuffer[tc.index].function.arguments += tc.function.arguments;
                        }
                    }
                }
            }
            
            // Validate tool call arguments after the stream has finished
            for (const toolCall of toolCallsBuffer) {
                if (toolCall.function?.arguments) {
                    try {
                        const parsedArgs = JSON.parse(toolCall.function.arguments);
                        toolCall.function.arguments = JSON.stringify(parsedArgs); // Re-stringify to ensure clean JSON string
                    } catch (jsonError: any) {
                        Logger.error(`Error parsing tool call arguments for tool '${toolCall.function.name}'. Original arguments: ${toolCall.function.arguments}`, jsonError);
                        toolCall.function.arguments = JSON.stringify({ error: `Invalid JSON arguments from AI: ${jsonError.message}` });
                    }
                }
            }

            return { role: 'assistant', content: fullContent || null, reasoning_content: fullReasoning, tool_calls: toolCallsBuffer.length > 0 ? toolCallsBuffer : undefined };
        } catch (error: any) {
            Logger.error(`API Error: ${error.message}`, error); 
            let errorMsg = `[API Error]: ${error.message}`;
            if (error.message.includes('context length')) {
                errorMsg += "\n\n💡 **Tip:** Context is near its limit. Use `/compress` to prune conversation history.";
            }
            onUpdate({ type: 'content', delta: errorMsg });
            return { role: 'assistant', content: error.message };
        }
    }
}

export class GeminiProvider implements AIProvider {
    private apiKey: string;
    constructor(apiKey: string) { this.apiKey = apiKey; }
    async generateContentStream(messages: ApiMessage[], onUpdate: (update: StreamUpdate) => void, tools?: any[]): Promise<ApiMessage> {
        const msg = "Gemini Provider 暂未适配";
        onUpdate({ type: 'content', delta: msg });
        return { role: 'assistant', content: msg };
    }
}
import OpenAI from "openai";

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
    constructor(apiKey: string) {
        this.openai = new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey });
    }

    async generateContentStream(messages: ApiMessage[], onUpdate: (update: StreamUpdate) => void, tools?: any[]): Promise<ApiMessage> {
        try {
            const cleanedMessages = messages.map(m => {
                const msg: any = { role: m.role, content: m.content };
            
            // 如果这条消息有工具调用，必须把它的思考过程和工具指令一起传回去！
                if (m.tool_calls) {
                    msg.tool_calls = m.tool_calls;
                    msg.reasoning_content = m.reasoning_content; // 👈 关键：保留这个
                }
            
            // 如果是工具的结果消息，必须带上 ID
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
                max_tokens: 65000 // 防止截断
            });

            let fullContent = "", fullReasoning = "", toolCallsBuffer: any[] = [];

            for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta;
                if (!delta) continue;
                const reasoning = (delta as any).reasoning_content;
                if (reasoning) { fullReasoning += reasoning; onUpdate({ type: 'reasoning', delta: reasoning }); }
                if (delta.content) { fullContent += delta.content; onUpdate({ type: 'content', delta: delta.content }); }
                if (delta.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        if (tc.index === undefined) continue;
                        if (!toolCallsBuffer[tc.index]) {
                            toolCallsBuffer[tc.index] = { id: tc.id, type: "function", function: { name: tc.function?.name, arguments: "" } };
                        }
                        if (tc.function?.arguments) toolCallsBuffer[tc.index].function.arguments += tc.function.arguments;
                    }
                }
            }
            return { role: 'assistant', content: fullContent || null, reasoning_content: fullReasoning, tool_calls: toolCallsBuffer.length > 0 ? toolCallsBuffer : undefined };
        } catch (error: any) {
            onUpdate({ type: 'content', delta: `[API Error]: ${error.message}` });
            return { role: 'assistant', content: error.message };
        }
    }
}

export class GeminiProvider implements AIProvider {
    private apiKey: string;
    constructor(apiKey: string) { this.apiKey = apiKey; }
    async generateContentStream(messages: ApiMessage[], onUpdate: (update: StreamUpdate) => void, tools?: any[]): Promise<ApiMessage> {
        const msg = "Gemini Provider 暂未适配 MCP。";
        onUpdate({ type: 'content', delta: msg });
        return { role: 'assistant', content: msg };
    }
}
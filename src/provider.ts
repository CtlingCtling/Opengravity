import OpenAI from "openai";

export interface StreamUpdate {
    type: 'reasoning' | 'content';
    delta: string;
}

// 定义符合 OpenAI 标准的消息结构
export interface ApiMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    reasoning_content?: string; // 适配 DeepSeek 推理模型
}

export interface AIProvider {
    generateContentStream(
        messages: ApiMessage[], // 👈 修改：接收完整消息流
        onUpdate: (update: StreamUpdate) => void
    ): Promise<ApiMessage>; // 👈 修改：返回一个完整的新消息对象
}

export class DeepSeekProvider implements AIProvider {
    private openai: OpenAI;

    constructor(apiKey: string) {
        this.openai = new OpenAI({
            baseURL: 'https://api.deepseek.com', // 官方推荐 base_url
            apiKey: apiKey,
        });
    }

    async generateContentStream(
        messages: ApiMessage[], 
        onUpdate: (update: StreamUpdate) => void
    ): Promise<ApiMessage> {
        try {
            // 1. 根据官方建议：清理掉历史消息中的 reasoning_content
            // 只有当前正在进行的 Turn 需要回传它，但我们这里处理的是新的一轮
            const cleanedMessages = messages.map(m => ({
                role: m.role,
                content: m.content
                // 故意不传 reasoning_content 给下一轮
            }));

            const stream = await this.openai.chat.completions.create({
                model: "deepseek-reasoner",
                messages: cleanedMessages as any,
                stream: true,
            });

            let fullContent = "";
            let fullReasoning = "";

            for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta;
                
                // 处理思维链
                const reasoning = (delta as any).reasoning_content;
                if (reasoning) {
                    fullReasoning += reasoning;
                    onUpdate({ type: 'reasoning', delta: reasoning });
                }

                // 处理正文
                if (delta?.content) {
                    fullContent += delta.content;
                    onUpdate({ type: 'content', delta: delta.content });
                }
            }

            // 返回完整的回复对象，供后续存入上下文
            return { 
                role: 'assistant', 
                content: fullContent, 
                reasoning_content: fullReasoning 
            };

        } catch (error: any) {
            const errorText = `[API Error]: ${error.message}`;
            onUpdate({ type: 'content', delta: errorText });
            return { role: 'assistant', content: errorText };
        }
    }
}

export class GeminiProvider implements AIProvider {
    private openai: OpenAI;

    constructor(apiKey: string) {
        this.openai = new OpenAI({
            baseURL: 'https://api.deepseek.com', // 官方推荐 base_url
            apiKey: apiKey,
        });
    }

    async generateContentStream(
        messages: ApiMessage[], 
        onUpdate: (update: StreamUpdate) => void
    ): Promise<ApiMessage> {
        try {
            // 1. 根据官方建议：清理掉历史消息中的 reasoning_content
            // 只有当前正在进行的 Turn 需要回传它，但我们这里处理的是新的一轮
            const cleanedMessages = messages.map(m => ({
                role: m.role,
                content: m.content
                // 故意不传 reasoning_content 给下一轮
            }));

            const stream = await this.openai.chat.completions.create({
                model: "deepseek-reasoner",
                messages: cleanedMessages as any,
                stream: true,
            });

            let fullContent = "";
            let fullReasoning = "";

            for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta;
                
                // 处理思维链
                const reasoning = (delta as any).reasoning_content;
                if (reasoning) {
                    fullReasoning += reasoning;
                    onUpdate({ type: 'reasoning', delta: reasoning });
                }

                // 处理正文
                if (delta?.content) {
                    fullContent += delta.content;
                    onUpdate({ type: 'content', delta: delta.content });
                }
            }

            // 返回完整的回复对象，供后续存入上下文
            return { 
                role: 'assistant', 
                content: fullContent, 
                reasoning_content: fullReasoning 
            };

        } catch (error: any) {
            const errorText = `[API Error]: ${error.message}`;
            onUpdate({ type: 'content', delta: errorText });
            return { role: 'assistant', content: errorText };
        }
    }
}
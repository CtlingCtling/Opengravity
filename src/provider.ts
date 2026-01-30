import OpenAI from "openai";

// 定义流式更新的数据结构
export interface StreamUpdate {
    type: 'reasoning' | 'content'; // 是思考过程，还是正文？
    delta: string;                 // 这次吐出的字符
}

export interface AIProvider {
    // 旧的非流式方法可以保留作为备用，或者删掉
    // 新增流式方法：
    generateContentStream(
        prompt: string, 
        onUpdate: (update: StreamUpdate) => void, 
        systemPrompt?: string
    ): Promise<string>; // 返回完整的最终内容用于存历史
}

export class DeepSeekProvider implements AIProvider {
    private openai: OpenAI;

    constructor(apiKey: string) {
        this.openai = new OpenAI({
            baseURL: 'https://api.deepseek.com', // 确认是用 v1 还是根路径，DeepSeek 有时会有变动，通常是 base
            apiKey: apiKey,
        });
    }

    async generateContentStream(
        prompt: string, 
        onUpdate: (update: StreamUpdate) => void, 
        systemPrompt?: string
    ): Promise<string> {
        try {
            const stream = await this.openai.chat.completions.create({
                model: "deepseek-reasoner", // 👈 使用推理模型 R1
                messages: [
                    { role: "system", content: systemPrompt || "You are a helpful assistant." },
                    { role: "user", content: prompt }
                ],
                stream: true, // 👈 开启流式
            });

            let fullContent = "";

            for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta;
                
                // 1. 处理思维链 (DeepSeek 特有字段)
                // TS 不知道有这个字段，所以要 as any
                const reasoning = (delta as any).reasoning_content;
                if (reasoning) {
                    onUpdate({ type: 'reasoning', delta: reasoning });
                }

                // 2. 处理正文
                if (delta?.content) {
                    fullContent += delta.content;
                    onUpdate({ type: 'content', delta: delta.content });
                }
            }

            return fullContent;

        } catch (error: any) {
            console.error(error);
            // 发生错误时，把它伪装成一段正文发回去
            const errorMsg = `[Error]: ${error.message}`;
            onUpdate({ type: 'content', delta: errorMsg });
            return errorMsg;
        }
    }
}

// Gemini 暂时留空或照葫芦画瓢
export class GeminiProvider implements AIProvider {
    constructor(apiKey: string) {}
    async generateContentStream(prompt: string, onUpdate: (update: StreamUpdate) => void, systemPrompt?: string): Promise<string> {
        onUpdate({ type: 'content', delta: "Gemini stream not implemented yet." });
        return "Gemini stream not implemented yet.";
    }
}
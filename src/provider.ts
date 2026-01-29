// axios: 用来发送网络请求的工具
// axios: the tool used to send web requests.
import axios from 'axios';

// --- (1) 定义“合同” (Interface) ---
// 这个接口规定了：任何一个 AI 引擎，都必须有一个叫 generateContent 的方法
// 它接收一个字符串 prompt，返回一个 Promise<string> (可以理解为“未来会收到的字符串”)
export interface AIProvider {
    generateContent(prompt: string, systemPrompt?: string): Promise<string>;
}

// --- (2) 建造“DeepSeek 引擎” ---
// 这个类实现了我们上面定义的“合同”
export class DeepSeekProvider implements AIProvider {
    // 私有变量，用来存 API Key
    private apiKey: string;

    // 构造函数：当我们 new DeepSeekProvider(...) 时，必须把 Key 传进来
    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    // 实现了合同里规定的 generateContent 方法
    async generateContent(prompt: string, systemPrompt?: string): Promise<string> {
        const url = "https://api.deepseek.com/chat/completions";
        
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
        };

        const body = {
            model: "deepseek-chat", // 或者用 "deepseek-coder"
            messages: [
                { role: "system", content: systemPrompt || "You are a helpful assistant in VS Code." },
                { role: "user", content: prompt }
            ]
        };

        try {
            // 发送 POST 请求到 DeepSeek 服务器
            const response = await axios.post(url, body, { headers });
            
            // 从返回的 JSON 数据里，解析出 AI 的回复
            return response.data.choices.message.content;
        } catch (error) {
            // 如果出错了，打印错误信息并返回一个错误提示
            console.error(error);
            if (axios.isAxiosError(error) && error.response) {
                // 把更详细的 API 错误信息返回
                return `Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`;
            }
            return `An unexpected error occurred: ${error}`;
        }
    }
}

// --- (3) 预留“Gemini 引擎”的位置 (现在先不写) ---
export class GeminiProvider implements AIProvider {
    constructor(apiKey: string) {
        // ...
    }

    async generateContent(prompt: string, systemPrompt?: string): Promise<string> {
        // TODO: 在这里实现调用 Gemini API 的逻辑
        return "Gemini provider is not implemented yet.";
    }
}
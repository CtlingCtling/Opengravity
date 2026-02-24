/**
 * ## definitions.ts - Opengravity 工具的定义
 */

export const OPGV_TOOLS = [
    {
        type: "function",
        function: {
            name: "read_file",
            description: "读取工作区内指定文件的完整内容。在分析代码或笔记前必须先调用此工具。",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string", description: "文件的相对路径，例如 'notes/idea.md'" }
                },
                required: ["path"],
                additionalProperties: false
            },
            strict: true
        }
    },
    {
        type: "function",
        function: {
            name: "write_file",
            description: "在指定路径创建新文件或覆盖现有文件。必须提供完整的内容。",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string", description: "目标文件的相对路径" },
                    content: { type: "string", description: "要写入文件的完整内容" }
                },
                required: ["path", "content"],
                additionalProperties: false
            },
            strict: true
        }
    },
    {
        type: "function",
        function: {
            name: "replace",
            description: "精准局部修改工具。通过定位旧文本片段并替换为新文本，适用于修改大文件而无需重写全文。建议提供至少 3 行上下文以保证唯一定位。",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string", description: "目标文件的相对路径" },
                    old_string: { type: "string", description: "待替换的精确原文本" },
                    new_string: { type: "string", description: "替换后的新文本" },
                    instruction: { type: "string", description: "本次修改的简要描述" }
                },
                required: ["path", "old_string", "new_string", "instruction"],
                additionalProperties: false
            },
            strict: true
        }
    },
    {
        type: "function",
        function: {
            name: "run_command",
            description: "在用户终端执行 Shell 命令（如编译 gcc、查看目录 ls 等）。",
            parameters: {
                type: "object",
                properties: {
                    command: { type: "string", description: "要执行的完整命令字符串" }
                },
                required: ["command"],
                additionalProperties: false
            },
            strict: true
        }
    },
    {
        type: "function",
        function: {
            name: "get_mcp_prompt",
            description: "获取特定 MCP 服务器注册的提示词模板的具体内容。当你想使用某种预设的角色或任务模板时调用此工具。",
            parameters: {
                type: "object",
                properties: {
                    server_name: { type: "string", description: "MCP 服务器名称" },
                    prompt_name: { type: "string", description: "提示词模板名称" },
                    arguments: { type: "object", description: "提示词模板所需的参数（键值对）", additionalProperties: { type: "string" } }
                },
                required: ["server_name", "prompt_name"],
                additionalProperties: false
            },
            strict: true
        }
    },
    {
        type: "function",
        function: {
            name: "get_mcp_resource",
            description: "获取特定 MCP 服务器注册的静态资源（如知识文件、API文档）的具体内容。",
            parameters: {
                type: "object",
                properties: {
                    server_name: { type: "string", description: "MCP 服务器名称" },
                    uri: { type: "string", description: "资源的唯一 URI" }
                },
                required: ["server_name", "uri"],
                additionalProperties: false
            },
            strict: true
        }
    }
];
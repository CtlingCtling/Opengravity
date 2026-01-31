/**
 * definitions.ts - Opengravity 工具箱的说明书
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
    }
];
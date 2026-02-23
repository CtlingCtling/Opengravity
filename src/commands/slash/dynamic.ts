import { ICommand, CommandContext, CommandResult } from '../ICommand';

/**
 * 动态指令类：用于承载从 TOML 文件加载的自定义技能
 */
export class DynamicTOMLCommand implements ICommand {
    constructor(
        public name: string,
        public description: string,
        private promptTemplate: string
    ) {}

    async execute(args: string[], context: CommandContext): Promise<CommandResult> {
        // 简单的参数替换逻辑：将 {{input}} 替换为用户输入的剩余参数
        const userInput = args.join(' ');
        const finalPrompt = this.promptTemplate.replace(/\{\{input\}\}/g, userInput);

        // 通过回调将合成后的 Prompt 注入对话流，触发 AI 回复
        await context.onInjectMessage(finalPrompt);

        return { status: 'intercepted' }; // 标记为拦截并消费
    }
}

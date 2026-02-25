import { ICommand, CommandContext, CommandResult } from '../ICommand';
import { TemplateManager } from '../../utils/templateManager';

/**
 * DynamicTOMLCommand: 用于承载从 TOML 文件加载的自定义技能
 * 逻辑已切换到统一的 TemplateManager 渲染引擎
 */
export class DynamicTOMLCommand implements ICommand {
    constructor(
        public name: string,
        public description: string,
        private promptTemplate: string
    ) {}

    async execute(args: string[], context: CommandContext): Promise<CommandResult> {
        try {
            // 使用统一引擎合成最终 Prompt
            const finalPrompt = await TemplateManager.render(this.promptTemplate, {
                args: args.join(' '),
                input: args.join(' ')
            });

            // 通过回调将合成后的 Prompt 注入对话流，触发 AI 回复
            await context.onInjectMessage(finalPrompt);

            return { status: 'intercepted' };
        } catch (error: any) {
            return { status: 'error', message: `合成指令失败: ${error.message}` };
        }
    }
}

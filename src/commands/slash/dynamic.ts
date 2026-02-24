import { ICommand, CommandContext, CommandResult } from '../ICommand';
import { SkillLoader } from '../utils/SkillLoader';

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
        // 调用 SkillLoader 进行深度提示词合成（处理引用和参数）
        const finalPrompt = await SkillLoader.synthesize(this.promptTemplate, args);

        // 通过回调将合成后的 Prompt 注入对话流，触发 AI 回复
        await context.onInjectMessage(finalPrompt);

        return { status: 'intercepted' }; // 标记为拦截并消费
    }
}

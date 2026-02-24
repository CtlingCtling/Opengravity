import { ICommand, CommandContext, CommandResult } from '../ICommand';

export class AboutCommand implements ICommand {
    public name = 'about';
    public description = '显示关于 Opengravity 的版本信息';

    async execute(args: string[], context: CommandContext): Promise<CommandResult> {
        // 从 package.json 获取版本（这里先硬编码，后续可以完善）
        const info = `\n### 🤖 Opengravity\n**Version**: 0.0.1\n**Description**: 基于 AI 的专业工作流管理系统。\n**GitHub**: https://github.com/CtlingCtling/Opengravity\n\n欢迎访问我的 GitHub 仓库获取最新信息和更新！`;

        // 直接向 Webview 推送消息
        await context.webview.postMessage({
            type: 'aiResponse',
            value: info
        });

        return { status: 'success' };
    }
}

import { ICommand, CommandContext, CommandResult } from '../ICommand';
import { SkillManager } from '../../utils/skillManager';

/**
 * SkillsCommand: 技能管理指令
 * 支持: /skills list, /skills reload
 */
export class SkillsCommand implements ICommand {
    name = 'skills';
    description = '管理与查看 Agent Skills (list/reload)';

    async execute(args: string[], context: CommandContext): Promise<CommandResult> {
        const subCommand = args[0]?.toLowerCase() || 'list';

        switch (subCommand) {
            case 'list':
                return await this.listSkills(context);
            case 'reload':
                return await this.reloadSkills(context);
            default:
                return { status: 'error', message: `未知子指令: ${subCommand}。请使用 list 或 reload。` };
        }
    }

    private async listSkills(context: CommandContext): Promise<CommandResult> {
        const skills = await SkillManager.discoverSkills();
        if (skills.length === 0) {
            return { status: 'success', message: '📭 目前没有发现任何技能。请在 `.opengravity/skills/` 下创建技能文件夹及 `SKILL.md`。' };
        }

        let message = '## 🧬 当前已加载的技能列表：\n\n';
        for (const skill of skills) {
            const tierIcon = skill.tier === 'workspace' ? '🏠' : '🌍';
            message += `### ${tierIcon} ${skill.name}\n`;
            message += `- **来源**: ${skill.tier}\n`;
            message += `- **描述**: ${skill.description}\n`;
            message += `- **路径**: \`${skill.path}\`\n\n`;
        }

        return { status: 'success', message };
    }

    private async reloadSkills(context: CommandContext): Promise<CommandResult> {
        // 强制清除系统提示词缓存并重新加载 (通过触发 ChatViewProvider 的刷新)
        if (context.chatViewProvider) {
            await context.chatViewProvider.refreshSystemPrompt();
            return { status: 'success', message: '✅ **技能库已重新扫描**：系统提示词已同步更新。' };
        }
        return { status: 'error', message: '无法刷新：未找到 provider 实例。' };
    }
}

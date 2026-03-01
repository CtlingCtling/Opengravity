import { ICommand, CommandContext, CommandResult } from '../ICommand';
import * as vscode from 'vscode';
import { TemplateManager } from '../../utils/templateManager';

/**
 * InitCommand: 初始化 Opengravity 业务工作流 (Kernel)
 */
export class InitCommand implements ICommand {
    name = 'init';
    description = '初始化项目业务工作流目录 (Kernel)';

    private readonly CORE_FOLDERS = ['codes', 'brainstorm', 'daily', 'notes', 'reviews', 'todo'];

    async execute(args: string[], context: CommandContext): Promise<CommandResult> {
        const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!rootPath) return { status: 'error', message: '❌ 未打开工作区。' };

        const confirm = await vscode.window.showWarningMessage(
            '[🚀] 确认初始化 Opengravity 业务工作流目录?',
            { modal: true }, '立即初始化'
        );

        if (confirm !== '立即初始化') return { status: 'intercepted', message: '用户已取消。' };

        try {
            for (const folder of this.CORE_FOLDERS) {
                await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(rootPath, folder));
            }

            // [核心增强] 同步并初始化 .opengravity 配置文件
            await TemplateManager.ensureConfigDir(context.extensionUri);

            const successMsg = await TemplateManager.loadTemplate(context.extensionUri, 'commands_prompt/init_success.md');
            await context.webview.postMessage({ type: 'aiResponse', value: successMsg });

            return { status: 'success' };
        } catch (error: any) {
            return { status: 'error', message: `❌ 初始化失败: ${error.message}` };
        }
    }
}

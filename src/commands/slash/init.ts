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
        if (!rootPath) { return { status: 'error', message: '❌ 未打开工作区。' }; }

        const confirm = await vscode.window.showWarningMessage(
            '[🚀] 确认初始化 Opengravity 业务工作流并同步核心资产?',
            { modal: true }, '立即初始化'
        );

        if (confirm !== '立即初始化') { return { status: 'intercepted', message: '用户已取消。' }; }

        try {
            // 1. 创建业务目录
            for (const folder of this.CORE_FOLDERS) {
                await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(rootPath, folder));
            }

            // 2. [Init 2.0] 执行物理资产初始化 (同步 .opengravity 及 commands)
            await TemplateManager.initializeWorkflow(context.extensionUri);

            // 3. 重新加载指令集 (因为新同步了 .toml 指令)
            if (context.chatViewProvider?.reloadCommands) {
                await context.chatViewProvider.reloadCommands();
            }

            const successMsg = await TemplateManager.loadTemplate(context.extensionUri, 'commands_prompt/init_success.md');
            await context.webview.postMessage({ type: 'aiResponse', value: successMsg });

            // 通知 Webview 更新状态
            await context.webview.postMessage({ type: 'updateStatus', value: 'initialized' });

            return { status: 'success' };
        } catch (error: any) {
            return { status: 'error', message: `❌ 初始化失败: ${error.message}` };
        }
    }
}

import * as vscode from 'vscode';
import { ICommand, CommandContext, CommandResult } from '../ICommand';
import { ProjectAnalyzer, ProjectMode } from '../../utils/projectAnalyzer';
import { TemplateManager } from '../../utils/templateManager';

/**
 * ScanCommand: 项目自动感知指令 (Kernel)
 * 仅负责调度分析器并根据模板更新地图文件
 */
export class ScanCommand implements ICommand {
    name = 'scan';
    description = '启动项目自动感知扫描 (Kernel)';

    async execute(args: string[], context: CommandContext): Promise<CommandResult> {
        const rootUri = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!rootUri) {
            return { status: 'error', message: '❌ 未打开工作区。' };
        }

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Opengravity: Scanning architecture...",
                cancellable: false
            }, async (progress) => {
                // 1. 复杂度判定
                const mode = await ProjectAnalyzer.assessMode(rootUri);
                const markers = await ProjectAnalyzer.getFoundMarkers(rootUri);
                progress.report({ message: `Mode: ${mode}` });

                // 2. 生成架构蓝图与知识图谱 (仅在工程模式下)
                let blueprint = "";
                let knowledgeGraph = "";
                if (mode === ProjectMode.Engineering) {
                    progress.report({ message: "Generating Blueprint..." });
                    blueprint = await ProjectAnalyzer.generateBlueprint(rootUri);
                    progress.report({ message: "Extracting Symbols..." });
                    knowledgeGraph = await ProjectAnalyzer.generateKnowledgeGraph(rootUri);
                }

                // 3. 使用模板引擎更新地图文件 (实现逻辑与数据分离)
                await this.updateProjectMap(context.extensionUri, rootUri, mode, markers, blueprint, knowledgeGraph);

                // 4. 注入通知 (从配置加载通知模板)
                const notification = this.getNotification(mode);
                await context.onInjectMessage(notification);
            });

            return { status: 'success' };
        } catch (e: any) {
            return { status: 'error', message: `扫描失败: ${e.message}` };
        }
    }

    private getNotification(mode: ProjectMode): string {
        const isEng = mode === ProjectMode.Engineering;
        return [
            `[SYSTEM NOTIFICATION] Project Scan Complete.`,
            `Mode: ${mode}.`,
            `Map Updated: .opengravity/PROJECT_MAP.md.`,
            isEng ? `Blueprint Visualization Generated.` : `Script Context Loaded.`
        ].join('\n');
    }

    private async updateProjectMap(extensionUri: vscode.Uri, rootUri: vscode.Uri, mode: ProjectMode, markers: string[], blueprint: string, knowledgeGraph: string) {
        const mapUri = vscode.Uri.joinPath(rootUri, '.opengravity', 'PROJECT_MAP.md');
        
        // 1. 从 assets/templates 加载模板
        const rawTemplate = await TemplateManager.loadInternalTemplate(extensionUri, 'project_map.md');
        
        // 2. 渲染数据 (修复：增加 await)
        const content = await TemplateManager.render(rawTemplate, {
            mode: mode,
            markers: markers.join(', ') || 'None',
            isEngineering: mode === ProjectMode.Engineering,
            blueprint: blueprint,
            knowledge_graph: knowledgeGraph
        });

        // 3. 写入文件
        await vscode.workspace.fs.writeFile(mapUri, new TextEncoder().encode(content));
    }
}

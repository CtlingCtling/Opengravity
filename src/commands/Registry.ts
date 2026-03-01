import * as vscode from 'vscode';
import * as toml from 'toml';
import { ICommand } from './ICommand';
import { ClearCommand } from './slash/clear';
import { CommandsCommand } from './slash/commands';
import { ToolsCommand } from './slash/tools';
import { ChatCommand } from './slash/chat';
import { McpCommand } from './slash/mcp'; 
import { InitCommand } from './slash/init';
import { CompressCommand } from './slash/compress';
import { MemoryCommand } from './slash/memory';
import { ScanCommand } from './slash/scan';
import { AutoCommand } from './slash/auto';
import { ShutUpCommand } from './slash/shutup';
import { ManualCommand } from './slash/manual';
import { HelpCommand } from './slash/help';
import { DynamicTOMLCommand } from './slash/dynamic';
import { Logger } from '../utils/logger';

export class CommandRegistry {
    private commands: Map<string, ICommand> = new Map();
    // 核心硬编码指令（涉及底层 API 的内核）
    private kernelNames: Set<string> = new Set();

    constructor(private extensionUri: vscode.Uri) {
        this.registerKernelCommands();
    }

    /**
     * 注册必须硬编码的内核指令（操作 VSCode 底层）
     */
    private registerKernelCommands() {
        const kernels = [
            new ClearCommand(),
            new CommandsCommand(),
            new ToolsCommand(),
            new ChatCommand(),
            new McpCommand(),
            new InitCommand(),
            new CompressCommand(),
            new MemoryCommand(),
            new ScanCommand(),
            new AutoCommand(),
            new ShutUpCommand(),
            new ManualCommand(),
            new HelpCommand()
        ];

        kernels.forEach(cmd => {
            this.register(cmd);
            this.kernelNames.add(cmd.name);
        });
    }

    /**
     * 核心加载逻辑：全量扫描配置指令
     * [修复] 优先工作区，Fallback 到内置，杜绝重复加载。
     */
    async loadAllCommands() {
        const assetUri = vscode.Uri.joinPath(this.extensionUri, 'assets', 'commands');
        const root = vscode.workspace.workspaceFolders?.[0]?.uri;
        const workspaceUri = root ? vscode.Uri.joinPath(root, '.opengravity', 'commands') : undefined;

        const commandMap = new Map<string, vscode.Uri>();

        // 1. 先收集内置指令
        try {
            const assetEntries = await vscode.workspace.fs.readDirectory(assetUri);
            for (const [name, type] of assetEntries) {
                if (type === vscode.FileType.File && name.endsWith('.toml')) {
                    commandMap.set(name, vscode.Uri.joinPath(assetUri, name));
                }
            }
        } catch (e) {}

        // 2. 收集并覆盖工作区指令 (如果有)
        if (workspaceUri) {
            try {
                const workspaceEntries = await vscode.workspace.fs.readDirectory(workspaceUri);
                for (const [name, type] of workspaceEntries) {
                    if (type === vscode.FileType.File && name.endsWith('.toml')) {
                        commandMap.set(name, vscode.Uri.joinPath(workspaceUri, name));
                    }
                }
            } catch (e) {}
        }

        // 3. 统一加载
        for (const [filename, uri] of commandMap) {
            await this.loadSingleTOML(uri);
        }
    }

    private async loadSingleTOML(uri: vscode.Uri) {
        try {
            const rawContent = await vscode.workspace.fs.readFile(uri);
            const content = new TextDecoder().decode(rawContent);
            const data = toml.parse(content);
            const config = data.command || data;
            const commandName = config.name.toLowerCase();

            // 内核指令不允许被覆盖
            if (this.kernelNames.has(commandName)) {
                Logger.warn(`[OPGV] Command /${commandName} is a kernel command and cannot be overridden.`);
                return;
            }

            const dynamicCmd = new DynamicTOMLCommand(
                commandName,
                config.description || 'Config Command',
                config.prompt
            );
            this.register(dynamicCmd);
            Logger.info(`[OPGV] Loaded ${commandName} from ${uri.fsPath}`);
        } catch (error) {
            Logger.error(`[OPGV] TOML Error at ${uri.fsPath}:`, error);
        }
    }

    register(command: ICommand) {
        this.commands.set(command.name, command);
    }

    getCommand(name: string): ICommand | undefined {
        return this.commands.get(name);
    }

    getAllCommands(): ICommand[] {
        return Array.from(this.commands.values());
    }

    async reload() {
        // 重置非内核指令
        const allNames = Array.from(this.commands.keys());
        allNames.forEach(name => {
            if (!this.kernelNames.has(name)) this.commands.delete(name);
        });
        await this.loadAllCommands();
    }
}

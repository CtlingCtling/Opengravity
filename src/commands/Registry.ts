import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
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
            new ScanCommand()
        ];

        kernels.forEach(cmd => {
            this.register(cmd);
            this.kernelNames.add(cmd.name);
        });
    }

    /**
     * 核心加载逻辑：全量扫描配置指令
     */
    async loadAllCommands() {
        // 1. 加载插件内置的默认指令 (e.g. /help, /about)
        const assetDir = path.join(this.extensionUri.fsPath, 'assets', 'commands');
        await this.scanDir(assetDir, true);

        // 2. 加载工作区的自定义指令 (可覆盖内置)
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (root) {
            const workspaceDir = path.join(root, '.opengravity', 'commands');
            await this.scanDir(workspaceDir, false);
        }
    }

    private async scanDir(dir: string, isInternal: boolean) {
        try {
            if (!fs.existsSync(dir)) {
                if (!isInternal) await fs.promises.mkdir(dir, { recursive: true });
                return;
            }
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name.endsWith('.toml')) {
                    await this.loadSingleTOML(path.join(dir, entry.name));
                }
            }
        } catch (error) {
            Logger.error(`[OPGV] Failed to scan dir ${dir}:`, error);
        }
    }

    private async loadSingleTOML(filePath: string) {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
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
            Logger.info(`[OPGV] Loaded ${commandName} from ${path.basename(filePath)}`);
        } catch (error) {
            Logger.error(`[OPGV] TOML Error at ${filePath}:`, error);
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

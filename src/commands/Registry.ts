import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as toml from 'toml';
import { ICommand } from './ICommand';
import { AboutCommand } from './slash/about';
import { HelpCommand } from './slash/help';
import { ClearCommand } from './slash/clear';
import { CommandsCommand } from './slash/commands';
import { ToolsCommand } from './slash/tools';
import { DynamicTOMLCommand } from './slash/dynamic';
import { Logger } from '../utils/logger';

export class CommandRegistry {
    private commands: Map<string, ICommand> = new Map();
    // 专门记录内置指令的名称，用于热重载时进行过滤保护
    private builtInNames: Set<string> = new Set();

    constructor() {
        this.registerBuiltInCommands();
    }

    /**
     * 注册硬编码在插件中的系统指令
     */
    private registerBuiltInCommands() {
        const builtIns = [
            new AboutCommand(),
            new HelpCommand(),
            new ClearCommand(),
            new CommandsCommand(),
            new ToolsCommand()
        ];

        builtIns.forEach(cmd => {
            this.register(cmd);
            this.builtInNames.add(cmd.name);
        });
    }

    /**
     * 加载工作区配置目录下的所有 .toml 指令
     */
    async loadCustomCommands() {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) return;

        const commandsDir = path.join(root, '.opengravity', 'commands');
        
        try {
            // 异步检测目录是否存在
            try {
                await fs.promises.access(commandsDir);
            } catch (e) {
                // 如果不存在则创建
                await fs.promises.mkdir(commandsDir, { recursive: true });
            }

            const files = await fs.promises.readdir(commandsDir);
            for (const file of files) {
                if (file.endsWith('.toml')) {
                    await this.loadSingleTOML(path.join(commandsDir, file));
                }
            }
        } catch (error) {
            Logger.error('[OPGV] Failed to scan custom commands directory:', error);
        }
    }

    private async loadSingleTOML(filePath: string) {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const data = toml.parse(content);
            
            // 寻找 [command] 表
            const config = data.command;
            if (config && config.name && config.prompt) {
                // 如果自定义指令名与内置冲突，优先保护内置指令
                if (this.builtInNames.has(config.name)) {
                    Logger.warn(`[OPGV] Custom command /${config.name} ignored: Conflicts with built-in command.`);
                    return;
                }

                const dynamicCmd = new DynamicTOMLCommand(
                    config.name,
                    config.description || '自定义技能',
                    config.prompt
                );
                this.register(dynamicCmd);
            }
        } catch (error) {
            Logger.error(`[OPGV] TOML Syntax Error at ${filePath}:`, error);
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

    /**
     * 核心重载逻辑：保留内核，刷新外挂技能
     */
    async reload() {
        // 1. 过滤掉所有动态注册的指令
        for (const name of Array.from(this.commands.keys())) {
            if (!this.builtInNames.has(name)) {
                this.commands.delete(name);
            }
        }
        
        // 2. 重新扫描并加载
        await this.loadCustomCommands();
        
        Logger.info(`[OPGV] Registry reloaded. Total commands: ${this.commands.size}`);
    }
}

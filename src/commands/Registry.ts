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
import { ChatCommand } from './slash/chat';
import { McpCommand } from './slash/mcp'; 
import { InitCommand } from './slash/init';
import { CompressCommand } from './slash/compress';
import { MemoryCommand } from './slash/memory'; // 引入 MemoryCommand
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
            new ToolsCommand(),
            new ChatCommand(),
            new McpCommand(),
            new InitCommand(),
            new CompressCommand(),
            new MemoryCommand() // 注册 MemoryCommand
        ];

        builtIns.forEach(cmd => {
            this.register(cmd);
            this.builtInNames.add(cmd.name);
        });
    }

    /**
     * 加载工作区配置目录下的所有 .toml 指令（支持递归与命名空间）
     */
    async loadCustomCommands() {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) return;

        const commandsDir = path.join(root, '.opengravity', 'commands');
        
        try {
            try {
                await fs.promises.access(commandsDir);
            } catch (e) {
                await fs.promises.mkdir(commandsDir, { recursive: true });
            }

            await this.scanCommandsDir(commandsDir, commandsDir);
        } catch (error) {
            Logger.error('[OPGV] Failed to scan custom commands directory:', error);
        }
    }

    /**
     * 递归扫描目录并注册指令
     * @param currentDir 当前扫描路径
     * @param baseDir 指令根路径（用于计算相对路径作为命名空间）
     */
    private async scanCommandsDir(currentDir: string, baseDir: string) {
        const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            
            if (entry.isDirectory()) {
                await this.scanCommandsDir(fullPath, baseDir);
            } else if (entry.name.endsWith('.toml')) {
                // 计算相对路径并生成命名空间名字 (e.g. git/review.toml -> git:review)
                const relPath = path.relative(baseDir, fullPath);
                const defaultName = relPath
                    .replace(/\.toml$/, '')
                    .replace(/[\\\/]/g, ':');

                await this.loadSingleTOML(fullPath, defaultName);
            }
        }
    }

    private async loadSingleTOML(filePath: string, defaultName: string) {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const data = toml.parse(content);
            
            // 兼容性逻辑：优先寻找 [command] 表，否则使用根层级字段
            const config = data.command || data;
            
            // 指令名优先级：TOML 内部定义 > 路径自动生成的 defaultName
            const commandName = (config.name || defaultName).toLowerCase();
            const prompt = config.prompt;

            if (prompt) {
                if (this.builtInNames.has(commandName)) {
                    Logger.warn(`[OPGV] Custom command /${commandName} ignored: Conflicts with built-in command.`);
                    return;
                }

                const dynamicCmd = new DynamicTOMLCommand(
                    commandName,
                    config.description || '自定义技能',
                    prompt
                );
                this.register(dynamicCmd);
                Logger.info(`[OPGV] Registered custom command: /${commandName}`);
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

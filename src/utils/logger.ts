import * as vscode from 'vscode';

export class Logger {
    private static outputChannel: vscode.OutputChannel | undefined;

    /**
     * Initializes the logger with an output channel. Must be called once during extension activation.
     * @param context The extension context to manage the output channel's lifecycle.
     */
    static initialize(context: vscode.ExtensionContext) {
        if (!Logger.outputChannel) {
            Logger.outputChannel = vscode.window.createOutputChannel('Opengravity');
            context.subscriptions.push(Logger.outputChannel); // Ensure output channel is disposed with the extension
        }
    }

    /**
     * Logs an informational message.
     */
    static info(message: string, ...args: any[]) {
        if (Logger.outputChannel) {
            Logger.outputChannel.appendLine(`[INFO] ${message}`);
            if (args.length > 0) {
                Logger.outputChannel.appendLine(JSON.stringify(args, null, 2));
            }
        } else {
            console.info(`[INFO] ${message}`, ...args);
        }
    }

    /**
     * Logs a warning message.
     */
    static warn(message: string, ...args: any[]) {
        if (Logger.outputChannel) {
            Logger.outputChannel.appendLine(`[WARN] ${message}`);
            if (args.length > 0) {
                Logger.outputChannel.appendLine(JSON.stringify(args, null, 2));
            }
        } else {
            console.warn(`[WARN] ${message}`, ...args);
        }
    }

    /**
     * Logs an error message.
     */
    static error(message: string, ...args: any[]) {
        if (Logger.outputChannel) {
            Logger.outputChannel.appendLine(`[ERROR] ${message}`);
            if (args.length > 0) {
                Logger.outputChannel.appendLine(JSON.stringify(args, null, 2));
            }
            Logger.outputChannel.show(true); // Bring output channel to front on error
        } else {
            console.error(`[ERROR] ${message}`, ...args);
        }
    }
}

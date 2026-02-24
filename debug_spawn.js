const cp = require('child_process');
const os = require('os');

console.log("=== 开始诊断 Spawn 问题 ===");
console.log(`OS: ${os.platform()} ${os.release()}`);

function runTest(name, spawnFn) {
    return new Promise((resolve) => {
        console.log(`
--- Test Case: ${name} ---`);
        const child = spawnFn();
        
        let stdoutData = "";
        let stderrData = "";

        child.stdout.on('data', d => { 
            console.log(`[${name}] STDOUT Chunk: "${d.toString().trim()}"`);
            stdoutData += d.toString(); 
        });
        child.stderr.on('data', d => { 
            console.log(`[${name}] STDERR Chunk: "${d.toString().trim()}"`);
            stderrData += d.toString(); 
        });

        child.on('close', (code) => {
            console.log(`[${name}] Closed with code: ${code}`);
            console.log(`[${name}] Total Output Length: ${stdoutData.length}`);
            console.log(`[${name}] Content: [${stdoutData}]`);
            resolve();
        });
    });
}

async function main() {
    const cmd = "echo hello";

    // Case A: 当前代码的写法 (Explicit Shell + shell: true)
    await runTest("Case A (Current Implementation)", () => {
        const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash';
        const shellArgs = process.platform === 'win32' ? ['/c', cmd] : ['-c', cmd];
        // 模拟 executor.ts 中的环境
        return cp.spawn(shell, shellArgs, { 
            shell: true,
            env: { ...process.env, OPENGRAVITY: "1" }
        });
    });

    // Case B: 简化写法 (Native Shell Handling)
    await runTest("Case B (Simplified)", () => {
        // 直接传入命令字符串，让 Node 处理 shell
        return cp.spawn(cmd, { 
            shell: true,
            env: { ...process.env, OPENGRAVITY: "1" }
        });
    });
}

main();

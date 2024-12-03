const {
    exec
} = require('child_process');
const path = require('path');

// 本地目录路径
const localDirectory = 'D:\\code\\ufactory-doc\\.vitepress\\dist';
// 远程服务器路径
const remotePath = 'ufadm@3.138.33.79:/home/uf';

// 构建 rsync 命令
const rsyncCommand = `rsync -avz ${localDirectory} ${remotePath}`;

// 执行 rsync 命令
exec(rsyncCommand, (error, stdout, stderr) => {
    if (error) {
        console.error(`exec error: ${error}`);
        return;
    }
    if (stderr) {
        console.error(`stderr: ${stderr}`);
        return;
    }
    console.log(`stdout: ${stdout}`);
});
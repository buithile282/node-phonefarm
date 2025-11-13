
const { exec, execSync, spawn, fork } = require('child_process');
const path = require('path');
const { runScrcpy } = require(path.join(__dirname,"scrcpyServer/srcpy"))

let scrcpyProcess = null;

function startScrcpy() {
    runScrcpy();
}
function stopScrcpy() {
    if (!scrcpyProcess) {
        console.log('ws-scrcpy is not running.');
        return;
    }

    // Dừng tiến trình ws-scrcpy
    scrcpyProcess.kill();

    scrcpyProcess.on('exit', (code) => {
        console.log(`ws-scrcpy stopped with exit code ${code}`);
        scrcpyProcess = null;
    });

    console.log('ws-scrcpy stopping.');
}
module.exports = {
    startScrcpy,
    stopScrcpy,
}  
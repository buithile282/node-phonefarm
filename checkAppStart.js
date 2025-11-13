const adb = require('adbkit');
const client = adb.createClient();
const net = require('net');


// Hàm kiểm tra xem cổng có đang được sử dụng hay không
function isPortInUse(port) {
    return new Promise((resolve, reject) => {
        const server = net.createServer();

        server.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(true);
            } else {
                reject(err);
            }
        });
        server.once('listening', () => {
            server.close();
            resolve(false);
        });
        server.listen(port);
    });
}

async function getDeviceInfo(deviceId) {
    try {
        // Chạy lệnh adb shell getprop để lấy tất cả thuộc tính
        const shellOutput = await client.shell(deviceId, 'getprop');
        const output = await adb.util.readAll(shellOutput);
        const props = output.toString().split('\n');

        // Hàm để lọc và lấy giá trị theo tên thuộc tính
        function getProperty(propName) {
            const line = props.find(line => line.includes(`[${propName}]`));
            return line ? line.split(']: [')[1].replace(']', '').trim() : null;
        }

        // Lấy một số thông tin cơ bản của thiết bị
        const deviceInfo = {
            serialNo: getProperty('ro.serialno'),
            sdkVersion: getProperty('ro.build.version.sdk'),
            releaseVersion: getProperty('ro.build.version.release'),
            brand: getProperty('ro.product.brand'),
            model: getProperty('ro.product.model'),
            cpuAbi: getProperty('ro.product.cpu.abi')
        };

        return deviceInfo;
    } catch (err) {
    }
}
// Hàm tạo số cổng ngẫu nhiên
function getRandomPort(min = 1024, max = 65535) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
async function checkAndInstallAtxAgent(deviceId, pathFile) {
    try {
        // Kiểm tra xem atx-agent có tồn tại trên thiết bị không
        const lsResult = await client.shell(deviceId, 'ls /data/local/tmp/atx-agent');
        const output = await adb.util.readAll(lsResult);
        const outputStr = output.toString().trim();
        if (outputStr === '/data/local/tmp/atx-agent') {
            // Chạy atx-agent
            await client.shell(deviceId, '/data/local/tmp/atx-agent server -d');
        } else {
            // Đẩy file atx-agent vào thiết bị
            await client.push(deviceId, pathFile, '/data/local/tmp/atx-agent');
            // Chmod để cấp quyền thực thi
            await client.shell(deviceId, 'chmod 755 /data/local/tmp/atx-agent');
            // Chạy atx-agent
            await client.shell(deviceId, '/data/local/tmp/atx-agent server -d');
        }
    } catch (err) {
        console.error('Lỗi:', err.message);
    }
}

async function checkAndInstallApks(deviceId, pathRoot) {
    try {
        const path = require('path');
        // Kiểm tra app-uiautomator.apk
        const uiautomatorAppInstalled = await client.isInstalled(deviceId, 'com.github.uiautomator');
        console.log(uiautomatorAppInstalled)
        if (!uiautomatorAppInstalled) {
            await client.install(deviceId, path.join(pathRoot, 'app', 'app-uiautomator.apk'));
        }
        const uiautomatorTestAppInstalled = await client.isInstalled(deviceId, 'com.github.uiautomator.test');
        console.log(uiautomatorTestAppInstalled)
        if (!uiautomatorTestAppInstalled) {
            await client.install(deviceId, path.join(pathRoot, 'app', 'app-uiautomator-test.apk'));
        };
        await client.shell(deviceId,'forward --remove-all');
        let port;
        let portInUse;
        do {
            port = getRandomPort(); // Tạo số cổng ngẫu nhiên
            portInUse = await isPortInUse(port); // Kiểm tra cổng đó
        } while (portInUse); // Lặp lại cho đến khi tìm được cổng chưa dùng
        // Forward cổng sang 9008
        await client.forward(deviceId, `tcp:${port}`, "tcp:9008");
        // Bật và đặt AdbKeyboard làm phương thức nhập liệu mặc định
        await client.shell(deviceId, 'ime enable com.github.uiautomator/.AdbKeyboard');
        await client.shell(deviceId, 'settings put secure default_input_method com.github.uiautomator/.AdbKeyboard');
        console.log(port)
        return port;
    } catch (err) {
        console.error('Lỗi:', err.message);
        return null;
    }
}
module.exports = {
    checkAndInstallAtxAgent,
    checkAndInstallApks,
    getDeviceInfo
}
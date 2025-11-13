const fs = require('fs');
const xpath = require('xpath');
const { DOMParser } = require('xmldom');
const Jimp = require('jimp');
const { createBuffer, getBufferData } = require('./createMessage');
const path = require('path');
const speakeasy = require('speakeasy');
const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const adbkit = require('adbkit');
const adb = adbkit; // alias for util functions
const client = adb.createClient();
const sharp = require('sharp');

function closeConnectionAfterTimeout(connection, timeout) {
    setTimeout(() => connection.end(), timeout * 1000);
}
async function imapReadMail(
    service,
    email,
    password,
    mailbox = 'INBOX',
    options = {
        unseen: true,
        markAsRead: false,
        latestMail: true,
        from: '',
        to: '',
        subject: '',
        body: '',
        minutesAgo: 0,
        flags: { g: false, i: false, m: false }
    },
    contentContains = '',
    timeout = 30,
    imapHost = 'imap.gmail.com',
    imapPort = 993,
    tlsSecure = true
) {

    let host, port, tls;
    switch (service.toLowerCase()) {
        case 'gmail':
            host = 'imap.gmail.com';
            port = 993;
            tls = true;
            break;
        case 'outlook':
        case 'hotmail':
            host = 'imap-mail.outlook.com';
            port = 993;
            tls = true;
            break;
        case 'yahoo':
            host = 'imap.mail.yahoo.com';
            port = 993;
            tls = true;
            break;
        case 'custom':
            host = imapHost;
            port = imapPort;
            tls = tlsSecure;
            break;
        default:
            throw new Error('Unsupported email service');
    }

    const config = {
        imap: {
            user: email,
            password: password,
            host: host,
            port: port,
            tls: tls,
            tlsOptions: {
                rejectUnauthorized: false  // Bỏ qua kiểm tra chứng chỉ tự ký
            },
            authTimeout: 3000,
        }
    };

    try {
        // Kết nối tới server IMAP
        const connection = await imaps.connect(config);
        await connection.openBox(mailbox);

        // Tùy chọn tìm email
        const searchCriteria = [];
        if (options.unseen) searchCriteria.push('UNSEEN');

        // Nếu latestMail = false, lọc theo điều kiện khác
        if (!options.latestMail) {

            if (options.minutesAgo) {
                const dateFrom = new Date(Date.now() - options.minutesAgo * 60 * 1000);
                searchCriteria.push(['SINCE', dateFrom]);
            }
            if (options.from) searchCriteria.push(['FROM', options.from]);
            if (options.to) searchCriteria.push(['TO', options.to]);
            if (options.subject) searchCriteria.push(['SUBJECT', options.subject]);
            if (options.body) {
                // `BODY` tìm kiếm trong nội dung email
                searchCriteria.push(['BODY', options.body]);
            }
        } else {
            searchCriteria.push(['SINCE', new Date()]);
        }

        const fetchOptions = {
            bodies: ['HEADER', 'TEXT', ''],
            markSeen: options.markAsRead
        };

        // Lấy email từ mailbox
        const messages = await connection.search(searchCriteria, fetchOptions);

        if (messages.length > 0) {
            // Sắp xếp email theo ngày gửi
            messages.sort((a, b) => b.attributes.date - a.attributes.date);

            let selectedMessages = options.latestMail ? [messages[0]] : messages; // Đảm bảo luôn là một mảng

            let result = [];

            for (let message of selectedMessages) {
                const all = message.parts.find(part => part.which === '');
                if (!all) throw new Error('Email body not found');

                const id = message.attributes.uid;
                const idHeader = `Imap-Id: ${id}\r\n`;

                const parsed = await simpleParser(idHeader + all.body);

                // Xử lý nội dung email: loại bỏ các ký tự xuống dòng và khoảng trắng không cần thiết
                const cleanContent = (parsed.text || '').replace(/\r?\n|\r/g, ' ').trim();

                const emailDetails = {
                    from: parsed.from ? parsed.from.text : '',
                    to: parsed.to ? parsed.to.text : '',
                    subject: parsed.subject,
                    content: cleanContent
                };

                // Nếu có `contentContains` và khớp, thêm trường `extractedData`
                if (contentContains && parsed.text) {
                    // Xây dựng chuỗi flag từ lựa chọn của người dùng
                    let flags = '';
                    if (options.flags.g) flags += 'g';
                    if (options.flags.i) flags += 'i';
                    if (options.flags.m) flags += 'm';

                    const regex = new RegExp(contentContains, flags); // Sử dụng các flag đã chọn

                    const match = parsed.text.match(regex);

                    if (match) {
                        // Nếu có nhiều kết quả, trả về mảng các kết quả khớp
                        emailDetails.extractedData = match.length > 1 ? match : [match[0]];
                    } else {
                        // Nếu không có kết quả khớp
                        emailDetails.extractedData = null;
                    }
                }

                result.push(emailDetails);
            }

            closeConnectionAfterTimeout(connection, timeout);

            console.log('Email log:', result);

            // Trả về email mới nhất hoặc danh sách email
            return options.latestMail ? result[0] : result;
        }

        closeConnectionAfterTimeout(connection, timeout);

        console.log('No emails found');
        return null;

    } catch (error) {
        console.error('Error reading emails:', error);
        return null;
    }
}

function actionFile(action, filePath, inputData = "", selectorType, writeMode, appendMode, delimiter = ',') {
    // Chuẩn hóa đường dẫn file
    const fullPath = path.resolve(filePath);

    if (action === 'Delete') {
        // Xóa file
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            console.log(`File deleted: ${fullPath}`);
        } else {
            console.log(`File not found: ${fullPath}`);
        }
    } else if (action === 'Write') {
        let dataToWrite = '';

        if (selectorType === 'txt') {
            dataToWrite = inputData;
        } else if (selectorType === 'csv') {
            // Đối với CSV, cần phải định dạng dữ liệu với delimiter
            if (Array.isArray(inputData)) {
                dataToWrite = inputData.map(row => row.join(delimiter)).join('\n');
            } else {
                throw new Error('Input data for CSV must be an array of arrays.');
            }
        } else if (selectorType === 'json') {
            dataToWrite = JSON.stringify(inputData, null, 2);
        } else {
            throw new Error('Unsupported selector type');
        }

        if (writeMode === 'overwrite') {
            fs.writeFileSync(fullPath, dataToWrite, 'utf8');
        } else if (writeMode === 'append') {
            let existingData = '';

            if (fs.existsSync(fullPath)) {
                existingData = fs.readFileSync(fullPath, 'utf8');
            }

            if (appendMode === 'newLine') {
                fs.appendFileSync(fullPath, (existingData ? '\n' : '') + dataToWrite, 'utf8');
            } else if (appendMode === 'sameLine') {
                if (selectorType === 'txt' || selectorType === 'csv') {
                    fs.appendFileSync(fullPath, (existingData ? delimiter : '') + dataToWrite, 'utf8');
                } else {
                    fs.appendFileSync(fullPath, (existingData ? '\n' : '') + dataToWrite, 'utf8');
                }
            } else {
                throw new Error('Unsupported append mode');
            }
        } else {
            throw new Error('Unsupported write mode');
        }

        console.log(`File written: ${fullPath}`);
    } else {
        throw new Error('Unsupported action');
    }
}

async function installApp(uuid, apkPath) {
    try {
        await client.install(uuid, apkPath);
        return { success: true, message: "success" }
    } catch (error) {
        return { success: false, message: error.message }
    }
}

async function screenShot(port, options = null) {
    if (!options) {
        let image = await takeScreenshot(port);
        return image
    }
    const screenshotName = options.fileName || 'screenshot.png';
    const outputFolder = options.folderOutput || '.';
    const localScreenshotPath = path.join(outputFolder, screenshotName);

    // Kiểm tra thư mục đích và tạo nếu cần
    if (!fs.existsSync(outputFolder)) {
        fs.mkdirSync(outputFolder, { recursive: true });
    }

    try {
        let image = await takeScreenshot(port);
        fs.writeFileSync(localScreenshotPath, image, { encoding: 'base64' })
        return { success: true, message: "success", data: image }

    } catch (error) {
        console.log(error)
        return { success: false, message: error.message }
    }
};

async function takeScreenshot(port) {
    const url = `http://127.0.0.1:${port}/jsonrpc/0`;
    const body = {
        "jsonrpc": "2.0",
        "id": "da9ad2c67b104c65855117569c5fdcd2",
        "method": "takeScreenshot",
        "params": [
            1,
            80
        ]
    }
    let result = await fetch(url,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        }

    );
    const data = await result.json();
    return data.result;
}

async function pressBack(port) {
    try {
        return pressKey(port, 4);
    } catch (error) {
        return { success: false, message: error.message }
    }
}
async function pressHome(port) {
    try {
        return pressKey(port, 3);
    } catch (error) {
        return { success: false, message: error.message }
    }
}
async function pressMenu(port) {
    try {
        return pressKey(port, 187);
    } catch (error) {
        return { success: false, message: error.message }
    }
}
async function cropImage(base64Image, x1, y1, x2, y2) {
    try {
        // Chuyển đổi base64 thành buffer
        const imageBuffer = Buffer.from(base64Image.replace(/^data:image\/\w+;base64,/, ""), 'base64');

        // Tính toán chiều rộng và chiều cao của vùng cắt
        const width = x2 - x1;
        const height = y2 - y1;

        // Cắt ảnh và trả về dạng base64
        const outputBuffer = await sharp(imageBuffer)
            .extract({ left: x1, top: y1, width: width, height: height })
            .toBuffer();

        // Chuyển buffer kết quả thành chuỗi base64
        return `data:image/jpeg;base64,${outputBuffer.toString('base64')}`;
    } catch (err) {
        console.error('Lỗi khi cắt ảnh:', err);
    }
}

async function lockPhone(port) {
    try {
        return pressKey(port, 26);
    } catch (error) {
        return { success: false, message: error.message }
    }
}
async function unlockPhone(uuid) {
    try {
        await client.shell(uuid, "input keyevent 82");
        return { success: true, message: "success" }
    } catch (error) {
        return { success: false, message: error.message }
    }
}
async function deviceActions(uuid,port, action) {
    switch (action) {
        case 'unlock':
            return await unlockPhone(uuid);
        default:
            return await lockPhone(port);
    }
}
async function getAttribute(port, selector, name, seconds) {
    let bodyReq = {
        "jsonrpc": "2.0",
        "id": "da9ad2c67b104c65855117569c5fdcd2",
        "method": "dumpWindowHierarchy",
        "params": [
            false,
            50
        ]
    }
    let url = `http://127.0.0.1:${port}/jsonrpc/0`;
    const waitTime = (seconds || 5) * 1000;
    const startTime = Date.now();
    while ((Date.now() - startTime) < waitTime) {
        let response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(bodyReq)
        });
        response = await response.json();
        let result = response.result;
        if (typeof result === 'string' && result.startsWith('<?xml')) {
            // Phân tích trực tiếp nội dung XML từ biến result
            const doc = new DOMParser().parseFromString(result, 'text/xml');
            const nodes = xpath.select(selector, doc);
            if (nodes.length > 0) {
                const node = nodes[0];
                const attributeValue = node.getAttribute(name);
                if (attributeValue !== null && attributeValue !== undefined) {
                    return { success: true, message: "success", data: attributeValue }
                } else {
                    return { success: false, message: 'Attribute not found' }
                }
            }
        }
        // chờ 200ms trước khi thử lại
        await new Promise(r => setTimeout(r, 200));
    }
    return { success: false, message: 'Element not found' };
}

async function elementExists(port, xpathQuery, seconds = 10) {
    let url = `http://127.0.0.1:${port}/jsonrpc/0`;
    let result = await getPosElment(url, xpathQuery, seconds, false);
    if (result.success) {
        return { success: true, message: "success", data: true }
    }
    else {
        return { success: false, message:"Element not found!", data: false }
    }
}

async function adbShell(uuid, command) {
    try {
        const stream = await client.shell(uuid, command);
        const output = await adb.util.readAll(stream);
        return { success: true, message: output.toString() };
    } catch (err) {
        return { success: false, message: err.message };
    }
}
async function generate2FA(uuid, secretKey) {
    const token = speakeasy.totp({
        secret: secretKey,
        encoding: 'base32'
    });

    console.log("Generated 2FA token: ", token);
    return token;
}

async function startApp(uuid, packageName) {
    try {
        await client.shell(uuid, `monkey -p ${packageName} 1`);
        return { success: true, message: "success" }
    } catch (error) {
        console.log(error)
        return { success: false, message: error.message }
    }
}
async function stopApp(uuid, packageName) {
    try {
        await client.shell(uuid, `am force-stop ${packageName}`);
        return { success: true, message: "success" }
    } catch (error) {
        return { success: false, message: error.message }
    }
}

async function unInStallApp(uuid, packageName) {
    try {
        await client.uninstall(uuid, packageName);
        return { success: true, message: "success" };
    } catch (error) {
        return { success: false, message: error.message };
    }
}
async function isInStallApp(uuid, packageName) {
    try {
        let isInstalled = await client.isInstalled(uuid, packageName);
        return { success: true, message: "success", data: isInstalled }
    } catch (error) {
        return { success: false, message: error.message }
    }
}
async function toggleAirplaneMode(uuid) {
    let res = await client.shell(uuid, 'shell settings get global airplane_mode_on');
    res = (await adb.util.readAll(res)).toString();

    if (res.includes('0') || res.includes('1')) {
        const isAirplaneModeOn = res.trim()[0] === '1';
        const command = isAirplaneModeOn
            ? 'shell settings put global airplane_mode_on 0'
            : 'shell settings put global airplane_mode_on 1';
        await client.shell(uuid, command);
    }
}
async function toggleWifi(uuid) {
    let res = await client.shell(uuid, 'shell settings get global wifi_on');
    res = (await adb.util.readAll(res)).toString();

    if (res.includes("0") || res.includes("1")) {
        const isWifiEnabled = res.trim()[0] === '1';
        const command = isWifiEnabled
            ? 'shell svc wifi disable'
            : 'shell svc wifi enable';
        await client.shell(uuid, command);
    }
}
async function toggleData(uuid) {
    let res = await client.shell(uuid, 'shell settings get global mobile_data');
    res = (await adb.util.readAll(res)).toString();

    if (res.includes('0') || res.includes('1')) {
        const isDataEnabled = res.trim()[0] === '1';
        const command = isDataEnabled
            ? 'shell svc data disable'
            : 'shell svc data enable';
        await client.shell(uuid, command);
    }
}
async function toggleLocation(uuid) {
    let res = await client.shell(uuid, 'settings get secure location_mode');
    res = (await adb.util.readAll(res)).toString();

    if (res.includes('0') || res.includes('1')) {
        const isLocationModeOn = res.trim()[0] === '1';
        const command = isLocationModeOn
            ? 'shell settings put secure location_mode 0'
            : 'shell settings put secure location_mode 1';
        await client.shell(uuid, command);
    }
}

async function toggleService(uuid, service) {
    switch (service) {
        case 'airplane':
            await toggleAirplaneMode(uuid);
            break;
        case 'wifi':
            await toggleWifi(uuid);
            break;
        case 'network':
            await toggleData(uuid);
            break;
        case 'location':
            await toggleLocation(uuid);
            break;
        default:
            break;
    }
}

async function transferFile(deviceId, action, localFilePath, remoteFilePath) {
    try {
        if (action === 'push') {
            await pushFile(deviceId, localFilePath, remoteFilePath);
        } else if (action === 'pull') {
            await pullFile(deviceId, localFilePath, remoteFilePath);
        }
        return { success: true, message: "success" };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

async function pullFile(deviceId, localFilePath, remoteFilePath) {
    return new Promise(function (resolve, reject) {
        client.pull(deviceId, remoteFilePath)
            .then(function (transfer) {
                transfer.on('end', function () {
                    resolve(true);
                })
                transfer.on('error', reject);
                transfer.pipe(fs.createWriteStream(localFilePath))
            })
            .catch(reject);
    })
}
async function pushFile(deviceId, localFilePath, remoteFilePath) {
    return new Promise(function (resolve, reject) {
        client.push(deviceId, localFilePath, remoteFilePath)
            .then(function (transfer) {
                transfer.on('end', function () {
                    resolve(true);
                })
                transfer.on('error', reject);
            })
            .catch(reject);
    })
}

async function touch(port, selectBy = 'selector', options, touchType = 'Normal', delay = 10) {
    let x, y;
    delay = delay * 1000
    if (selectBy === 'selector') {
        let url = `http://127.0.0.1:${port}/jsonrpc/0`;
        const response = await getPosElment(url, options.xpathQuery, options.timeOut, false);
        if (!response.success) return response;
        x = response.data.x;
        y = response.data.y;
    }
    else {
        x = options.xCoordinate * 1;
        y = options.yCoordinate * 1;
    }
    switch (touchType) {
        case 'Long': {
            const body = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "click",
                "params": [
                    x,
                    y,
                    delay
                ]
            }
            return postData(port, body)
        }
        case 'Double': {
            const body = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "click",
                "params": [
                    x,
                    y
                ]
            }
            await postData(port, body);
            await new Promise(r => setTimeout(r, 100));
            return postData(port, body)
        }
        default: {
            const body = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "click",
                "params": [
                    x,
                    y,
                ]
            };
            return postData(port, body)
        }
    }
}

async function swipeSimple(port, direction) {
    let startX, startY, endX, endY;
    switch (direction) {
        case 'up':
            startX = 500; startY = 1000; endX = 500; endY = 200; break;
        case 'down':
            startX = 500; startY = 300; endX = 500; endY = 800; break;
        case 'left':
            startX = 600; startY = 500; endX = 300; endY = 500; break;
        case 'right':
            startX = 200; startY = 500; endX = 1000; endY = 500; break;
        default:
            return { success: false, message: 'Invalid direction' };
    }
    let body = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "swipe",
        "params": [
            startX,
            startY,
            endX,
            endY,
            50
        ]
    }
    return postData(port, body);
}
async function swipeCustom(port, startX, startY, endX, endY, duration) {
    duration = duration * 1000;
    let body = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "swipe",
        "params": [
            startX,
            startY,
            endX,
            endY,
            duration
        ]
    }
    return postData(port, body);
}

async function swipeScroll(port, mode, options) {
    if (mode === 'custom') {
        let { startX, startY, endX, endY, duration } = options;
        return await swipeCustom(port, startX, startY, endX, endY, duration);
    } else {
        let { direction } = options;
        return await swipeSimple(port, direction);
    }
}

async function pressKey(port, keyCode) {
    let body = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "pressKeyCode",
        "params": [keyCode]
    }
    return await postData(port, body);
}
async function postData(port, body) {
    try {
        let url = `http://127.0.0.1:${port}/jsonrpc/0`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        let result = await res.json();
        if (result && result.result) {
            return { success: true, message: "success" }
        } else {
            return { success: false, message: result && result.error ? JSON.stringify(result.error) : "" }
        }
    } catch (error) {
        return { success: false, message: error.message }
    }
}

async function typeText(port, deviceId, selector, seconds, text) {
    let url = `http://127.0.0.1:${port}/jsonrpc/0`;
    const result = await getPosElment(url, selector, seconds, true);
    if (!result.success) return result;
    const textBase64 = Buffer.from(text).toString('base64')
    await client.shell(deviceId, `am broadcast -a ADB_KEYBOARD_SET_TEXT --es text ${textBase64}`);
    return { success: true, message: "success" }
}
async function getPosElment(url, selector, timeOut = 0, focus = true) {
    let body = {
        "jsonrpc": "2.0",
        "id": "da9ad2c67b104c65855117569c5fdcd2",
        "method": "dumpWindowHierarchy",
        "params": [
            false,
            50
        ]
    }
    timeOut = timeOut * 1000;
    const startTime = Date.now();
    while ((Date.now() - startTime) < timeOut) {
        let response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        response = await response.json();
        let result = response.result;
        if (typeof result === 'string' && result.startsWith('<?xml')) {
            const doc = new DOMParser().parseFromString(result, 'text/xml');
            const nodes = xpath.select(selector, doc);
            if (nodes.length > 0) {
                const node = nodes[0];
                const boundsAttr = node.getAttribute('bounds');
                if (!boundsAttr) {
                    return { success: false, message: 'No bounds attribute' };
                }
                const boundsRegex = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/;
                const match = boundsAttr.match(boundsRegex);
                if (match) {
                    const [left, top, right, bottom] = match.slice(1).map(Number);
                    const x = Math.floor((left + right) / 2);
                    const y = Math.floor((top + bottom) / 2);
                    if (focus) {
                        body = {
                            "jsonrpc": "2.0",
                            "id": "a2254a2f42f44da3a8b6e81d83e9627b",
                            "method": "click",
                            "params": [x, y]
                        }
                        await fetch(url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(body)
                        });
                    }
                    return { success: true, message: "success", data: { x, y } }
                } else {
                    return { success: false, message: 'Invalid bounds attribute format' };
                }
            }
        }
        await new Promise(r => setTimeout(r, 200));
    }
    return { success: false, message: 'Element not found' };
}

module.exports = {
    startApp,
    stopApp,
    pressBack,
    pressHome,
    pressMenu,
    getAttribute,
    installApp,
    unInStallApp,
    isInStallApp,
    deviceActions,
    toggleService,
    transferFile,
    touch,
    swipeScroll,
    screenShot,
    pressKey,
    typeText,
    adbShell,
    generate2FA,
    elementExists,
    imapReadMail,
    actionFile
};
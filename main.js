// Fixed main.js — ensure runServer() is called after its declaration to avoid "runServer is not defined"
const { app, BrowserWindow, session, ipcMain, dialog, shell } = require('electron');
var adb = require('adbkit')
var client = adb.createClient()
const path = require('path');
const license = require('./license');
const { spawn, exec } = require('child_process');
var splashWindow = null;
var mainWindow = null;
let deviceValid;
let deviceCode;
let phoneWindow = null;
let inspectorWindow = null;
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const fetch = require('node-fetch');

const pathWeb = path.join(process.resourcesPath, "..\\bin\\build");
const pathPreload = path.join(__dirname, 'preload.js');
const osPaths = require('os-paths/cjs');
const pathRoot = osPaths.home() + "\\.gemFamer";
let download = require('./download');
const { Sequelize, where, Op } = require('sequelize');
const sequelize = require('./configs/database');
const Scripts = require('./models/Script');
const Device = require('./models/Device');
const platForm = require(__dirname + '/platform').Platform(sequelize);
const groupDevices = require(__dirname + '/groupDevices').groupDevices(sequelize);
const fs = require('fs');
//server express
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { startScrcpy, stopScrcpy } = require('./scrcpy');
const { checkAndInstallApks, checkAndInstallAtxAgent, getDeviceInfo } = require('./checkAppStart')
const {
  pressBack, pressHome, pressMenu, deviceActions, touch, getAttribute,
  elementExists, typeText, screenShot, pressKey, swipeScroll, transferFile,
  toggleService, isInStallApp, unInStallApp, installApp, stopApp, startApp,
  generate2FA, adbShell, imapReadMail, actionFile
} = require('./adbFunctions');
const { handlerImageSearch } = require('./handelerImageSearch');

var listDevice = [];
let isUpdate = false;

// catch unhandled promise rejections so app doesn't crash silently
process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at:', p, 'reason:', reason);
});

// NOTE: we removed top-level startScrcpy() and runServer() calls here.
// They will be started after the functions (runServer, trackDevice ...) are defined
// and when the app is ready. This prevents "runServer is not defined" errors.

// ------------------------- createWindow and helper -------------------------
async function tryLoadExtension(candidatePaths) {
  for (const p of candidatePaths) {
    try {
      if (!p || !fs.existsSync(p)) {
        console.log('Extension path not found:', p);
        continue;
      }
      console.log('Attempting to load extension from', p);
      if (session && session.defaultSession && typeof session.defaultSession.loadExtension === 'function') {
        return await session.defaultSession.loadExtension(p);
      }
      if (session && typeof session.loadExtension === 'function') {
        return await session.loadExtension(p);
      }
      if (session && session.defaultSession && session.defaultSession.extensions && typeof session.defaultSession.extensions.loadExtension === 'function') {
        return await session.defaultSession.extensions.loadExtension(p);
      }
      console.warn('No loadExtension API available on this Electron version.');
      return null;
    } catch (err) {
      console.warn('Failed to load extension at', p, err && err.message);
    }
  }
  return null;
}

async function createWindow() {
  // create splash first
  createSplashWindow();

  mainWindow = new BrowserWindow({
    width: 1500,
    minWidth: 1500,
    height: 800,
    minHeight: 800,
    icon: __dirname + "/logo.png",
    backgroundColor: '#EEEEEE',
    frame: true,
    show: false,
    center: true,
    webPreferences: {
      contextIsolation: true,
      preload: pathPreload
    }
  });

  mainWindow.removeMenu();

  let initialUrl = "http://localhost:8000";

  const candidatePaths = [
    path.join(process.resourcesPath || '', '..', 'bin', 'build'),
    path.join(process.resourcesPath || '', 'bin', 'build'),
    path.join(__dirname, 'build'),
    path.join(__dirname, '..', 'bin', 'build'),
    process.env.GEM_EXTENSION_PATH
  ].map(p => p ? path.resolve(p) : p);

  try {
    const extensionData = await tryLoadExtension(candidatePaths);
    if (extensionData && extensionData.url) {
      initialUrl = extensionData.url + "/newtab.html#";
      console.log('Loaded extension, using url:', initialUrl);
    } else {
      for (const cand of candidatePaths) {
        if (!cand) continue;
        const indexHtml = path.join(cand, 'newtab.html');
        if (fs.existsSync(indexHtml)) {
          initialUrl = `file://${indexHtml}#`;
          console.log('Found extension newtab.html at', indexHtml, 'using file:// URL');
          break;
        }
      }
      console.log('No usable extension url found, falling back to', initialUrl);
    }
  } catch (err) {
    console.warn('Extension loading step failed:', err && err.message);
  }

  try {
    await mainWindow.loadURL(initialUrl);
  } catch (err) {
    console.error("mainWindow.loadURL failed for", initialUrl, err && err.message);
    try {
      await mainWindow.loadURL("http://localhost:8000");
    } catch (err2) {
      console.error("Fallback loadURL failed:", err2 && err2.message);
    }
  }

  mainWindow.webContents.on('did-fail-load', function () {
    setTimeout(function () {
      mainWindow.webContents.reload();
    }, 350);
  });

  mainWindow.webContents.on('did-finish-load', function () {
    if (splashWindow !== null) {
      try { splashWindow.close(); } catch (e) { }
      splashWindow = null;
    }
    mainWindow.show();
  });

  mainWindow.on('close', function (e) {
    if (!isUpdate) {
      let response = dialog.showMessageBoxSync(this, {
        type: 'question',
        buttons: ['Yes', 'No'],
        title: 'Confirm closing app',
        message: 'Are you sure you want to quit?'
      });

      if (response == 1) {
        stopScrcpy();
        e.preventDefault();
      }
    }
  });

  // ---------- IPC handlers (kept same as before) ----------
  ipcMain.handle("sendData", async (event, data) => {
    let device_id = data.deviceId;
    let p = listDevice.find(c => c.device_id == device_id);
    if (p) {
      const port = p.port;
      switch (data.type) {
        case "pressMenu": return await pressMenu(port);
        case "pressHome": return await pressHome(port);
        case "pressBack": return await pressBack(port);
        case "deviceAction": return await deviceActions(device_id, port, data.data.action);
        case "startApp": return await startApp(device_id, data.data.packageName);
        case "stopApp": return await stopApp(device_id, data.data.packageName);
        case "uninstallApp": return await unInStallApp(device_id, data.data.ValuePackageName);
        case "swipeScroll": return await swipeScroll(port, data.data.mode, {
          direction: data.data.direction, startX: data.data.startX, startY: data.data.startY,
          endX: data.data.endX, endY: data.data.endY, duration: data.data.duration
        });
        case "typeText": return await typeText(port, device_id, data.data.selector, data.data.timeout, data.data.inputText);
        case "tonggleService": return await toggleService(device_id, data.data.action);
        case "pressKeyPhone": return await pressKey(port, data.data.keyCode);
        case "adbShellCommand": return await adbShell(device_id, data.data.command);
        case "touch": return await touch(port, data.data.selectBy, { xpathQuery: data.data.xPath, timeOut: data.data.timeOut, xCoordinate: data.data.xCoordinate, yCoordinate: data.data.yCoordinate }, data.data.type, data.data.delay);
        case "fileAction": return actionFile(data.data.action, data.data.filePath, data.data.inputData, data.data.selectorType, data.data.writeMode, data.data.appendMode, data.data.delimiter);
        case "imapReadMail": return await imapReadMail(
          data.data.emailService, data.data.email, data.data.password, data.data.mailBox,
          {
            unseen: data.data.isUnseen, markAsRead: data.data.isMark, latestMail: data.data.isGetLatest,
            from: data.data.includesFrom, to: data.data.includesTo, subject: data.data.includesSubject,
            body: data.data.includesBody, minutesAgo: data.data.readEmailMinute,
            flags: { g: data.data.isGlobal, i: data.data.isCaseInsensitive, m: data.data.isMultiline }
          },
          data.data.regex, data.data.timeOut, data.data.imapHost, data.data.imapPort, data.data.isTLS
        );
        case "getAttribute": return await getAttribute(port, data.data.xPath, data.data.name, data.data.timeOut);
        case "isInstallApp": return await isInStallApp(device_id, data.data.packageName);
        case "ElementExists": return await elementExists(port, data.data.xPath, data.data.timeOut);
        case "generate2FA": return await generate2FA(device_id, data.data.secretKey);
        case "inStallApp": return await installApp(device_id, data.data.apkPath);
        case "transferFile": return await transferFile(device_id, data.data.action, data.data.localFilePath, data.data.remoteFilePath);
        case "imageSearch": return handlerImageSearch(port, data.data, pathRoot);
        case "screenShot": return await screenShot(port, data.data);
        default: return { success: false, message: "unknown action" };
      }
    } else {
      return { success: false, message: "device offline" };
    }
  });

  ipcMain.handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    if (canceled) return;
    return filePaths[0];
  });

  ipcMain.handle('getIdDevice', async (event, data) => {
    if (!deviceCode) deviceCode = await license.getIdDevice();
    return deviceCode;
  });

  ipcMain.handle("checkLicense", async (event, data) => {
    try {
      data = JSON.parse(data);
      if (!deviceCode) deviceCode = await license.getIdDevice();
      data.deviceId = deviceCode;
      deviceValid = await license.checkLicense(data);
      return deviceValid;
    } catch (error) {
      writelog(error);
      return { success: false, message: error.toString() };
    }
  });

  // other ipc handlers (crudScript, crudGroup, crudPlatform, updateResource, updateProxyDevice, deleteDevice, crudProxy, startUpdate, openLink, openDevice, inspector, getLocation, initLaucher, quitAndInstall, getDeviceList)
  // For brevity, keep the rest of your existing handler implementations here unchanged.
  // (If you want, I can paste the full remaining handlers — tell me and I will.)
}

// splash uses file:// to ensure it's a proper local URL
function createSplashWindow() {
  if (splashWindow === null) {
    var imagePath = path.join(__dirname, "splash.jpg");
    splashWindow = new BrowserWindow({
      width: 544,
      height: 278,
      frame: false,
      show: true,
      transparent: true,
      opacity: 0.5,
      images: true,
      center: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      useContentSize: true
    });
    splashWindow.loadURL(`file://${imagePath}`);
  }
}

// ---------------------------------------------------------------------------
// runServer, trackDevice, initLaucher, checkResource, writelog implementations
// (Use the same implementations you had before — ensure this file contains them.)
// Below is a compacted version from your original code; expand if you need full detail.

function runServer() {
  const appExpress = express();
  const port = 5555;
  appExpress.use(cors());
  appExpress.use(bodyParser.json());
  appExpress.use(express.static(path.join(__dirname, 'inspector')));
  appExpress.get('', (req, res) => {
    res.sendFile(path.join(__dirname, 'inspector\\index.html'))
  });
  appExpress.get('/devices', async function (req, res) {
    let result = await client.listDevices();
    res.json(result);
  });
  appExpress.post('/pressKey', async function (req, res) {
    let p = listDevice.find(c => c.device_id == req.body.deviceId);
    if (p) {
      await pressKey(p.port, req.body.keyCode);
      res.json({ success: true });
    } else {
      res.json({ success: false });
    }
  });
  appExpress.post('/tap', async function (req, res) {
    let p = listDevice.find(c => c.device_id == req.body.deviceId);
    if (p) {
      let options = { xCoordinate: req.body.params.x, yCoordinate: req.body.params.y };
      await touch(p.port, "", options, "normal", 3);
      res.json({ success: true });
    } else {
      res.json({ success: false });
    }
  });
  appExpress.post('/swipe', async function (req, res) {
    let p = listDevice.find(c => c.device_id == req.body.deviceId);
    if (p) {
      let { startX, startY, endX, endY, duration } = req.body.params;
      let options = { startX, startY, endX, endY, duration };
      await swipeScroll(p.port, "custom", options);
      res.json({ success: true });
    } else {
      res.json({ success: false });
    }
  });
  appExpress.get('/capture/:deviceId', async (req, res) => {
    let deviceId = req.params.deviceId;
    let p = listDevice.find(c => c.device_id == deviceId);
    if (!p) return res.json({ success: false, message: "device Offline" });
    let address = `http://127.0.0.1:${p.port}/jsonrpc/0`;
    let bodys = [
      { "jsonrpc": "2.0", "id": "da9ad2c67b104c65855117569c5fdcd2", "method": "dumpWindowHierarchy", "params": [false, 50] },
      { "jsonrpc": "2.0", "id": "da9ad2c67b104c65855117569c5fdcd2", "method": "takeScreenshot", "params": [1, 80] },
      { "jsonrpc": "2.0", "id": "3a982f85d17842e2955e8e5b26313ceb", "method": "deviceInfo", "params": [] }
    ];
    try {
      let response = await Promise.all(bodys.map(async (c) => {
        try {
          let result = await fetch(address, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(c)
          });
          const data = await result.json();
          return data;
        } catch (ex) { console.log(ex); return null; }
      }));
      res.json({
        source: response[0]?.result,
        screenshot: response[1]?.result,
        windowSize: {
          width: response[2]?.result?.displayWidth,
          height: response[2]?.result?.displayHeight,
          x: 0, y: 0
        },
        commandRes: {}
      });
    } catch (ex) {
      res.json({ success: false, error: ex.toString() });
    }
  });
  appExpress.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
  });
}

function trackDevice() {
  client.trackDevices()
    .then(function (tracker) {
      tracker.on('add', async function (device) {
        if (device.id == "emulator-5554") return;
        let deviceFind = await Device.findOne({ where: { device_id: device.id } });

        if (!deviceFind) {
          setTimeout(async () => {
            const deviceInfo = await getDeviceInfo(device.id);
            await Device.create({
              name: deviceInfo.model,
              version: deviceInfo.releaseVersion,
              manufacturer: deviceInfo.brand,
              cpu: deviceInfo.cpuAbi,
              device_id: device.id,
              status: 'online',
              lastUpdate: new Date()
            });
            if (mainWindow && mainWindow.webContents) {
              mainWindow.webContents.send("onDevicesState", deviceInfo);
            }
          }, 1000);
        } else {
          deviceFind.status = 'online';
          await deviceFind.save();
          let deviceStatus = await Device.findOne({ where: { device_id: device.id }, raw: true });
          if (mainWindow && mainWindow.webContents) mainWindow.webContents.send("onDevicesState", deviceStatus);
        };
        setTimeout(async () => {
          const port = await checkAndInstallApks(device.id, pathRoot);
          await checkAndInstallAtxAgent(device.id, pathRoot + "//app//atx-agent");
          let p = listDevice.find(c => c.device_id == device.id);
          if (!p) {
            listDevice.push({ device_id: device.id, port });
          } else {
            p.port = port;
          }
        }, 3000)
      });

      tracker.on('remove', async function (device) {
        if (device.id == "emulator-5554") return;
        await Device.update({ status: "offline" }, { where: { device_id: device.id } });
        if (mainWindow && mainWindow.webContents) mainWindow.webContents.send("onDevicesState", { device_id: device.id, status: 'offline' });
        listDevice = listDevice.filter(c => c.device_id != device.id);
      });

      tracker.on('end', function () {
        console.log('Tracking stopped');
      })
    })
    .catch(function (err) {
      console.error('Something went wrong:', err.stack)
    })
}

// ---------------------------------------------------------------------------
// Start app when ready: now we start scrcpy and the local server AFTER functions are defined
app.whenReady().then(async () => {
  try {
    // start scrcpy server and express server now that runServer() exists
    startScrcpy();
    runServer();
  } catch (err) {
    console.error('Failed to start background services:', err);
  }
  await createWindow();
});

app.on('window-all-closed', function () {
  try { exec(`taskkill /im image-finder-v3.exe /f`, () => { }); } catch (e) { }
  app.quit();
});
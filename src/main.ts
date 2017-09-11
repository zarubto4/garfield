import { Logger, LoggerManager, LoggerLevel, LoggerFileTarget } from 'logger';
import { Serial } from './communication/serial/SerialHandler';
import { ConfigManager } from './utils/ConfigManager';
import { app, ipcMain, BrowserWindow, Tray, Menu, MenuItem} from 'electron';
import * as drivelist from 'drivelist';
import * as fs from 'fs';
import { Device } from './device/Device';
import { Tester } from './device/Tester';
import { Configurator } from './device/Configurator';

const path = require('path');
const url = require('url');
const usb = require('usb');

const configValidator = {
    type: 'object',
    structure: {
        tyrionHost: {
            type: 'string'
        },
        tyrionSecured: {
            type: 'boolean'
        },
        tyrionReconnectTimeout: {
            type: 'number'
        },
        serial: {
            type: 'object',
            structure: {
                baudRate: {
                    type: 'number'
                },
                ctsrts: {
                    type: 'boolean'
                },
                crc: {
                    type: 'boolean'
                }
            }
        },
        loggers: {
            type: 'object',
            of: {
                type: 'object',
                structure: {
                    level: {
                        type: 'string'
                    },
                    colors: {
                        type: 'boolean'
                    },
                    target: {
                        type: 'string'
                    }
                }
            }
        },
    }
};


// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;
let tray;
let authToken: string;
let configPath = 'config/default.json';
let devices: Device[];

// init ConfigManager - if anything fail, exit program
let configManager: ConfigManager = null;
try {
    configManager = new ConfigManager(configPath, configValidator);
    ConfigManager.configLoggers(configManager.get('loggers'));
} catch (e) {
    Logger.error('ConfigManager init failed with', e.toString());
    process.exit();
}

Logger.info('Config:', configManager.config);

function createWindow () {

    Logger.warn('Creating window');

    // Create the browser window.
    mainWindow = new BrowserWindow({show: false});
    tray = new Tray(path.join(__dirname, '../byzance_logo.png'));
    tray.setToolTip('Garfield App');

    renderTrayContextMenu();

    mainWindow.on('ready-to-show', () => {
        mainWindow.maximize();
        mainWindow.show();
    });

    Logger.warn('New browser window');

    Logger.warn(__dirname);

    if (authToken) {

        mainWindow.loadURL(url.format({
            pathname: path.join(__dirname, '../views/index.html'),
            protocol: 'file:',
            slashes: true
        }));

    } else {

        mainWindow.loadURL(url.format({
            pathname: path.join(__dirname, '../views/login.html'),
            protocol: 'file:',
            slashes: true
        }));
    }


    // Open the DevTools.
    mainWindow.webContents.openDevTools();

    // Emitted when the window is closed.
    mainWindow.on('closed', function () {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        mainWindow = null;
    });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', function () {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        // app.quit();
    }
});

app.on('activate', function () {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
        createWindow();
    }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

ipcMain.on('login', (event, token) => {
    authToken = token;

    Logger.warn(authToken);

    mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, '../views/index.html'),
        protocol: 'file:',
        slashes: true
    }));
});

ipcMain.on('window', (event, window: string) => {

    switch (window) {
        case 'configuration': {
            mainWindow.loadURL(url.format({
                pathname: path.join(__dirname, '../views/configuration.html'),
                protocol: 'file:',
                slashes: true
            }));
            break;
        }

        case 'home': {
            mainWindow.loadURL(url.format({
                pathname: path.join(__dirname, '../views/index.html'),
                protocol: 'file:',
                slashes: true
            }));
            break;
        }

        default:
            // code...
            break;
    }
});

ipcMain.on('config', (event) => {
    event.returnValue = configManager.config();
});

ipcMain.on('configManager', (event) => {
    event.returnValue = configManager;
});

ipcMain.on('tyrionUrl', (event) => {
    event.returnValue = getTyrionUrl();
});

function getTyrionUrl(): string {

    Logger.info('getTyrionUrl: getting url');

    let host = configManager.get<string>('tyrionHost').trim();
    let secured = configManager.get<boolean>('tyrionSecured');
    let protocol = (secured ? 'https://' : 'http://');

    return protocol + host;
}

usb.on('attach', function(device) {
    Logger.warn('Device was connected. ' + JSON.stringify(device));
    renderTrayContextMenu();
});

usb.on('detach', function(device) {
    Logger.warn('Device was disconnected. ' + JSON.stringify(device));
});

function clickMenuItem(menuItem, browserWindow, event) {
    Logger.info('Click on button');
    Logger.info(menuItem);

    switch (menuItem.id) {
        case 'login': {
            // mainWindow = new BrowserWindow({useContentSize: true, icon: path.join(__dirname, '../byzance_logo.png')});
            mainWindow.loadURL(url.format({
                pathname: path.join(__dirname, '../views/login.html'),
                protocol: 'file:',
                slashes: true
            }));
            break;
        }
        case 'connect': {

            // addDevice();
            break;
        }
        case 'configure': {

            // addDevice();
            break;
        }
        case 'test': {

            // addDevice();
            break;
        }
        case 'quit': {
            app.quit();
            break;
        }

        default:
            // code...
            break;
    }
}

function addDevice(path: string) {

    Logger.info('Adding new device');

    let device: Device;

    drivelist.list((error, drives) => {

        if (error) {
            throw error;
        }

        Logger.info(JSON.stringify(drives));

        drives.forEach((drive) => {

            if (drive.system) {
                return; // System drives will be skipped
            }

            if (drive.displayName.match(/^BYZG3_\d{4}$/)) { // If name is patern 'BYZG3_dddd' where d is a number

                devices.forEach((dev, index) => {
                    if (dev.getPath() === drive.mountpoints[0].path) { // Check if device is already connected
                        Logger.info('This device ' + drive.displayName + ' is already connected - skipping');
                        return;
                    } else if (index === devices.length - 1) {

                        Logger.info('Device is new, connecting to ' + drive.displayName);

                        let serial: Serial = new Serial();

                        serial.on('connected' , () => {
                            device = new Device(drive.displayName, drive.mountpoints[0].path, serial);
                        });
                    }
                });
            }
        });
    });
}

function selectDrive(menuItem, browserWindow, event) {
    Logger.info('Device is new, connecting to ' + menuItem.id);

    let serial: Serial = new Serial();

    let device: Device;

    serial.on('connected' , () => {
        device = new Device(menuItem.id, menuItem.id, serial);
        devices.push(device);
    });
}

function renderTrayContextMenu() {
    drivelist.list((error, drives) => {

        if (error) {
            throw error;
        }

        Logger.info(JSON.stringify(drives));

        let submenu: any[] = []; 

        drives.forEach((drive) => {

            if (drive.system) {
                return; // System drives will be skipped
            }

            Logger.info('Rendering button for drive ' + drive.displayName);

            let item = {
                id: drive.mountpoints[0].path,
                label: drive.mountpoints[0].path,
                click: selectDrive
            };

            submenu.push(item);
        });

        const contextMenu = Menu.buildFromTemplate([
            {id: 'login', label: 'Login', type: 'normal', click: clickMenuItem},
            {type: 'separator'},
            {id: 'connect', label: 'Connect device', type: 'normal', click: clickMenuItem},
            {label: 'Select drive', submenu: submenu},
            {id: 'configure', label: 'Configure', type: 'normal', click: clickMenuItem},
            {id: 'test', label: 'Test', type: 'normal', click: clickMenuItem},
            {type: 'separator'},
            {id: 'quit', label: 'Quit', type: 'normal', click: clickMenuItem}
            ]);

        tray.setContextMenu(contextMenu);
    });
}

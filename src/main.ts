import { app, session, ipcMain, nativeImage, BrowserWindow, Tray, Menu, MenuItem, Notification } from 'electron';
import { Logger, LoggerManager, LoggerLevel, LoggerFileTarget } from 'logger';
import { ConfigManager } from './utils/ConfigManager';
import { Serial } from './communication/Serial';
import * as drivelist from 'drivelist';
import { Garfield } from './Garfield';
import * as path from 'path';
import * as url from 'url';
import * as usb from 'usb';

const garfield: Garfield = new Garfield(); // Object that holds most of the garfield logic

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let window;
let tray;
let icon = nativeImage.createFromPath(path.join(__dirname, '../byzance_logo.png'));

garfield.on('websocket_open', notification);

function start() {

    tray = new Tray(icon);
    tray.setToolTip('Garfield App');

    renderTrayContextMenu();

    notification('Garfield has started.');
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', start);

ipcMain.on('login', (event, token) => {

    Logger.warn(token);

    if (window) {
        window.close();
        window = null;
    }

    garfield.init(token);

    renderTrayContextMenu(); 
});

ipcMain.on('window', (event, win: string) => {

    switch (win) {
        case 'configuration': {
            window.loadURL(url.format({
                pathname: path.join(__dirname, '../views/configuration.html'),
                protocol: 'file:',
                slashes: true
            }));
            break;
        }

        case 'home': {
            window.loadURL(url.format({
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
    event.returnValue = ConfigManager.config.config();
});

ipcMain.on('configManager', (event) => {
    event.returnValue = ConfigManager.config;
});

ipcMain.on('tyrionUrl', (event) => {
    event.returnValue = getTyrionUrl();
});

ipcMain.on('requestData', (event, requestedData) => {
    event.returnValue = garfield.getAuth();
});

function getTyrionUrl(): string {

    Logger.info('getTyrionUrl: getting url');

    let host = ConfigManager.config.get<string>('tyrionHost').trim();
    let secured = ConfigManager.config.get<boolean>('tyrionSecured');
    let protocol = (secured ? 'https://' : 'http://');

    return protocol + host;
}

usb.on('attach', function(device) {
    Logger.warn('USB attached');
    renderTrayContextMenu();
});

function notification(message) {
    let notification = new Notification({
        title: 'Garfield',
        subtitle: '',
        body: message,
        actions: [],
        icon: icon
    });

    notification.show();
}

function clickMenuItem(menuItem, browserWindow, event) {
    Logger.info('Click on button: ', menuItem.id);

    switch (menuItem.id) {
        case 'login': {
            window = new BrowserWindow({height: 150, width: 300, icon: icon});
            window.loadURL(url.format({
                pathname: path.join(__dirname, '../views/login.html'),
                protocol: 'file:',
                slashes: true
            }));
            break;
        }
        case 'connect': {
            
            break;
        }
        case 'configure': {
            if (garfield.hasDevice()) {
                garfield.configure();
            } else {
                notification('No device connected!');
            }
            break;
        }
        case 'test': {
            if (garfield.hasDevice()) {
                garfield.test();
            } else {
                notification('No device connected!');
            }
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
/*
function addDevice(mountpoint: string) {

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
}*/

function selectDrive(menuItem, browserWindow, event) {
    garfield.connectDevice(menuItem.id);
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

        let template: any[] = [];

        if (garfield.hasAuth()) {
            template.push({id: 'login', label: 'Login', type: 'normal', click: clickMenuItem});
        } else {
            template.push({id: 'logout', label: 'Logout', type: 'normal', click: clickMenuItem});
        }

        template.push({type: 'separator'});
        template.push({id: 'connect', label: 'Connect Becki', type: 'normal', click: clickMenuItem});
        template.push({label: 'Select drive', submenu: submenu});

        if (garfield.devices.length === 0) {
            template.push({id: 'configure', label: 'Configure', type: 'normal', click: clickMenuItem, enabled: false});
            template.push({id: 'test', label: 'Test', type: 'normal', click: clickMenuItem, enabled: false});
        } else {
            template.push({id: 'configure', label: 'Configure', type: 'normal', click: clickMenuItem});
            template.push({id: 'test', label: 'Test', type: 'normal', click: clickMenuItem});
        }

        template.push({type: 'separator'});
        template.push({id: 'quit', label: 'Quit', type: 'normal', click: clickMenuItem});

        const contextMenu = Menu.buildFromTemplate(template);

        tray.setContextMenu(contextMenu);
    });
}

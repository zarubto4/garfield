import { app, session, ipcMain, nativeImage, BrowserWindow, Tray, Menu, MenuItem, Notification, autoUpdater } from 'electron';
import { ConfigManager } from './utils/ConfigManager';
import * as isDev from 'electron-is-dev';
import * as drivelist from 'drivelist';
import { Garfield } from './Garfield';
import { Logger } from 'logger';
import * as path from 'path';
import * as url from 'url';
import * as usb from 'usb';
import * as fs from 'fs';
import { SerialMessage } from './communication/Serial';

const platform = process.platform;
let icon;

/**************************************
 *                                    *
 * Environment stuff                  *
 *                                    *
 **************************************/

try {

    // Do platform specific tasks
    switch (platform) {
        case 'win32': {
            Logger.info('main - Running on Windows platform');
            if (handleSquirrelEvent()) {
                app.quit();
            }

            icon = nativeImage.createFromPath(path.join(__dirname, '../assets/byzance_logo_grey.ico'));
            // Logger.info('Setting URL for updates');
            // autoUpdater.setFeedURL('http://localhost:3000/releases/win');
            break;
        }
        case 'darwin': {
            Logger.info('main - Running on Mac platform');
            icon = nativeImage.createFromPath(path.join(__dirname, '../assets/byzance_logo_grey.png'));
            break;
        }
        case 'linux': {
            Logger.info('main - Running on Linux platform');
            icon = nativeImage.createFromPath(path.join(__dirname, '../assets/byzance_logo_grey.png'));
            break;
        }
        default:
            icon = nativeImage.createFromPath(path.join(__dirname, '../assets/byzance_logo_grey.png'));
            break;
    }

/**************************************
 *                                    *
 * Application lifecycle              *
 *                                    *
 **************************************/

    let validator = {
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
                    rtscts: {
                        type: 'boolean'
                    },
                    crc: {
                        type: 'boolean'
                    }
                }
            },
            updateURL: {
                type: 'object',
                structure: {
                    win: {
                        type: 'string'
                    },
                    darwin: {
                        type: 'string'
                    },
                    linux: {
                        type: 'string'
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

    // init ConfigManager - if anything fail, exit program
    let configManager: ConfigManager = null;
    try {
        configManager = new ConfigManager('config/default.json', validator);
        ConfigManager.configLoggers(configManager.get('loggers'));
    } catch (e) {
        Logger.error('ConfigManager init failed with', e.toString());
        process.exit();
    }

    const garfield: Garfield = new Garfield(configManager); // Object that holds most of the garfield logic

    let window;
    let tray;

    garfield
        .on(Garfield.WEBSOCKET_OPENED, notification)
        .on(Garfield.WEBSOCKET_CLOSED, notification)
        .on(Garfield.TESTER_CONNECTED, () => {
            notification('TestKit connected');
            renderTrayContextMenu();
        })
        .on(Garfield.TESTER_DISCONNECTED, () => {
            notification('TestKit disconnected');
            renderTrayContextMenu();
        })
        .on(Garfield.UNAUTHORIZED, notification)
        .on(Garfield.AUTHORIZED, renderTrayContextMenu)
        .on(Garfield.SHUTDOWN, () => {
            notification('Logout successful');
            renderTrayContextMenu();
        });

    app.on('ready', checkForUpdates);

    app.on('window-all-closed', (event) => {
        event.preventDefault(); // Default is app quitting
    });

    ipcMain.on('login', (event, token) => {
        login(token, false);
    });

    ipcMain.on('login_remember', (event, token) => {
        login(token, true);
    });

    ipcMain.on('tyrionUrl', (event) => {
        event.returnValue = getTyrionUrl();
    });

    ipcMain.on('terminal', (event, message) => {
        garfield.device.sendPlain(message);
    });

    usb.on('attach', function(device) {
        Logger.warn('main - new USB device attached');
        setTimeout(renderTrayContextMenu, 500);
    });

/**************************************
 *                                    *
 * Support functions                  *
 *                                    *
 **************************************/

    function checkForUpdates(): void {
        if (isDev) {
            Logger.info('main::checkForUpdates - running in DEV mode, no updates');
            start();
        } else {
            Logger.info('main::checkForUpdates - running in PROD mode, checking updates');
            start();
/*
        autoUpdater
            .once('update-not-available', () => {
                start();
            }).once('update-available', () => {
                Logger.info('Update available - downloading');
                window = new BrowserWindow({show: false, height: 170, width: 450, icon: icon});
                window.loadURL(url.format({
                    pathname: path.join(__dirname, '../views/update.html'),
                    protocol: 'file:',
                    slashes: true
                }));
                window.once('ready-to-show', () => {
                    window.show();
                }).once('closed', () => {
                    window = null;
                });
            }).once('update-downloaded', () => {
                Logger.info('Update downloaded');
                autoUpdater.quitAndInstall();
            });

             autoUpdater.checkForUpdates();*/
        }
    }

    function start(): void {

        Logger.info('main::start - start garfield');

        tray = new Tray(icon);
        tray.setToolTip('Garfield App');
        renderTrayContextMenu();

        notification('Garfield has started.');

        fs.readFile(path.join(__dirname, '../app_data/authToken'), 'utf8', (err, data) => {
            if (!err) {
                garfield.init(data);
            } else {
                Logger.warn('main::start - cannot read token: ' + err.toString());
            }
        });
    }

    function login(token: string, remember: boolean): void {

        if (window) {
            window.close();
        }

        garfield.init(token);

        if (remember) {

            Logger.debug('main::login - saving token');

            let saveToken = () => {
                fs.writeFile(path.join(__dirname, '../app_data/authToken'), token, (writeErr) => { // Save token
                    if (!writeErr) {
                        Logger.debug('main::login - token saved');
                    } else {
                        Logger.error('main::login - ' + writeErr.toString());
                    }
                });
            };

            fs.stat(path.join(__dirname, '../app_data'), (err, stats) => { // Check dir existence
                if (err) {
                    Logger.warn('main::login - missing app_data dir: ' + err.toString());
                    fs.mkdir(path.join(__dirname, '../app_data'), (mkErr) => { // Create dir
                        if (!mkErr) {
                            saveToken();
                        } else {
                            Logger.error('main::login - cannot create app_data dir: ' + mkErr.toString());
                        }
                    });
                } else {
                    saveToken();
                }
            });
        }
    }

    function getTyrionUrl(): string {

        Logger.debug('main::getTyrionUrl: getting url');

        let host = configManager.get<string>('tyrionHost').trim();
        let secured = configManager.get<boolean>('tyrionSecured');
        let protocol = (secured ? 'https://' : 'http://');

        Logger.trace('main::getTyrionUrl: host', host);

        return protocol + host;
    }

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

    function clickMenuItem(menuItem, browserWindow, event): void {
        Logger.info('main::clickMenuItem - click on button: ', menuItem.id);

        switch (menuItem.id) {
            case 'login': {
                window = new BrowserWindow({show: false, height: 170, width: 450, icon: icon});
                window.loadURL(url.format({
                    pathname: path.join(__dirname, '../views/login.html'),
                    protocol: 'file:',
                    slashes: true
                }));
                window.once('ready-to-show', () => {
                    window.show();
                }).once('closed', () => {
                    window = null;
                });
                break;
            }
            case 'logout': {

                fs.stat(path.join(__dirname, '../app_data/authToken'), (statErr, stats) => { // Check file existence
                    if (statErr) {
                        Logger.warn('main::clickMenuItem - logout, file does not exist ' + statErr.toString());
                        return;
                    }

                    fs.unlink(path.join(__dirname, '../app_data/authToken'), (err?) => { // Delete file
                        if (err) {
                            Logger.error('main::clickMenuItem - logout, cannot remove token ' + err);
                        } else {
                            Logger.info('main::clickMenuItem - logout, token deleted');
                        }
                    });
                });

                garfield.shutdown();
                break;
            }
            case 'reconnect_becki': {

                garfield.reconnectBecki();
                break;
            }
            case 'disconnect_tester': {
                if (garfield.hasTester()) {
                    garfield.disconnectTester();
                } else {
                    notification('No device connected!');
                }
                break;
            }
            case 'terminal': {
                window = new BrowserWindow({show: false, height: 500, width: 800, icon: icon});
                window.loadURL(url.format({
                    pathname: path.join(__dirname, '../views/terminal.html'),
                    protocol: 'file:',
                    slashes: true
                }));
                garfield.device.attachTerminal((message: string) => {
                    window.webContents.send('terminal', message);
                });
                window.once('ready-to-show', () => {
                    window.show();
                }).once('closed', () => {
                    window = null;
                    garfield.device.dettachTerminal();
                });
                break;
            }
            case 'reset': {
                garfield.reset();
                break;
            }
            case 'quit': {
                garfield.shutdown();
                app.quit();
                break;
            }
            default:
                // code...
                break;
        }
    }

    /*
        if (drive.displayName.match(/^BYZG3_\d{4}$/)) { // If name is patern 'BYZG3_dddd' where d is a number
    */

    function selectDrive(menuItem, browserWindow, event): void {
        garfield.connectTester(menuItem.id);
    }

    function renderTrayContextMenu(): void {
        drivelist.list((error, drives) => {

            if (error) {
                throw error;
            }

            let submenu: any[] = [];

            drives.forEach((drive) => {

                if (drive.system) {
                    return; // System drives will be skipped
                }

                Logger.info('main::renderTrayContextMenu - rendering button for drive: ' + drive.displayName);

                let item = {
                    id: drive.mountpoints[0].path,
                    label: drive.mountpoints[0].path,
                    click: selectDrive
                };

                submenu.push(item);
            });

            let template: any[] = [];

            if (!garfield.hasAuth()) {
                template.push({id: 'login', label: 'Login', type: 'normal', click: clickMenuItem});
                template.push({type: 'separator'});
                template.push({id: 'connect_becki', label: 'Connect Becki', type: 'normal', click: clickMenuItem, enabled: false});
                template.push({label: 'Select drive', submenu: submenu, enabled: false});
            } else {
                template.push({id: 'logout', label: 'Logout', type: 'normal', click: clickMenuItem});
                template.push({type: 'separator'});
                if (garfield.hasBecki()) {
                    template.push({id: 'reconnect_becki', label: 'Reconnect Becki', type: 'normal', click: clickMenuItem});
                } else {
                    template.push({id: 'connect_becki', label: 'Connect Becki', type: 'normal', click: clickMenuItem});
                }
                template.push({label: 'Select drive', submenu: submenu});
            }

            if (garfield.hasTester()) {
                template.push({id: 'disconnect_tester', label: 'Disconnect TestKit', type: 'normal', click: clickMenuItem});
                template.push({id: 'terminal', label: 'Terminal', type: 'normal', click: clickMenuItem});
            } else {
                template.push({id: 'disconnect_tester', label: 'Disconnect TestKit', type: 'normal', click: clickMenuItem, enabled: false});
                template.push({id: 'terminal', label: 'Terminal', type: 'normal', click: clickMenuItem, enabled: false});
            }

            template.push({type: 'separator'});
            template.push({id: 'reset', label: 'Reset', type: 'normal', click: clickMenuItem});
            template.push({id: 'quit', label: 'Quit', type: 'normal', click: clickMenuItem});

            const contextMenu = Menu.buildFromTemplate(template);

            tray.setContextMenu(contextMenu);
        });
    }

    // Handling squirrel events for windows plarform
    function handleSquirrelEvent(): boolean {
        if (process.argv.length === 1) {
            return false;
        }

        const ChildProcess = require('child_process');

        const appFolder = path.resolve(process.execPath, '..');
        const rootAtomFolder = path.resolve(appFolder, '..');
        const updateDotExe = path.resolve(path.join(rootAtomFolder, 'Update.exe'));
        const exeName = path.basename(process.execPath);

        const spawn = function(command, args) {
            let spawnedProcess, error;

            try {
                spawnedProcess = ChildProcess.spawn(command, args, {
                    detached: true
                });
            } catch (error) {}

            return spawnedProcess;
        };

        const spawnUpdate = function(args) {
            return spawn(updateDotExe, args);
        };

        const squirrelEvent = process.argv[1];
        switch (squirrelEvent) {
            case '--squirrel-install':
            case '--squirrel-updated':
                // Optionally do things such as:
                // - Add your .exe to the PATH
                // - Write to the registry for things like file associations and
                //   explorer context menus

                // Install desktop and start menu shortcuts
                spawnUpdate(['--createShortcut', exeName]);

                return true;

            case '--squirrel-uninstall':
                // Undo anything you did in the --squirrel-install and
                // --squirrel-updated handlers

                // Remove desktop and start menu shortcuts
                spawnUpdate(['--removeShortcut', exeName]);

                return true;

            case '--squirrel-obsolete':
                // This is called on the outgoing version of your app before
                // we update to the new version - it's the opposite of
                // --squirrel-updated

                return true;
        }
    };

} catch (e) {
    process.exit();
}

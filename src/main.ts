import { app, ipcMain, nativeImage, BrowserWindow, Tray, Menu, Notification, autoUpdater } from 'electron';
import { ConfigManager } from './utils/ConfigManager';
import * as isDev from 'electron-is-dev';
import * as drivelist from 'drivelist';
import { Garfield } from './Garfield';
import {Logger, LoggerManager} from 'logger';
import * as path from 'path';
import * as url from 'url';
import * as usb from 'usb';
import * as fs from 'fs';

const platform = process.platform;
let icon;
let iconPath: string = null;
let eNotify = null;
/**************************************
 *                                    *
 * Enviroment stuff                   *
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
            icon = nativeImage.createFromPath(path.join(__dirname, '../assets/iconset/icon_16x16@2x.png'));
            iconPath = path.join(__dirname, '../assets/iconset/icon_512x512.png');
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

    let loger_main_menu = null;

    // Set Logger
    if (!loger_main_menu) {
        loger_main_menu = LoggerManager.get('main_menu');
        if (!loger_main_menu) {
            loger_main_menu = Logger;
        }
    }

    const garfield: Garfield = new Garfield(configManager); // Object that holds most of the garfield logic

    // Set Callback
    garfield.onMenuChangeCallback = (e) => {
        renderTrayContextMenu();
    };

    let window;
    let tray;

    garfield
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
        .on(Garfield.NOTIFICATION, notification)
        .on(Garfield.SHUTDOWN, () => {
            notification('Logout successful');
            renderTrayContextMenu();
        });

    app.on('ready', checkForUpdates)
        .on('window-all-closed', (event) => {
            event.preventDefault(); // Default is app quitting
        })
        .on('will-quit', () => {
            garfield.shutdown();
            tray.destroy();
        });

    // Hide icon on Mac
    app.dock.hide();

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
        if (garfield.serialHandlerer) {
            if (garfield.serialHandlerer.getTesterKitDevice()) {
                garfield.serialHandlerer.getTesterKitDevice().sendPlain(message);
            } else {
                notification('ERROR: Test Kit is not connected');
            }

        }else {
            notification('ERROR: garfield.serialHandlerer is null');
        }
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

             autoUpdater.checkForUpdates();
             */
        }
    }

    function start(): void {

        Logger.info('main::start - start Garfield');

        tray = new Tray(icon);
        tray.setToolTip('Garfield App');
        tray.on('click', () => {
            tray.popUpContextMenu();
        });
        renderTrayContextMenu();

        // Notify Notification Settings
        eNotify = require('electron-notify');
        eNotify.setConfig({
            appIcon: iconPath,
            displayTime: 6000
        });

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

    function createWindow(filename: string, height: number, width: number) {
        window = new BrowserWindow({show: false, height: height, width: width, icon: icon});
        window.setMenu(null);
        window.loadURL(url.format({
            pathname: path.join(__dirname, '../views/' + filename),
            protocol: 'file:',
            slashes: true
        }));
        window.once('ready-to-show', () => {
            window.show();
        }).once('closed', () => {
            window = null;
        });
    }

    function clickMenuItem(menuItem, browserWindow, event): void {
        loger_main_menu.info('main::clickMenuItem - click on button: ', menuItem.id);

        switch (menuItem.id) {
            case 'login': {
                createWindow('login.html', 150, 460);
                break;
            }
            case 'logout': {

                fs.stat(path.join(__dirname, '../app_data/authToken'), (statErr, stats) => { // Check file existence
                    if (statErr) {
                        loger_main_menu.warn('main::clickMenuItem - logout, file does not exist ' + statErr.toString());
                        return;
                    }

                    fs.unlink(path.join(__dirname, '../app_data/authToken'), (err?) => { // Delete file
                        if (err) {
                            loger_main_menu.error('main::clickMenuItem - logout, cannot remove token ' + err);
                        } else {
                            loger_main_menu.info('main::clickMenuItem - logout, token deleted');
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
                if (garfield.serialHandlerer) {
                    if (garfield.serialHandlerer.hasTestKit()) {
                        garfield.serialHandlerer.disconnectTester();
                    } else {
                        notification('No device connected!');
                    }
                } else {
                    notification('Error: Serial Handler is null');
                }
                break;
            }
            case 'terminal': {
                if (garfield.serialHandlerer) {
                    if (garfield.serialHandlerer.hasTestKit()) {
                        createWindow('terminal.html', 502, 800);
                        garfield.serialHandlerer.getTesterKitDevice().attachTerminal((message: string) => {
                            window.webContents.send('terminal', message);
                        });
                        window.once('closed', () => {
                            if (garfield.serialHandlerer &&  garfield.serialHandlerer.getTesterKitDevice()) {
                                garfield.serialHandlerer.getTesterKitDevice().detachTerminal();
                            }
                        });
                    }
                } else {
                    notification('Error: Serial Handler is null');
                }
                break;
            }
            case 'settings': {
                createWindow('settings.html', 500, 800);
                break;
            }
            case 'reset': {
                garfield.reset();
                break;
            }
            case 'quit': {
                app.quit();
                break;
            }
            default: {
                Logger.warn('main::clickMenuItem - unknown button:', menuItem.id);
                break;
            }
        }
    }

    function selectDrive(menuItem, browserWindow, event): void {
        if (garfield.serialHandlerer) {
            if (garfield.serialHandlerer.hasTestKit()) {
                garfield.serialHandlerer.getTesterKitDevice().setPath(menuItem);
            } else {
                notification('No device connected!');
            }
        } else {
            notification('Error: Serial Handler is null');
        }
    }

    function renderTrayContextMenu(): void {
        loger_main_menu.info('Main::renderTrayContextMenu');
        if (!tray.isDestroyed()) {

            loger_main_menu.info('Main::renderTrayContextMenu:: is NOT destroyed');
            drivelist.list((error, drives) => {

                if (error) {
                    loger_main_menu.error('Main::renderTrayContextMenu -', error);
                    throw error;
                }

                loger_main_menu.info('Main::renderTrayContextMenu:: ready to check all drivers');
                loger_main_menu.info('Main::renderTrayContextMenu:: List: ', drives);

                // List of Drivers for Selection
                let submenu: any[] = [];

                drives.forEach((drive) => {

                    if (drive.system) {
                        loger_main_menu.info('Main::renderTrayContextMenu:: Driver: ', drive.displayName , ' is system driver. Skip. ');
                        return; // System drives will be skipped
                    }

                    loger_main_menu.info('Main::renderTrayContextMenu - rendering button for drive: ' + drive.displayName);

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
                }

                template.push({type: 'separator'});
                template.push({label: 'Select drive', submenu: submenu});

                // Becki is connected or created
                if (garfield.hasBecki()) {
                    template.push({id: 'reconnect_becki', label: 'Reconnect Becki', type: 'normal', click: clickMenuItem});
                } else {
                    template.push({id: 'connect_becki', label: 'Connect Becki', type: 'normal', click: clickMenuItem});
                }

                // Tester Kit Is connected or Cretead
                if (garfield.hasTestKit()) {
                    template.push({id: 'disconnect_tester', label: 'Disconnect TestKit', type: 'normal', click: clickMenuItem});
                    template.push({id: 'terminal', label: 'Terminal', type: 'normal', click: clickMenuItem});
                } else {
                    template.push({id: 'disconnect_tester', label: 'Disconnect TestKit', type: 'normal', click: clickMenuItem, enabled: false});
                    template.push({id: 'terminal', label: 'Terminal', type: 'normal', click: clickMenuItem, enabled: false});
                }


                template.push({type: 'separator'});
                template.push({id: 'settings', label: 'Settings', type: 'normal', click: clickMenuItem});
                template.push({id: 'reset', label: 'Reset', type: 'normal', click: clickMenuItem});
                template.push({id: 'quit', label: 'Quit', type: 'normal', click: clickMenuItem});

                const contextMenu = Menu.buildFromTemplate(template);
                try {
                    tray.setContextMenu(contextMenu);
                } catch (e) {
                    loger_main_menu.error('main::renderTrayContextMenu - probably destroyed too soon,', e.toString());
                }
            });
        } else {
            loger_main_menu.info('renderTrayContextMenu:: is destroyed');
        }
    }

    // Handling squirrel events for windows platform
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
            let spawnedProcess;

            try {
                spawnedProcess = ChildProcess.spawn(command, args, {
                    detached: true
                });
            } catch (error) {
                Logger.error('main::handleSquirrelEvent: ERROR:', error);
            }

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
    }

} catch (e) {
    process.exit();
}


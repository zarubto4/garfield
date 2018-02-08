import {
    Becki, WsMessageDeviceConnect, WsMessageDeviceBinary, WsMessageDeviceConfigure,
    WsMessageTesterConnect, WsMessageTesterDisconnect, WsMessageDeviceTest, Request
} from './communication/Becki';
import { Serial, SerialMessage } from './communication/Serial';
import { ConfigManager } from './utils/ConfigManager';
import { Tyrion } from './communication/Tyrion';
import { Device } from './device/Device';
import { EventEmitter } from 'events';
import * as rp from 'request-promise';
import { Logger, LoggerManager } from 'logger';
import { Router } from './utils/Router';

export class Garfield extends EventEmitter {

    /**************************************
     *                                    *
     * Public interface                   *
     *                                    *
     **************************************/

    public static readonly SHUTDOWN = 'shutdown';
    public static readonly AUTHORIZED = 'authorized';
    public static readonly UNAUTHORIZED = 'unauthorized';
    public static readonly NOTIFICATION = 'notification';
    public static readonly TESTER_CONNECTED = 'tester_connected';
    public static readonly TESTER_DISCONNECTED = 'tester_disconnected';

    public device: Device;
    public person: IPerson;
    public tyrionClient: Tyrion; // TODO

    constructor(configManager: ConfigManager) {
        super();
        this.configManager = configManager;
    }

    public init(token: string): void {

        rp({
            method: 'GET',
            uri: (this.configManager.get<boolean>('tyrionSecured') ? 'https://' : 'http://') +
            this.configManager.get<string>('tyrionHost').trim() + '/login/person',
            body: {},
            json: true,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'garfield-app',
                'x-auth-token': token
            }
        }).then((body) => {
            this.person = body.person;
            this.authToken = token;
            this.initializeRouter();
            this.becki = new Becki(this.configManager, token, LoggerManager.get('websocket'));
            this.becki
                .on(Becki.OPEN, this.onBeckiConnected)
                .on(Becki.CLOSE, () => { this.emit(Garfield.NOTIFICATION, 'Becki is disconnected.'); })
                .on(Becki.MESSAGE_RECEIVED, this.messageResolver);

            this.becki.connect();
            this.emit(Garfield.AUTHORIZED);
        }).catch((error) => {
            Logger.error('Garfield::init - cannot retrieve person, error:', JSON.stringify(error));
            if (error.hasOwnProperty('response')) {
                this.emit(Garfield.UNAUTHORIZED, 'Authorization was unsuccessful, response status ' + error.response.statusCode);
            } else if (error.hasOwnProperty('options')) {
                this.emit(Garfield.UNAUTHORIZED, 'Unable to connect to the remote server on ' + error.options.uri);
            } else {
                this.emit(Garfield.UNAUTHORIZED, 'Unauthorized, please login.');
            }
        });
    }

    public connectTester(drive: string): void {
        Logger.debug('Garfield::connectTester - connecting to ' + drive);

        let serial: Serial = new Serial(this.configManager, LoggerManager.get('serial'));

        serial
            .once(Serial.OPENED, () => {
                this.device = new Device(drive, drive, serial);
                this.device.on(Device.DISCONNECTED, this.onTesterDisconnected.bind(this));
                this.becki.send(new WsMessageTesterConnect('TK3G'));
                // this.setDevicetDetection();
                this.emit(Garfield.TESTER_CONNECTED);
            })
            .once(Serial.CONNECTION_ERROR, (err) => {
                Logger.error(err);
                // TODO what to do?
            })
            .on(Serial.BUTTON, () => {
                if (!this.buttonClicked) {
                    if (!this.becki.isSubscribed()) {
                        this.emit(Garfield.NOTIFICATION, 'Becki is not subscribed, open Becki in the browser.');
                        Logger.warn('Garfield::connectTester - need Becki subscription for this, open Becki in the browser');
                    } else {
                        this.buttonClicked = true;
                        setTimeout(() => { // A little delay before the button can be clicked again
                            this.buttonClicked = false;
                        }, 5000);
                        this.checkIoda();
                    }
                }
            });

        serial.connect();
    }

    public disconnectTester(): void {
        if (this.hasTester()) {
            if (this.deviceDetection) {
                clearInterval(this.deviceDetection);
            }
            this.device.disconnect();
        }
    }

    public hasTester(): boolean {
        return !!this.device;
    }

    public hasBecki(): boolean {
        return !!this.becki;
    }

    public reconnectBecki(): void {
        this.becki.connect();
    }

    public getAuth(): string {
        return this.authToken;
    }

    public hasAuth(): boolean {
        return !!this.authToken;
    }

    public shutdown() {

        this.disconnectTester();

        if (this.becki) {
            this.becki.disconnect();
            this.becki = null;
        }

        this.authToken = null;

        this.emit(Garfield.SHUTDOWN);
    }

    public reset() {
        this.disconnectTester();
        this.becki.connect();
    }

    private checkIoda() {
        if (this.deviceDetection) {
            clearInterval(this.deviceDetection);
        }
        Logger.info('Garfield::checkIoda - checking connected Ioda');
        this.device.ioda_connected = true;
        this.device.send(new SerialMessage('ATE', 'ioda_bootloader'))
            .then((response: string) => {
                if (response === 'ok') {
                    Logger.debug('Garfield::checkIoda - retrieving full_id');
                    this.device.send(new SerialMessage('DUT', 'fullid', null, 2000)).then((full_id: string) => {
                        Logger.trace('Garfield::checkIoda - received full_id:', full_id);
                        this.becki.send(new WsMessageDeviceConnect(full_id)); // Connected device has at least bootloader
                    }, (err) => {
                        Logger.trace('Garfield::checkIoda - not responding, probably dead device');
                        this.becki.send(new WsMessageDeviceConnect(null)); // Connected device is dead, probably brand new
                    });
                }
                // this.setDevicetDetection();
            })
            .catch( (error) => {
                // TODO tester not responding
            });
    }

    private setDevicetDetection() {
        this.deviceDetection = setInterval(() => { // Periodically check if testKit is connected
            this.device.send(new SerialMessage('ATE', 'meas_pwr')).then((res) => {
                Logger.info(res);
            }, (err) => {
                this.device.disconnect();
            });
        }, 5000);
    }

    private onBeckiConnected = () => {
        this.emit(Garfield.NOTIFICATION, 'Becki is connected.');
        if (this.hasTester()) {
            this.becki.send(new WsMessageTesterConnect('TK3G'));
        }
    }

    private onTesterDisconnected = () => {
        Logger.info('Garfield::onTesterDisconnected - tester disconnected');
        this.becki.send(new WsMessageTesterDisconnect('TK3G'));
        this.device = null;
        this.emit(Garfield.TESTER_DISCONNECTED);
    }

    /**
     * Route method which retrieves full_id from the device.
     * @param {string[]} path
     * @param {Request} request
     * @returns {boolean}
     */
    private getDeviceId = (path: string[], request: Request): boolean => {
        this.device.send(new SerialMessage('ATE', 'ioda_bootloader'))
            .then((bootloader: string) => {
                if (bootloader === 'ok') {
                    Logger.debug('Garfield::getDeviceId - opened bootloader, asking for full_id');
                    return this.device.send(new SerialMessage('DUT', 'fullid'));
                } else {
                    throw new Error('Cannot switch to bootloader. got response: ' + bootloader);
                }
            })
            .then((full_id: string) => {
                Logger.info('Garfield::getDeviceId - retrieved full_id: ' + full_id);
                request.reply({
                    status: 'success',
                    device_id: full_id
                });
            })
            .catch((error) => {
                let errString: string;
                if (error instanceof Error) {
                    errString = error.name + ': ' + error.message;
                } else {
                    errString = error;
                }

                request.reply({
                    status: 'error',
                    error: 'cannot get full id of the device - ' + errString
                });
                // TODO check for device disconnection
            });

        return true;
    }

    /**
     * Route method which configures the device based on the given configuration.
     * @param {string[]} path
     * @param {Request} request
     * @returns {boolean}
     */
    private configureDevice = (path: string[], request: Request): boolean => {
        let msg: WsMessageDeviceConfigure = <WsMessageDeviceConfigure> request.data;
        this.device.configure(msg.configuration, (err) => {
            if (err) {
                Logger.error('Garfield::configureDevice - ', err);
                request.reply({
                    status: 'error',
                    error: err.toString()
                });
            } else {
                request.reply({ status: 'success' });
            }
        });

        return true;
    }

    /**
     * Route method which tests the device based on the given test configuration.
     * @param {string[]} path
     * @param {Request} request
     * @returns {boolean}
     */
    private testDevice = (path: string[], request: Request): boolean => {
        let msg: WsMessageDeviceTest = <WsMessageDeviceTest> request.data;
        this.device.send(new SerialMessage('ATE', 'ioda_restart'))
            .then((restart) => {
                if (restart === 'ok') {
                    this.device.test(msg.test_config, (errors?: string[]) => {
                        if (errors) {
                            Logger.error(errors);
                            request.reply({
                                status: 'error',
                                errors: errors
                            });
                        } else {
                            request.reply({
                                status: 'success'
                            });
                        }
                    });
                } else {
                    throw new Error('Failed to restart before test, got response: ' + restart);
                }
            })
            .catch((error) => {
                let errString: string;
                if (error instanceof Error) {
                    errString = error.name + ': ' + error.message;
                } else {
                    errString = error;
                }

                request.reply({
                    status: 'error',
                    error: errString
                });
            });
        return true;
    }

    private backupDevice = (path: string[], request: Request): boolean => {
        this.device.send(new SerialMessage('DUT', 'firmware', 'backup', 30000))
            .then((backup: string) => {
                if (backup === 'ok') {
                    return this.device.send(new SerialMessage('ATE', 'ioda_restart'));
                } else {
                    throw new Error('Failed to do backup, got response: ' + backup);
                }
            })
            .then((restart) => {
                if (restart === 'ok') {
                    request.reply({
                        status: 'success'
                    });
                } else {
                    throw new Error('Failed to restart after backup, got response: ' + restart);
                }
            })
            .catch((error) => {
                let errString: string;
                if (error instanceof Error) {
                    errString = error.name + ': ' + error.message;
                } else {
                    errString = error;
                }

                request.reply({
                    status: 'error',
                    error: errString
                });
            });

        return true;
    }

    private uploadBinary = (path: string[], request: Request): boolean => {
        let msg: WsMessageDeviceBinary = <WsMessageDeviceBinary> request.data;
        Logger.info('Garfield::uploadBinary - retrieving binary from blob server, url:', msg.url);

        // Get bin file from the given url
        rp({
            method: 'GET',
            uri: msg.url,
            encoding: null
        }).then((body) => {
            if (msg.type === 'bootloader') {
                Logger.debug('Garfield::uploadBinary - uploading bootloader');
                this.device.writeBootloader(body, (err) => {
                    if (err) {
                        Logger.error('Garfield::uploadBinary - ' + err.toString());
                        request.reply({
                            status: 'error',
                            error: err.toString()
                        });
                    } else {
                        Logger.trace('Garfield::uploadBinary - bootloader upload finished');
                        this.device.send(new SerialMessage('ATE', 'ioda_bootloader', null, 7500, 2, 10000))
                            .then((boot_res: string) => {
                                if (boot_res === 'ok') {
                                    return this.device.send(new SerialMessage('DUT', 'ping', null, 2000));
                                } else {
                                    throw new Error('Cannot switch to bootloader, got response: ' + boot_res);
                                }
                            })
                            .then((ping_res: string) => {
                                if (ping_res === 'ok') {
                                    return this.device.send(new SerialMessage('DUT', 'defaults'));
                                } else {
                                    throw new Error('Bootloader ping failed, got response: ' + ping_res);
                                }
                            })
                            .then((def_res: string) => {
                                if (def_res === 'ok') {
                                    return this.device.send(new SerialMessage('DUT', 'configured', '1'));
                                } else {
                                    throw new Error('Cannot set default, got response: ' + def_res);
                                }
                            })
                            .then((conf_res: string) => {
                                if (conf_res === '1') {
                                    request.reply({
                                        type: 'bootloader',
                                        status: 'success'
                                    });
                                } else {
                                    throw new Error('Cannot set configured, got response: ' + conf_res);
                                }
                            })
                            .catch((error) => {
                                let errString: string;
                                if (error instanceof Error) {
                                    errString = error.name + ': ' + error.message;
                                } else {
                                    errString = error;
                                }

                                request.reply({
                                    status: 'error',
                                    error: errString
                                });
                            });
                    }
                });
            } else {
                Logger.debug('Garfield::uploadBinary - uploading firmware');
                this.device.writeFirmware(body, (err) => {
                    if (err) {
                        Logger.error('Garfield::uploadBinary' + err.toString());
                        request.reply({
                            status: 'error',
                            error: err.toString()
                        });
                    } else {
                        Logger.trace('Garfield::uploadBinary - uploading firmware finished');
                        setTimeout(() => {
                            request.reply({
                                status: 'success',
                                type: 'firmware'
                            });
                        }, 10000);
                    }
                });
            }
        }).catch((error) => {
            request.reply({
                status: 'error',
                error: error.toString()
            });
        });

        return true;
    }

    private initializeRouter() {
        this.router = new Router();
        this.router.route['device_id'] = this.getDeviceId;
        this.router.route['device_configure'] = this.configureDevice;
        this.router.route['device_test'] = this.testDevice;
        this.router.route['device_binary'] = this.uploadBinary;
        this.router.route['device_backup'] = this.backupDevice;
    }

    private messageResolver = (data: any, response: (data: Object) => void) => {
        if (data.message_type && data.message_channel) {
            if (data.message_channel === Becki.WS_CHANNEL) {
                if (!this.router.resolve([data.message_type], <Request>{
                    data: data,
                    reply: response
                })) {
                    if (data.message_type !== 'token_web_view_verification' || data.message_type !== 'hardware_verification') {
                        Logger.error('Garfield::messageResolver - unknownEndpoint: ' + data.message_type + ' - ' + data.message_channel, 'Possible routes: ', Object.keys(this.router.route));
                    }
                }
            }
        }
    }

    private deviceDetection;
    private router: Router;
    private becki: Becki; // Object for communication with Becki
    private authToken: string;
    private buttonClicked: boolean;
    private configManager: ConfigManager;
}

export interface IPerson {
    country: string;
    edit_permission: boolean;
    full_name: string;
    gender: string;
    id: string;
    mail: string;
    nick_name: string;
    picture_link: string;
}

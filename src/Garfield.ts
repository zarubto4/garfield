import { Becki, WsMessageDeviceConnect , IWebSocketMessage, WsMessageDeviceBinary, WsMessageError,
    WsMessageSuccess, WsMessageDeviceConfigure, WsMessageTesterConnect, WsMessageTesterDisconnect,
    WsMessageDeviceBinaryResult, WsMessageDeviceTestResult, WsMessageDeviceId,
    WsMessageDeviceTest } from './communication/Becki';
import { ConfigManager } from './utils/ConfigManager';
import { Configurator } from './device/Configurator';
import { Serial } from './communication/Serial';
import { Tyrion } from './communication/Tyrion';
import { Device } from './device/Device';
import { Tester } from './device/Tester';
import { EventEmitter } from 'events';
import * as request from 'request';
import { Logger } from 'logger';

export class Garfield extends EventEmitter {

    /**************************************
     *                                    *
     * Public interface                   *
     *                                    *
     **************************************/

    public device: Device;
    public person: IPerson;
    public tyrionClient: Tyrion;

    constructor() {
        super();
        ConfigManager.loadConfig('config/default.json');
    }

    public init(token: string): void {

        request({
            method: 'GET',
            uri: (ConfigManager.config.get<boolean>('tyrionSecured') ? 'https://' : 'http://') +
                ConfigManager.config.get<string>('tyrionHost').trim() + '/login/person',
            body: {},
            json: true,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'garfield-app',
                'x-auth-token': token
            }
        }, (error, response, body) => {
            if (error || response.statusCode !== 200) {
                // Logger.warn(response.statusCode);
                this.emit('unauthorized', 'Unauthorized, please login.');
                return;
            }

            this.emit('authorized');

            this.person = body.person;

            this.authToken = token;

            this.becki = new Becki(token);

            this.becki
                .once('open', () => {
                    this.emit('websocket_open', 'Becki is connected.');
                    this.keepAliveBecki = setInterval(() => {
                        this.becki.sendWebSocketMessage(new IWebSocketMessage('keepalive'));
                    }, 5000);
                })
                .on('subscribe_becki', this.messageHandler)
                .on('device_configure', this.messageHandler)
                .on('device_test', this.messageHandler)
                .on('device_binary', this.messageHandler);

            this.becki.connectWebSocket();
        });
    }

    public connectTester(drive: string): void {
        Logger.info('Device is new, connecting to ' + drive);

        let serial: Serial = new Serial();

        serial.once('connected' , () => {
            this.device = new Device(drive, drive, serial);
            this.becki.sendWebSocketMessage(new WsMessageTesterConnect('TK3G'));
            // this.setDevicetDetection();
            this.emit('tester_connected');

        }).once('connection_error', (err) => {
            Logger.error(err);

        }).on('button', () => {
            if (!this.buttonClicked) {
                this.buttonClicked = true;
                setTimeout(() => { // A little delay before the button can be clicked again
                    this.buttonClicked = false;
                }, 5000);
                this.checkIoda();
            }
        });

        serial.connect();
    }

    public disconnectTester(): void {
        if (this.hasTester()) {
            clearInterval(this.deviceDetection);
            this.device.disconnect(() => {
                this.device = null;
                this.emit('tester_disconnected');
                this.becki.sendWebSocketMessage(new WsMessageTesterDisconnect('TK3G'));
            });
        }
    }

    public hasTester(): boolean {
        return this.device ? true : false;
    }

    public hasBecki(): boolean {
        return this.becki ? true : false;
    }

    public reconnectBecki(): void {
        this.becki.connectWebSocket();
    }

    public getAuth(): string {
        return this.authToken;
    }

    public hasAuth(): boolean {
        return this.authToken ? true : false;
    }

    public shutdown() {

        if (this.deviceDetection) {
            clearInterval(this.deviceDetection);
        }

        if (this.device) {
            this.device.disconnect(() => {
                Logger.info('TestKit disconnected');
                this.device = null;
            });
        }

        if (this.keepAliveBecki) {
            clearInterval(this.keepAliveBecki);
        }

        if (this.becki) {
            this.becki.sendWebSocketMessage(new IWebSocketMessage('unsubscribe_garfield'));
            this.becki.disconnectWebSocket();
            this.becki = null;
        }

        this.authToken = null;

        this.emit('shutdown');
    }

    private checkIoda() {
        if (this.deviceDetection) {
            clearInterval(this.deviceDetection);
        }
        Logger.info('Checking for Ioda');
        this.device.ioda_connected = true;
        this.device.message('TK3G:ioda_bootloader').then((response: string) => {
            if (response === 'ok') {
                Logger.info('Opened bootloader, asking for full_id');
                this.device.message('IODA:fullid').then((full_id: string) => {
                    Logger.info('Got full_id: ' + full_id);
                    this.becki.sendWebSocketMessage(new WsMessageDeviceConnect(full_id)); // Connected device has at least bootloader
                }, (err) => {
                    this.becki.sendWebSocketMessage(new WsMessageDeviceConnect(null)); // Connected device is dead, probably brand new
                });
            }

            // this.setDevicetDetection();
        }).catch((err) => {
            // TODO tester not responding
        });
    }

    private message(message: IWebSocketMessage): void {

        Logger.info('WS message: ' + JSON.stringify(message));

        let respond = (msg: IWebSocketMessage) => {
            if (msg) {
                msg.message_id = message.message_id;
                Logger.info('Responding with: ' + JSON.stringify(msg));
                this.becki.sendWebSocketMessage(msg);
            }
            if (this.hasTester()) {
                // this.setDevicetDetection();
            }
        };

        if (!this.hasTester() && message.message_type !== 'subscribe_becki') {
            respond(new WsMessageError(message.message_type, 'No device is connected'));
            return;
        }

        if (this.hasTester()) {
            clearInterval(this.deviceDetection);
        }

        switch (message.message_type) {
            case 'subscribe_becki': {
                respond(new IWebSocketMessage('subscribe_garfield'));
                if (this.hasTester()) {
                    this.becki.sendWebSocketMessage(new WsMessageTesterConnect('TK3G'));
                }
                break;
            }
            case 'device_id': {
                this.device.message('TK3G:ioda_bootloader').then((response: string) => {
                    if (response === 'ok') {
                        Logger.info('Opened bootloader, asking for full_id');
                        this.device.message('IODA:fullid').then((full_id: string) => {
                            Logger.info('Got full_id: ' + full_id);
                            respond(new WsMessageDeviceId(full_id));
                        }, (err) => {
                            respond(new WsMessageError(message.message_type, 'cannot get full id of device'));
                        });
                    }
                }).catch((err) => {
                    respond(new WsMessageError(message.message_type, 'cannot get full id of device'));
                    this.becki.sendWebSocketMessage(new WsMessageTesterDisconnect('TK3G'));
                });
                break;
            }
            case 'device_configure': {
                let msg: WsMessageDeviceConfigure = <WsMessageDeviceConfigure> message;
                this.device.configure(msg.configuration, (err) => {
                    if (err) {
                        Logger.error(err);
                        respond(new WsMessageError(msg.message_type, err.toString()));
                    } else {
                        respond(new WsMessageSuccess(msg.message_type));
                    }
                });
                break;
            }

            case 'device_test': {
                let msg: WsMessageDeviceTest = <WsMessageDeviceTest> message;
                this.device.test(msg.test_config, (errors?: string[]) => {
                    if (errors) {
                        Logger.error(errors);
                        respond(new WsMessageDeviceTestResult(errors));
                    } else {
                        respond(new WsMessageSuccess(message.message_type));
                    }
                });
                break;
            }

            case 'device_backup': {
                this.device.message('IODA:firmware=backup').then((res: string) => {
                    if (res === 'ok') {
                        this.device.message('TK3G:ioda_restart').then((restart_res: string) => {
                            if (restart_res === 'ok') {
                                respond(new WsMessageSuccess(message.message_type));
                            } else {
                                respond(new WsMessageError(message.message_type, 'Failed to restart after backup'));
                            }
                        }, (err) => {
                            respond(new WsMessageError(message.message_type, err.toString()));
                        });
                    } else {
                        respond(new WsMessageError(message.message_type, 'Failed to do backup'));
                    }
                }, (err) => {
                    respond(new WsMessageError(message.message_type, err.toString()));
                });
                break;
            }

            case 'device_binary': {
                let msg: WsMessageDeviceBinary = <WsMessageDeviceBinary> message;

                // Get bin file from the given url
                request({
                    method: 'GET',
                    uri: msg.url,
                    encoding: null
                }, (error, response, body) => {

                    if (error) {
                        respond(new WsMessageError(msg.message_type, error.toString()));
                    } else {

                        if (response.statusCode !== 200) {
                            respond(new WsMessageError(msg.message_type, 'Unable to download binary, status was ' + response.statusCode));
                        } else {
                            if (msg.type === 'bootloader') {
                                Logger.info('It is a bootloader');
                                this.device.writeBootloader(body, (err) => {
                                    if (err) {
                                        Logger.error(err);
                                        respond(new WsMessageError(msg.message_type, err.toString()));
                                    } else {
                                        Logger.info('BootLoader upload was successfull');
                                        setTimeout(() => {
                                            this.device.message('TK3G:ioda_bootloader').then((boot_res: string) => {
                                                if (boot_res === 'ok') {
                                                    this.device.message('IODA:defaults').then((def_res: string) => {
                                                        Logger.info('Set defaults');
                                                        if (def_res === 'ok') {
                                                            Logger.info('Opened bootloader, set configured 1');
                                                            this.device.message('IODA:configured=1').then((conf_res: string) => {
                                                                Logger.info('Configured to 1');
                                                                if (conf_res === '1') {
                                                                    respond(new WsMessageDeviceBinaryResult(msg.type));
                                                                } else {
                                                                    respond(new WsMessageError(message.message_type, 'cannot set configured'));
                                                                }
                                                            }, (conf_err) => {
                                                                respond(new WsMessageError(message.message_type, 'cannot start bootloader'));
                                                            });
                                                        } else {
                                                            respond(new WsMessageError(message.message_type, 'cannot set defaults'));
                                                        }
                                                    }, (def_err) => {
                                                        respond(new WsMessageError(message.message_type, 'cannot start bootloader'));
                                                    });
                                                }
                                            }).catch((boot_err) => {
                                                respond(new WsMessageError(message.message_type, 'cannot switch ioda to bootloader'));
                                                this.becki.sendWebSocketMessage(new WsMessageTesterDisconnect('TK3G'));
                                            });
                                        }, 10000);
                                    }
                                });
                            } else {
                                this.device.writeFirmware(body, (err) => {
                                    if (err) {
                                        Logger.error(err);
                                        respond(new WsMessageError(msg.message_type, err.toString()));
                                    } else {
                                        setTimeout(() => {
                                            respond(new WsMessageDeviceBinaryResult(msg.type));
                                        }, 10000);
                                    }
                                });
                            }
                        }
                    }
                });

                break;
            }

            default:
                respond(new WsMessageError(message.message_type, 'Unknown message type'));
                break;
        }
    }

    private setDevicetDetection() {
        this.deviceDetection = setInterval(() => { // Periodicaly check if testKit is connected
            this.device.message('TK3G:meas_pwr')
                .then((res) => {
                    Logger.info(res);
                })
                .catch((err) => {
                    this.device.disconnect(() => {
                        this.becki.sendWebSocketMessage(new WsMessageTesterDisconnect('TK3G'));
                        this.device = null;
                    });
                });
        }, 5000);
    }

    private messageHandler: (message: any) => void = this.message.bind(this);
    private deviceDetection;
    private keepAliveBecki;
    private becki: Becki; // Object for communication with Becki
    private authToken: string;
    private buttonClicked: boolean;
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

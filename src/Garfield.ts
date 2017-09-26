import { Becki, WsMessageDeviceConnect , IWebSocketMessage, WsMessageDeviceBinary, WsMessageError, WsMessageSuccess, WsMessageDeviceConfigure, WsMessageDeviceTest } from './communication/Becki';
import { ConfigManager } from './utils/ConfigManager';
import { Configurator } from './device/Configurator';
import { Serial } from './communication/Serial';
import { Device } from './device/Device';
import { Tester } from './device/Tester';
import { EventEmitter } from 'events';
import { Logger } from 'logger';

export class Garfield extends EventEmitter {

    /**************************************
     *                                    *
     * Public interface                   *
     *                                    *
     **************************************/

    public devices: Device[] = []; // Array of connected devices

    constructor() {
        super();
        ConfigManager.loadConfig('config/default.json');
    }

    public init(token: string): void {

        this.authToken = token;

        this.becki = new Becki(token);

        this.becki
            .once('open', () => { this.emit('websocket_open', 'Becki is connected.'); })
            .on('device_configure', this.messageHandler)
            .on('device_test', this.messageHandler)
            .on('device_binary', this.messageHandler);

        this.becki.connectWebSocket();
    }

    public connectDevice(drive: string): void {
        Logger.info('Device is new, connecting to ' + drive);

        let serial: Serial = new Serial();

        let device: Device;

        serial.once('connected' , () => {
            device = new Device(drive, drive, serial);
            this.devices.push(device);
            device.getFullId().then((fullid: string) => {
                this.becki.sendWebSocketMessage(new WsMessageDeviceConnect(fullid));
            });
        }).once('connection_error', (err) => {
            Logger.error(err);
        });

        serial.connect();
    }

    public hasDevice(): boolean {
        return this.devices.length > 0;
    }

    public getAuth(): string {
        return this.authToken;
    }

    public hasAuth(): boolean {
        return this.authToken ? true : false;
    }

    public configure(): void {
        this.devices[0].configure({},() => {
            Logger.info('Configured');
        });
    }

    public test(): void {
        this.devices[0].test(() => {
            Logger.info('Tested');
        });
    }

    public shutdown() {
        this.becki.disconnectWebSocket();
    }

    private message(message: IWebSocketMessage): void {
        Logger.info('Got message: ', JSON.stringify(message));

        let response: IWebSocketMessage;

        let respond = () => {
            if (response) {
                response.message_id = message.message_id;
                this.becki.sendWebSocketMessage(response);
            }
        };

        switch (message.message_type) {
            case 'device_configure': {
                let msg: WsMessageDeviceConfigure = <WsMessageDeviceConfigure> message;
                this.devices[0].configure(msg.configuration, (err) => {
                    if (err) {
                        Logger.error(err);
                        response = new WsMessageError(msg.message_type, err.toString());
                    } else {
                        response = new WsMessageSuccess(msg.message_type);
                    }
                    respond();
                })
                break;
            }

            case 'device_test': {
                this.devices[0].test((err) => {
                    if (err) {
                        Logger.error(err);
                        response = new WsMessageError(message.message_type, err.toString());
                    } else {
                        response = new WsMessageSuccess(message.message_type);
                    }

                    respond();
                })
                break;
            }

            case 'device_binary': {
                let msg: WsMessageDeviceBinary = <WsMessageDeviceBinary> message;

                let device: Device = new Device('F:', 'F:', null)

                if (msg.type === 'bootloader') {
                    device.writeBootloader(msg.data, (err) => {
                        if (err) {
                            Logger.error(err);
                            response = new WsMessageError(msg.message_type, err.toString());
                        } else {
                            response = new WsMessageSuccess(msg.message_type);
                        }
                        
                        respond();
                    });
                } else {
                    device.writeFirmware(msg.data, (err) => {
                        if (err) {
                            Logger.error(err);
                            response = new WsMessageError(msg.message_type, err.toString());
                        } else {
                            response = new WsMessageSuccess(msg.message_type);
                        }
                        
                        respond();
                    });
                }

                break;
            }

            default:
                response = new WsMessageError(message.message_type, 'Unknown message type');
                respond();
                break;
        }
    }

    private messageHandler: (message: any) => void = this.message.bind(this);
    private becki: Becki; // Object for communication with Becki
    private authToken: string;
}

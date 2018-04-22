
import * as usb from 'usb';
import {EventEmitter} from 'events';
import {Logger, LoggerClass, LoggerManager} from 'logger';
import {Garfield} from '../../Garfield';
import {WsMessageTesterConnect, WsMessageTesterDisconnect} from '../Becki';
import {Serial} from './Serial';
import {TesterKitDevice} from '../../device/TesterKitDevice';
import {ConfigManager} from '../../utils/ConfigManager';
import * as drivelist from 'drivelist';



export class SerialServiceHandlerer extends EventEmitter {

    public static readonly BECKI_SEND = 'send';
    public static readonly CONNECTION_ERROR = 'connection_error';

    constructor(protected garfield: Garfield, protected configManager: ConfigManager) {
        super();

        // Set Logger
        if (!this.logger) {
            this.logger = LoggerManager.get('serial');
            if (!this.logger) {
                this.logger = Logger;
            }
        }

        this.logger.debug('SerialServiceHandlerer::constructor');

        // Handlerers
        garfield.addListener(Garfield.BECKI_IS_CONNECTED, this.becki_is_online_now);
        garfield.addListener(Garfield.BECKI_IS_DISCONNECTED, this.becki_is_offline_now);


        // Listen on usb attach
        let hh = (device: any) => {
            this.logger.debug('SerialServiceHandlerer::attach usb', device);
            setTimeout(this.usbCheck.bind(this), 500);
        };

        let h2 = (device: any) => {
            this.logger.debug('SerialServiceHandlerer::detach usb', device);
            setTimeout(this.usbCheck.bind(this), 500);
        };

        usb.on('attach', hh.bind(this));
        usb.on('detach', h2.bind(this));

        this.usbCheck();
        this.startSerialChecker();

    }

    /**
     * Request for Menu draw
     * @returns {boolean}
     */
    public hasTestKit(): boolean {
        if (this.testerKitDevice) {
            return true;
        }else {
            return false;
        }
    }

    public reset(): void {
        // TODO Required Reset from Garfield Button
    }


    public getSerial(): Serial {
        return this.serial;
    }

    public getTesterKitDevice() {
        return this.testerKitDevice;
    }

    public startSerialChecker(): void  {

        this.logger.debug('SerialServiceHandlerer::startSerialChecker');

        let serial: Serial = new Serial(this.configManager, LoggerManager.get('serial'));

        serial
            .once(Serial.OPENED, (serial_connected: Serial) => {
                this.logger.warn('SerialServiceHandlerer::connection found and opened');
                this.serial = serial_connected;

                this.emit(SerialServiceHandlerer.BECKI_SEND, new WsMessageTesterConnect('TK3G'));
                this.emit(Garfield.TESTER_CONNECTED);

                this.testerKitDevice = new TesterKitDevice(this);
                this.testerKitDevice.addListener(TesterKitDevice.DISCONNECTED, this.onTesterDisconnected);

            })
            .once(Serial.CONNECTION_ERROR, (err) => {
                this.logger.error('SerialServiceHandlerer::startSerialChecker:: Error:: ', err);
            })
            .on(Serial.BUTTON, () => {
                if (!this.buttonClicked) {
                    if (!this.garfield.getBecki().isSubscribed()) {
                        this.emit(Garfield.NOTIFICATION, 'Becki is not subscribed, open Becki in the browser.');
                        this.logger.warn('Garfield::connectTester - need Becki subscription for this, open Becki in the browser');
                    } else {
                        this.buttonClicked = true;
                        setTimeout(() => { // A little delay before the button can be clicked again
                            this.buttonClicked = false;
                        }, 5000);
                        this.testerKitDevice.checkIoda();
                    }
                }
            });

        serial.connect();
    }

    public disconnectTester(): void {
        if (this.hasTestKit()) {
            this.getTesterKitDevice().disconnect();
            this.serial.close();
            this.serial = null;
        }
    }

    private onTesterDisconnected = () => {
        this.logger.info('SerialServiceHandlerer::onTesterDisconnected - tester disconnected');
        this.emit(Garfield.BECKI_SEND, new WsMessageTesterDisconnect('TK3G'));
        this.emit(Garfield.TESTER_DISCONNECTED);
        this.testerKitDevice = null;
        this.serial = null;
    }

    /**
     * From Garfield Listener about Becki websocket connection
     */
    private becki_is_online_now(): void {
        if (this.serial) {
            this.emit(SerialServiceHandlerer.BECKI_SEND, new WsMessageTesterConnect('TK3G'));
        }
    }

    /**
     * From Garfield Listener about Becki websocket connection
     */
    private becki_is_offline_now(): void {
        // Probably nothing to do...
    }

    private usbCheck(): void {
        this.logger.debug('SerialServiceHandlerer::usbCheck:: - new USB device attached');

        // Its Requred to Synchronize Path
        if (this.hasTestKit() && !this.getTesterKitDevice().getPath()) {
            drivelist.list((error, drives) => {

                if (error) {
                    this.logger.error('SerialServiceHandlerer::usbCheck -', error);
                    throw error;
                }

                this.logger.info('SerialServiceHandlerer::usbCheck:: ready to check all drivers');
                this.logger.info('SerialServiceHandlerer::usbCheck:: List: ', drives);

                // List of Drivers for Selection
                let submenu: any[] = [];

                drives.forEach((drive) => {

                    if (drive.system) {
                        Logger.info('SerialServiceHandlerer::usbCheck:: Driver: ', drive.displayName, ' is system driver. Skip. ');
                        return; // System drives will be skipped
                    }

                    this.logger.info('SerialServiceHandlerer::usbCheck:: - rendering button for drive: ' + drive.displayName);

                    // Condition For MAC & Linux
                    if (drive.mountpoints[0].path.indexOf('BYZG3') !== -1) {
                        Logger.info('SerialServiceHandlerer::usbCheck:: - shortcuts activated devixe path:: ', drive.mountpoints[0].path);
                        this.getTesterKitDevice().setPath(drive.mountpoints[0].path);
                    }

                    // Condition For WINDOWS


                });

            });
        }
    }



    private buttonClicked: boolean;
    private serial: Serial;                 // Actual Connected and working serial component!
    private testerKitDevice: TesterKitDevice;                 // Actual Connected and working Device (depend on serial component)!
    private logger: LoggerClass;

}

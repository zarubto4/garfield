import * as fs from 'fs';
import { Tester } from './Tester';
import * as Promise from 'promise';
import { EventEmitter } from 'events';
import {Logger, LoggerClass, LoggerManager} from 'logger';
import { Configurator } from './Configurator';
import { Serial } from '../communication/serial_comp/Serial';
import * as path from 'path';
import { Garfield } from '../Garfield';
import { SerialMessage } from '../communication/serial_comp/SerialMessage';
import {SerialServiceHandlerer} from '../communication/serial_comp/SerialServiceHandlerer';
import {
    Request, WsMessageDeviceBinary, WsMessageDeviceConfigure, WsMessageDeviceConnect, WsMessageDeviceTest,
    WsMessageTesterDisconnect
} from '../communication/Becki';
import * as rp from 'request-promise';

export class TesterKitDevice extends EventEmitter {

    public static readonly DISCONNECTED = 'disconnected';
    public static readonly TERMINAL = 'terminal';

    public ioda_connected: boolean;

    constructor(serial: SerialServiceHandlerer) {
        super();
        this.serial = serial;

        // Set Logger
        if (!this.logger) {
            this.logger = LoggerManager.get('tester_kit');
            if (!this.logger) {
                this.logger = Logger;
            }
        }
    }

    public send(message: SerialMessage): Promise<string> {
        return this.serial.getSerial().send(message);
    }

    public sendPlain(message: string): void {
        this.serial.getSerial().sendPlain(message);
    }

    public disconnect(): void {
       // TODO
    }



    /**
     * Route method which retrieves full_id from the device.
     * @param {string[]} path
     * @param {Request} request
     * @returns {boolean}
     */
    public getDeviceId = (path: string[], request: Request): boolean => {
        this.send(new SerialMessage('ATE', 'ioda_bootloader'))
            .then((bootloader: string) => {
                if (bootloader === 'ok') {
                    this.logger.debug('Garfield::getDeviceId - opened bootloader, asking for full_id');
                    return this.send(new SerialMessage('DUT', 'fullid'));
                } else {
                    throw new Error('Cannot switch to bootloader. got response: ' + bootloader);
                }
            })
            .then((full_id: string) => {
                this.logger.info('Garfield::getDeviceId - retrieved full_id: ' + full_id);
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

    public checkIoda() {

        this.logger.info('TesterKitDevice::checkIoda:: - checking connected Ioda');

        this.ioda_connected = true;
        this.send(new SerialMessage('ATE', 'ioda_bootloader'))
            .then((response: string) => {
                if (response === 'ok') {
                    this.logger.debug('Garfield::checkIoda - retrieving full_id');
                    this.send(new SerialMessage('DUT', 'fullid', null, 2000))
                        .then((full_id: string) => {

                            this.logger.trace('Garfield::checkIoda - received full_id:', full_id);
                            this.emit(Garfield.BECKI_SEND, new WsMessageDeviceConnect(full_id)); // Connected device has at least bootloader

                        }).catch((err) => {

                            this.logger.trace('Garfield::checkIoda - not responding, probably dead device');
                            this.emit(Garfield.BECKI_SEND, new WsMessageDeviceConnect(null)); // Connected device is dead, probably brand new

                        });
                }
                // this.setDevicetDetection();
            })
            .catch((error) => {
                // TODO tester not responding
            });
    }

    /**
     * Route method which configures the device based on the given configuration.
     * @param {string[]} path
     * @param {Request} request
     * @returns {boolean}
     */
    public configureDevice = (path: string[], request: Request): boolean => {
        let msg: WsMessageDeviceConfigure = <WsMessageDeviceConfigure> request.data;
        this.configure(msg.configuration, (err) => {
            if (err) {
                this.logger.error('Garfield::configureDevice - ', err);
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
    public testDevice = (path: string[], request: Request): boolean => {
        let msg: WsMessageDeviceTest = <WsMessageDeviceTest> request.data;
        this.send(new SerialMessage('ATE', 'ioda_restart'))
            .then((restart) => {
                if (restart === 'ok') {
                    this.test(msg.test_config, (errors?: string[]) => {
                        if (errors) {
                            this.logger.error(errors);
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

    public backupDevice = (path: string[], request: Request): boolean => {
        this.send(new SerialMessage('DUT', 'firmware', 'backup', 30000))
            .then((backup: string) => {
                if (backup === 'ok') {
                    return this.send(new SerialMessage('ATE', 'ioda_restart'));
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

    public uploadBinary = (path: string[], request: Request): boolean => {
        let msg: WsMessageDeviceBinary = <WsMessageDeviceBinary> request.data;
        this.logger.info('Garfield::uploadBinary - retrieving binary from blob server, url:', msg.url);

        // Get bin file from the given url
        rp({
            method: 'GET',
            uri: msg.url,
            encoding: null
        }).then((body) => {
            if (msg.type === 'bootloader') {
                this.logger.debug('Garfield::uploadBinary - uploading bootloader');
                this.writeBootloader(body, (err) => {
                    if (err) {
                        this.logger.error('Garfield::uploadBinary - ' + err.toString());
                        request.reply({
                            status: 'error',
                            error: err.toString()
                        });
                    } else {
                        this.logger.trace('Garfield::uploadBinary - bootloader upload finished');
                        this.send(new SerialMessage('ATE', 'ioda_bootloader', null, 7500, 2, 10000))
                            .then((boot_res: string) => {
                                if (boot_res === 'ok') {
                                    return this.send(new SerialMessage('DUT', 'ping', null, 2000));
                                } else {
                                    throw new Error('Cannot switch to bootloader, got response: ' + boot_res);
                                }
                            })
                            .then((ping_res: string) => {
                                if (ping_res === 'ok') {
                                    return this.send(new SerialMessage('DUT', 'defaults'));
                                } else {
                                    throw new Error('Bootloader ping failed, got response: ' + ping_res);
                                }
                            })
                            .then((def_res: string) => {
                                if (def_res === 'ok') {
                                    return this.send(new SerialMessage('DUT', 'configured', '1'));
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
                this.logger.debug('Garfield::uploadBinary - uploading firmware');
                this.writeFirmware(body, (err) => {
                    if (err) {
                        this.logger.error('Garfield::uploadBinary' + err.toString());
                        request.reply({
                            status: 'error',
                            error: err.toString()
                        });
                    } else {
                        this.logger.trace('Garfield::uploadBinary - uploading firmware finished');
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

    public attachTerminal(terminal: (message: string) => void) {
        this.serial.on(Serial.MESSAGE, terminal);
    };

    public detachTerminal() {
        this.serial.removeAllListeners(Serial.MESSAGE);
    };

    public setFaultState(): void {
        this.faultState = true;
        this.serial.getSerial().blinkError();
    }

    public resetFaultState(): void {
        this.faultState = false;
        this.serial.getSerial().resetLeds();
    }

    public setPath(path: string) {
        this.path = path;
    }
    public getPath(): string {
        return this.path;
    }

    /**
     * Creates instance of Configurator and uploads configurations to device.
     * @param config json with configurations
     * @param {(error?) => void} callback when operation is finished
     */
    public configure(config: any, callback: (error?) => void): void {
        let cb = this.occupy(callback);
        if (cb) {
            this.serial.getSerial().send(new SerialMessage('ATE', 'ioda_bootloader', null, 5000, 2, 5000))
                .then((response) => {
                    if (response === 'ok') {
                        setTimeout(() => {
                            let configurator: Configurator = new Configurator(config, this.serial.getSerial(), LoggerManager.get('config'));
                            configurator.beginConfiguration(cb);
                        }, 2000);
                    } else {
                        cb('failed to start bootloader');
                    }
                })
                .catch((err) => {
                    cb('unable to start bootloader');
                });
        }
    }

    /**
     * Creates instance of Tester and performs tests based on test_config.
     * @param test_config json to compare results with
     * @param {(errors?: string[]) => void} callback when operation is finished
     */
    public test(test_config: any, callback: (errors?: string[]) => void): void {
        let cb = this.occupy(callback);
        if (cb) {
            let tester: Tester = new Tester(this.serial.getSerial(), LoggerManager.get('test'));
            tester.beginTest(test_config, cb);
        }
    }

    /**
     * Writes file BOOTLOAD.txt to signal that the binary will be boot loader, then upload binary.
     * @param {Buffer} bootloader binary
     * @param {(err) => void} callback when operation is finished
     */
    public writeBootloader(bootloader: Buffer, callback: (err) => void) {
        let cb = this.occupy(callback);
        if (cb) {
            this.writeData('BOOTLOAD.TXT', Buffer.from(''), (err) => {
                if (err) {
                    cb(err);
                } else {
                    this.writeData('main.bin', bootloader, cb);
                }
            });
        }
    }

    /**
     * Writes firmware
     * @param {Buffer} firmware binary
     * @param {(err) => void} callback when operation is finished
     */
    public writeFirmware(firmware: Buffer, callback: (err) => void) {
        let cb = this.occupy(callback);
        if (cb) {
            this.writeData('main.bin', firmware, callback);
        }
    }

    /**
     * Writes data to the path of device.
     * @param {string} filename string name of the file
     * @param {Buffer} data binary
     * @param {(err) => void} callback when operation is finished
     */
    private writeData(filename: string, data: Buffer, callback: (err) => void) {
        this.logger.trace('Device::writeData - writing file:', filename);
        fs.writeFile(this.path + '/' + filename, data, callback);
    }

    /**
     * Method will set flag signaling that the device is occupied (some process is in progress)
     * and returns callback which will then release the device and if some error is passed,
     * it will set the fault state (red led blinking).
     * If the device is already occupied, method will not return any callback.
     * @param {(error?) => void} callback to be called when operation is complete
     * @returns {(error?) => void} callback to release the device and return result
     */
    private occupy(callback: (error?) => void): (error?) => void {
        if (this.occupied) {
            callback('device is occupied');
            return null;
        } else {
            if (this.faultState) {
                this.resetFaultState();
            }
            return (error?) => {
                this.occupied = false;
                if (error) {
                    this.setFaultState();
                }
                callback(error);
            };
        }
    }

    private logger: LoggerClass;
    private path: string;
    private serial: SerialServiceHandlerer;
    private occupied: boolean = false;
    private faultState: boolean = false;
}

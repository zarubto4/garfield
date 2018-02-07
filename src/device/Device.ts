import * as fs from 'fs';
import { Tester } from './Tester';
import * as Promise from 'promise';
import { EventEmitter } from 'events';
import { Logger, LoggerManager } from 'logger';
import { Configurator } from './Configurator';
import { Serial, SerialMessage } from '../communication/Serial';

export class Device extends EventEmitter {

    public static readonly DISCONNECTED = 'disconnected';
    public static readonly TERMINAL = 'terminal';

    public name: string;
    public ioda_connected: boolean;

    constructor(name: string, path: string, serial: Serial) {
        super();
        this.name = name;
        this.path = path;
        this.serial = serial;
        this.serial.on(Serial.CLOSED, this.onSerialClosed);
    }

    public getPath(): string {
        return this.path;
    }

    public send(message: SerialMessage): Promise<string> {
        return this.serial.send(message);
    }

    public sendPlain(message: string): void {
        this.serial.sendPlain(message);
    }

    public disconnect(): void {
        if (this.serial) {
            this.serial.close();
        }
    }

    public attachTerminal(terminal: (message: string) => void) {
        this.serial.on(Serial.MESSAGE, terminal);
    };

    public detachTerminal() {
        this.serial.removeAllListeners(Serial.MESSAGE);
    };

    public hasSerialConenction(): boolean {
        return this.serial && this.serial.isOpened();
    }

    public hasUsbConenction(): boolean {
        return !!this.path;
    }

    public hasIoda(): boolean {
        return this.ioda_connected;
    }

    public setFaultState(): void {
        this.faultState = true;
        this.serial.blinkError();
    }

    public resetFaultState(): void {
        this.faultState = false;
        this.serial.resetLeds();
    }

    /**
     * Creates instance of Configurator and uploads configurations to device.
     * @param config json with configurations
     * @param {(error?) => void} callback when operation is finished
     */
    public configure(config: any, callback: (error?) => void): void {
        let cb = this.occupy(callback);
        if (cb) {
            this.serial.send(new SerialMessage('ATE', 'ioda_bootloader', null, 5000, 2, 5000))
                .then((response) => {
                    if (response === 'ok') {
                        setTimeout(() => {
                            let configurator: Configurator = new Configurator(config, this.serial, LoggerManager.get('config'));
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
            let tester: Tester = new Tester(this.serial, LoggerManager.get('test'));
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
        Logger.trace('Device::writeData - writing file:', filename);
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

    private onSerialClosed = () => {
        this.serial = null;
        this.emit(Device.DISCONNECTED);
    }

    private serial: Serial;
    private path: string;
    private occupied: boolean = false;
    private faultState: boolean = false;
}

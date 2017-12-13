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

    public dettachTerminal() {
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

    public configure(config: any, callback: (error?) => void): void {
        let cb = this.occupy(callback);
        if (cb) {
            this.serial.send(new SerialMessage('TK3G', 'ioda_bootloader', null, 5000, 2, 5000))
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

    public test(test_config: any, callback: (errors?: string[]) => void): void {
        let cb = this.occupy(callback);
        if (cb) {
            let tester: Tester = new Tester(this.serial, LoggerManager.get('test'));
            tester.beginTest(test_config, cb);
        }
    }

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

    public writeFirmware(firmware: Buffer, callback: (err) => void) {
        let cb = this.occupy(callback);
        if (cb) {
            this.writeData('main.bin', firmware, callback);
        }
    }

    private writeData(filename: string, data: Buffer, callback: (err) => void) {
        Logger.trace('Device::writeData - writing file:', filename);
        fs.writeFile(this.path + '/' + filename, data, callback);
    }

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

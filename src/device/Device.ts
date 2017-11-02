import { Serial } from '../communication/Serial';
import * as fs from 'fs';
import { Logger } from 'logger';
import { Configurator } from './Configurator';
import { Tester } from './Tester';
import * as Promise from 'promise';

export class Device {

    public name: string;
    public ioda_connected: boolean;

    constructor(name: string, path: string, serial: Serial) {
        this.name = name;
        this.path = path;
        this.serial = serial;
    }

    public getPath(): string {
        return this.path;
    }

    public message(message: string): Promise<string> {
        Logger.info('Sendig message \'' + message + '\' with response');
        return new Promise((resolve, reject) => {
            this.serial.sendWithResponse(message, (res: string, err: string) => {
                if (err) {
                    reject(err);
                } else if (res) {
                    Logger.info('Message resolved with: ' + res);
                    resolve(res);
                }
            });
        });
    }

    public disconnect(callback): void {
        this.serial.disconnect(callback);
    }

    public hasSerialConenction(): boolean {
        return this.serial && this.serial.isOpen();
    }

    public hasUsbConenction(): boolean {
        return this.path ? true : false;
    }

    public hasIoda(): boolean {
        return this.ioda_connected;
    }

    public configure(config: any, callback: (err?) => void): void {
        this.message('TK3G:ioda_bootloader').then((response) => {
            if (response === 'ok') {
                let configurator: Configurator = new Configurator(config, this.serial);
                configurator.beginConfiguration(callback);
            }
        }).catch((err) => {
            callback('Unable to switch IODA to bootloader');
        });
    }

    public test(test_config: any, callback: (errors?: string[]) => void): void {
        let tester: Tester = new Tester(this.serial);
        tester.beginTest(test_config, callback);
    }

    public writeBootloader(bootloader: Buffer, callback: (err) => void) {
        this.writeDataToFlash('BOOTLOAD.TXT', Buffer.from(''), (err) => {
            if (err) {
                callback(err);
            } else {
                this.writeDataToFlash('main.bin', bootloader, callback);
            }
        });
    }

    public writeFirmware(firmware: Buffer, callback: (err) => void) {
        this.writeDataToFlash('main.bin', firmware, callback);
    }

    private writeDataToFlash(filename: string, data: Buffer, callback: (err) => void) {
        fs.writeFile(this.path + '/' + filename, data, callback);
    }


    private serial: Serial;
    private path: string;
}

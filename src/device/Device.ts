import { Serial } from '../communication/serial/SerialHandler';
import * as fs from 'fs';
import { Logger } from 'logger';
import { Configurator } from './Configurator';
import { Tester } from './Tester';

export class Device {

    public name: string;

    constructor(name: string, path: string, serial: Serial) {
        this.name = name;
        this.path = path;
        this.serial = serial;
    }

    public getPath(): string {
        return this.path;
    }

    public hasSerialConenction(): boolean {
        return this.serial && this.serial.isOpen();
    }

    public hasUsbConenction(): boolean {
        return this.path ? true : false;
    }

    public configure(callback: (err?) => void): void {
        let configurator: Configurator = new Configurator(this.serial);
        configurator.beginConfiguration(callback);
    }

    public test(callback: (err) => void): void {
        let tester: Tester = new Tester(this.serial);
        tester.beginTest(callback);
    }

    public writeBootloader(bootloader: string, callback: (err) => void) {
        this.writeDataToFlash('BOOTLOAD.TXT', '', (err) => {
            if (err) {
                callback(err);
            } else {
                this.writeDataToFlash('main.bin', bootloader, callback);
            }
        });
    }

    public writeFirmware(firmware: string, callback: (err) => void) {
        this.writeDataToFlash('main.bin', firmware, callback);
    }

    private writeDataToFlash(filename: string, data: string, callback: (err) => void) {
        fs.writeFile(this.path + '/' + filename, data, callback);
    }


    private serial: Serial;
    private path: string;
}

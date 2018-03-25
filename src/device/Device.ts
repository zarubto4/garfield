import { Serial, SerialMessage } from '../communication/Serial';
import * as fs from 'fs';
import { Logger } from 'logger';
import { Configurator } from './Configurator';
import { Tester } from './Tester';
import * as Promise from 'promise';
import * as path from 'path';

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

    public send(message: SerialMessage): Promise<string> {
        return this.serial.send(message);
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
        setTimeout(() => {
            this.serial.send(new SerialMessage('TK3G', 'ioda_bootloader')).then((response) => {
                if (response === 'ok') {
                    setTimeout(() => {
                        let configurator: Configurator = new Configurator(config, this.serial);
                        configurator.beginConfiguration(callback);
                    }, 5000);
                } else {
                    callback('Unable to switch IODA to bootloader');
                }
            }).catch((err) => {
                callback('Unable to switch IODA to bootloader');
            });
        }, 5000);
    }

    public test(test_config: any, callback: (errors?: string[]) => void): void {
        let tester: Tester = new Tester(this.serial);
        tester.beginTest(test_config, callback);
    }

    public writeBootloader(bootloader: Buffer, callback: (err) => void) {
        Logger.info('Device::writeBootloader');
        this.writeDataToFlash('BOOTLOAD.TXT', Buffer.from(''), (err) => {
            if (err) {
                Logger.error('Device::writeBootloader::ERROR:: ', err.toString());
                callback(err);
            } else {
                Logger.info('Device::writeBootloader:: CallBack Done, Write Bootloader File main.bin');
                this.writeDataToFlash('main.bin', bootloader, callback);
            }
        });
    }

    public writeFirmware(firmware: Buffer, callback: (err) => void) {
        Logger.info('Device::writeFirmware');
        this.writeDataToFlash('main.bin', firmware, callback);
    }


    private writeDataToFlash(filename: string, data: Buffer, callback: (err) => void) {

        let dir: string = path.join(this.path, filename);
        Logger.info('Device::writeDataToFlash::Data Path:: ', dir);

        fs.writeFileSync(dir, data);
        callback(null);

        /*
        try {
            fs.writeFileSync(dir, data);
        }catch (excx) {
            Logger.error('Shit::  ', excx.toString());
            fs.writeFileSync(dir, data);
        }

        if (filename.indexOf('BOOTLOAD.TXT') !== -1) {
            setTimeout(function () {
                return callback(null);
            }, 1000);
        }

        if (filename.indexOf('main.bin') !== -1) {
            setTimeout(function () {
                return callback(null);
            }, 15000);
        }
        */

        // this.check(dir, callback);
    }

    private check(dir: string, callback: (err) => void) {

        let device: any = this;
        try {

            if (fs.existsSync(dir)) {
                Logger.warn('Cycle', this.cycles++, ' Existuje a nehodilo to chybu ', dir);

                let stats = fs.lstatSync(dir);

                if (stats.isFile) {
                    Logger.warn('Cycle', this.cycles++, 'Po uložení --------- Device::writeDataToFlash:: is file!!!!! A to přesně ', dir);
                    return callback(null);
                }else {
                    setTimeout(function () {
                        device.check(dir, callback);
                    }, 2500);
                }
            } else {
                Logger.warn('Cycle', this.cycles++, 'Neexistuje a nehodilo to chybu', dir);
                setTimeout(function () {
                    device.check(dir, callback);
                }, 2500);
            }
        }catch (err) {
            Logger.error('Cycle', this.cycles++, 'Pičovina:: nad kontrolou:: ', dir , 'ERROR:: ', err.toString());
            setTimeout( function() {
                device.check(dir, callback);
            } , 2500);
        }
    }

    private cycles: number = 0;
    private serial: Serial;
    private path: string;
}

import { resolve } from 'path';
import { Logger } from 'logger';
const usb = require('usb');


export class UsbHandler {

    devices: any[];
    current_device: any;
    constructor() {

    }

    refresh(): void {
        this.devices = usb.getDeviceList();
        Logger.info(this.devices);
        this.current_device = this.devices.find(device => device.deviceDescriptor.idProduct === '4660');
        // vendor '43981'
        // product: '4660'

        Logger.info(this.current_device);
        this.current_device.open();


        // let outEndpoint;
        let data = new Array(['This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content']);

        Logger.info('interfaces: ', this.current_device.interfaces);

        // this.current_device.interface(0).claim();

        if (!this.current_device) {
            Logger.info('nodevicefond');

            return;
        }
        let deviceInterface = this.current_device.interfaces[0];

        Logger.info('kernel attached: ', deviceInterface.isKernelDriverActive());
        let kernelWasAttached = false;
        if (deviceInterface.isKernelDriverActive()) {
            kernelWasAttached = true;
            deviceInterface.detachKernelDriver();
        }

        deviceInterface.claim();

        let transferEndpoint = deviceInterface.endpoint(1);


        Logger.info(transferEndpoint);

        Logger.info(data);
        let transfer = new Promise(() => {
            Logger.info(transferEndpoint.transferType);
            if (transferEndpoint) {
                transferEndpoint.transfer(data, (error) => {
                    if (error) {
                        Logger.info(error);
                    }
                    Logger.info('transfering');
                    resolve();
                });
            }
        }).then(() => {

            deviceInterface.release([transferEndpoint], error => {
                if (error) {
                    Logger.info('USB error: ', error);
                }
                if (kernelWasAttached) {
                    deviceInterface.attachKernelDriver();
                    Logger.info('attached');
                }

                this.current_device.close();
                Logger.info(' transfer end');
            });
        });
        // outEndpoint.transfer(data,error => Logger.info('USB error: ',error));
    }
}

import { resolve } from 'path';
const usb = require('usb')


export class usbHander {

    devices: any[];
    current_device: any;
    constructor() {

    }


    refresh(): void {
        this.devices = usb.getDeviceList();
        console.log(this.devices);
        this.current_device = this.devices.find(device => device.deviceDescriptor.idProduct == "4660");
        // vendor "43981"
        // product: "4660"

        console.log(this.current_device);
        this.current_device.open();


        // let outEndpoint;
        let data = new Array(["This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content This is my blob content"]);

     


        console.log("interfaces: ", this.current_device.interfaces);

        // this.current_device.interface(0).claim();

        if (!this.current_device) {
            console.log("nodevicefond");

            return;
        }
        let deviceInterface = this.current_device.interfaces[0]

        console.log("kernel attached: ", deviceInterface.isKernelDriverActive());
        let kernelWasAttached = false
        if (deviceInterface.isKernelDriverActive()) {
            kernelWasAttached = true;
            deviceInterface.detachKernelDriver();
        }

        deviceInterface.claim();

        let transferEndpoint = deviceInterface.endpoint(1);


        console.log(transferEndpoint);

console.log(data);
        let transfer = new Promise(() => {
            console.log(transferEndpoint.transferType);
            if(transferEndpoint)
            transferEndpoint.transfer(data, (error) => {
                if (error) {
                    console.log(error);
                }
                console.log("transfering");
                resolve();
            })
        }).then(() => {

            deviceInterface.release([transferEndpoint], error => {
                if (error) {
                    console.log("USB error: ", error);
                }
                if (kernelWasAttached) {
                    deviceInterface.attachKernelDriver();
                    console.log('attached');
                }

                this.current_device.close();
                console.log(" transfer end")


            });
        })

        // outEndpoint.transfer(data,error => console.log("USB error: ",error));


    }
}
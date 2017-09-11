import { Serial } from '../communication/serial/SerialHandler';
import { Logger } from 'logger';

enum TestStep {
    PinsHigh,
    MeasureHigh,
    PinsLow,
    MeasureLow,
    MeasurePower,
    Finish
}

export class TestResult {
    public powerMeasurements: PowerMeasurement[] = [];
    public pinMeasurements: PinMeasurement[] = [];
    public errors: string[] = [];
}

export enum PowerSource {
    ActivePoe,
    PasivePoe,
    External,
    Usb
}

export enum PinMeasurementType {
    Up,
    Down
}

export class PowerMeasurement {

    public type: PowerSource;
    public vbus: number;
    public v3: number;
    public current: number;

    constructor(type: PowerSource) {
        this.type = type;
    }
}

export class PinMeasurement {

    public type: PinMeasurementType;
    public x: string[];
    public y: string[];
    public z: string[];

    constructor(type: PinMeasurementType) {
        this.type = type;
    }
}

export class Tester {

    public result: TestResult;

    constructor(serial: Serial) {
        this.serial = serial;
    }

    public beginTest(callback: (err?) => void) {
        this.result = new TestResult();
        this.currentStep = TestStep.PinsHigh;
        this.currentTestTry = 3;
        this.testMessageHandler = this.onTestMessage.bind(this);

        this.serial.on('message', this.testMessageHandler);

        this.test();
    }

    private test(): void {

        switch (this.currentStep) {
            case TestStep.PinsHigh: {
                this.setTimeout(5000);
                this.serial.send("YODA:pins_up");
                break;
            }
            case TestStep.MeasureHigh: {
                this.setTimeout(60000);
                this.serial.send("TK3G:meas_pins");
                break;
            }
            case TestStep.PinsLow: {
                this.setTimeout(5000);
                this.serial.send("YODA:pins_down");
                break;
            }
            case TestStep.MeasureLow: {
                this.setTimeout(60000);
                this.serial.send("TK3G:meas_pins");
                break;
            }
            case TestStep.MeasurePower: {
                this.setTimeout(60000);
                this.serial.send("TK3G:meas_pwr");
                break;
            }
            case TestStep.Finish: {
                this.endTest();
                break;
            }
            default:
                // code...
                break;
        }
    }

    private parsePowerMeasurement(measurement: string) {
        measurement = measurement.replace('TK3G:meas_pwr=', ''); // Removing the prefix of the result

        if (measurement.match(/;$/)) {
            measurement = measurement.substring(0, measurement.lastIndexOf(';')); // Striping off last semicolon
        }

        let results: string[] = measurement.split(';'); // Creating an array with semicolon as delimiter

        this.result.powerMeasurements = [new PowerMeasurement(PowerSource.ActivePoe), new PowerMeasurement(PowerSource.PasivePoe), new PowerMeasurement(PowerSource.External), new PowerMeasurement(PowerSource.Usb)];
        this.result.powerMeasurements.forEach((meas) => {
            meas.vbus = parseFloat(results.shift());
            meas.v3 = parseFloat(results.shift());
            meas.current = parseFloat(results.shift());
        });
    }

    private parsePinMeasurement(type: PinMeasurementType, measurement: string) {
        let pinMeasurement = new PinMeasurement(type);
        measurement = measurement.replace('TK3G:meas_pins=', ''); // Removing the prefix of the result

        let results: string[] = measurement.split(';');

        results.forEach((meas) => {

            let pins: string[];

            let value = meas.substring(meas.lastIndexOf(':') + 1);

            for (let i = 0; i < value.length; i++) {
                pins[i] = value.charAt(i);
            }

            if (meas.startsWith('X:')) {
                pinMeasurement.x = pins;
            }

            if (meas.startsWith('Y:')) {
                pinMeasurement.y = pins;
            }

            if (meas.startsWith('Z:')) {
                pinMeasurement.z = pins;
            }
        });

        this.result.pinMeasurements.push(pinMeasurement);
    }

    private endTest() {
        this.serial.removeListener('message', this.testMessageHandler);
    }

    private setTimeout(timeout: number) {
        this.testTimeout = setTimeout(() => {
            if (this.currentTestTry == 0) {

                this.result.errors.push('Test \'' + this.currentStep + '\' failed: no response from TestKit');

                switch (this.currentStep) { // Jump to next test
                    case TestStep.PinsHigh: {
                        this.currentStep = TestStep.MeasureHigh;
                        break;
                    }
                    case TestStep.MeasureHigh: {
                        this.currentStep = TestStep.PinsLow;
                        break;
                    }
                    case TestStep.PinsLow: {
                        this.currentStep = TestStep.MeasureLow;
                        break;
                    }
                    case TestStep.MeasureLow: {
                        this.currentStep = TestStep.MeasurePower;
                        break;
                    }
                    case TestStep.MeasurePower: {
                        this.currentStep = TestStep.Finish;
                        break;
                    }
                    default:
                        // code...
                        break;
                }
            } else {
                this.currentTestTry--;
            }
            this.test();
        }, timeout);
    }

    private onTestMessage(message: string) {
        
        clearTimeout(this.testTimeout);

        Logger.info('Tester got response on test = ' + message);

        let from: string = Serial.getMessageSender(message);
        let type: string = Serial.getMessageType(message);
        let value: string = Serial.getMessageValue(message);

        message = message.substring(message.indexOf(':') + 1); // Remove prefix

        Logger.info('Current step = ' + this.currentStep);

        switch(this.currentStep) {
            case TestStep.PinsHigh: {
                if (from === 'YODA' && message === 'ok') {
                    this.currentStep = TestStep.MeasureHigh;
                    this.currentTestTry = 3;
                }
                break;
            }
            case TestStep.MeasureHigh: {
                if (from === 'TK3G' && type === 'meas_pins') {
                    this.currentStep = TestStep.PinsLow;
                    this.parsePinMeasurement(PinMeasurementType.Up, value);
                    this.currentTestTry = 3;
                }
                break;
            }
            case TestStep.PinsLow: {
                if (from === 'YODA' && type === 'ok') {
                    this.currentStep = TestStep.MeasureLow;
                    this.currentTestTry = 3;
                }
                break;
            }
            case TestStep.MeasureLow: {
                if (from === 'TK3G' && type === 'meas_pins') {
                    this.currentStep = TestStep.MeasurePower;
                    this.parsePinMeasurement(PinMeasurementType.Down, value);
                    this.currentTestTry = 3;
                }
                break;
            }
            case TestStep.MeasurePower: {
                if (from === 'TK3G' && type === 'meas_pwr') {
                    this.currentStep = TestStep.Finish;
                    this.parsePowerMeasurement(value);
                    this.currentTestTry = 3;
                }
                break;
            }
        }
        this.test();
    }

    private serial: Serial;
    private testTimeout: any;
    private currentStep: TestStep;
    private currentTestTry: number;
    private testMessageHandler: (message: string) => void;
    private testCallback: (error?: string) => void;
}

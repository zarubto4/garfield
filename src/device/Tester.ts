import { Serial } from '../communication/Serial';
import { Parsers } from '../utils/Parsers';
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
    public x: ('1' | '0')[] = [];
    public y: ('1' | '0')[] = [];
    public z: ('1' | '0')[] = [];

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
        this.testCallback = callback;
        this.testMessageHandler = this.onTestMessage.bind(this);

        this.serial.on('message', this.testMessageHandler);

        this.test();
    }

    private test(): void {

        Logger.info('Beggining test: ' + this.currentStep);

        switch (this.currentStep) {
            case TestStep.PinsHigh: {
                this.setTimeout(5000);
                this.serial.send('YODA:pins_up');
                break;
            }
            case TestStep.MeasureHigh: {
                this.setTimeout(5000);
                this.serial.send('TK3G:meas_pins');
                break;
            }
            case TestStep.PinsLow: {
                this.setTimeout(5000);
                this.serial.send('YODA:pins_down');
                break;
            }
            case TestStep.MeasureLow: {
                this.setTimeout(5000);
                this.serial.send('TK3G:meas_pins');
                break;
            }
            case TestStep.MeasurePower: {
                this.setTimeout(5000);
                this.serial.send('TK3G:meas_pwr');
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

    private endTest() {
        this.serial.removeListener('message', this.testMessageHandler);
        this.evalTest();
        if (this.result.errors.length > 0) {
            let err: string = '';
            for (let e of this.result.errors) {
                err += e + '; ';
            }
            this.testCallback(err);
        } else {
            this.testCallback();
        }
    }

    private setTimeout(timeout: number) {
        this.testTimeout = setTimeout(() => {
            if (this.currentTestTry === 0) {

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

        switch (this.currentStep) {
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
                    this.result.pinMeasurements.push(Parsers.parsePinMeasurement(PinMeasurementType.Up, value));
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
                    this.result.pinMeasurements.push(Parsers.parsePinMeasurement(PinMeasurementType.Down, value));
                    this.currentTestTry = 3;
                }
                break;
            }
            case TestStep.MeasurePower: {
                if (from === 'TK3G' && type === 'meas_pwr') {
                    this.currentStep = TestStep.Finish;
                    this.result.powerMeasurements = Parsers.parsePowerMeasurement(value);
                    this.currentTestTry = 3;
                }
                break;
            }
        }
        this.test();
    }

    private evalTest(): void {

        let pinsUp: PinMeasurement = this.result.pinMeasurements.find((el: PinMeasurement) => {
            return el.type === PinMeasurementType.Up;
        });

        // TODO better evaluator

        if (pinsUp) {
            this.testConfig.pins.up.x.forEach((pin: ('0'|'1'), index: number) => {
                if (!pinsUp.x[index]) {
                    this.result.errors.push('Pin \'X' + index + '\'' + 'is undefined, perhaps missing from measurement. (index starts from zero)');
                }
                if (pin !== pinsUp.x[index]) {
                    this.result.errors.push('Pin \'X' + index + '\'' + 'is low, when it should be high. (index starts from zero)');
                }
            });
            this.testConfig.pins.up.y.forEach((pin: ('0'|'1'), index: number) => {
                if (!pinsUp.y[index]) {
                    this.result.errors.push('Pin \'Y' + index + '\'' + 'is undefined, perhaps missing from measurement. (index starts from zero)');
                }
                if (pin !== pinsUp.y[index]) {
                    this.result.errors.push('Pin \'Y' + index + '\'' + 'is low, when it should be high. (index starts from zero)');
                }
            });
            this.testConfig.pins.up.z.forEach((pin: ('0'|'1'), index: number) => {
                if (!pinsUp.z[index]) {
                    this.result.errors.push('Pin \'Z' + index + '\'' + 'is undefined, perhaps missing from measurement. (index starts from zero)');
                }
                if (pin !== pinsUp.z[index]) {
                    this.result.errors.push('Pin \'Z' + index + '\'' + 'is low, when it should be high. (index starts from zero)');
                }
            });

        } else {
            this.result.errors.push('Missing \'PinsUp\' measurement.');
        }

        let pinsDown: PinMeasurement = this.result.pinMeasurements.find((el: PinMeasurement) => {
            return el.type === PinMeasurementType.Down;
        });

        if (pinsDown) {
            this.testConfig.pins.down.x.forEach((pin: ('0'|'1'), index: number) => {
                if (!pinsDown.x[index]) {
                    this.result.errors.push('Pin \'X' + index + '\'' + 'is undefined, perhaps missing from measurement. (index starts from zero)');
                }
                if (pin !== pinsDown.x[index]) {
                    this.result.errors.push('Pin \'X' + index + '\'' + 'is high, when it should be low. (index starts from zero)');
                }
            });
            this.testConfig.pins.down.y.forEach((pin: ('0'|'1'), index: number) => {
                if (!pinsDown.y[index]) {
                    this.result.errors.push('Pin \'Y' + index + '\'' + 'is undefined, perhaps missing from measurement. (index starts from zero)');
                }
                if (pin !== pinsDown.y[index]) {
                    this.result.errors.push('Pin \'Y' + index + '\'' + 'is high, when it should be low. (index starts from zero)');
                }
            });
            this.testConfig.pins.down.z.forEach((pin: ('0'|'1'), index: number) => {
                if (!pinsDown.z[index]) {
                    this.result.errors.push('Pin \'Z' + index + '\'' + 'is undefined, perhaps missing from measurement. (index starts from zero)');
                }
                if (pin !== pinsDown.z[index]) {
                    this.result.errors.push('Pin \'Z' + index + '\'' + 'is high, when it should be low. (index starts from zero)');
                }
            });
        } else {
            this.result.errors.push('Missing \'PinsDown\' measurement.');
        }
    }

    private serial: Serial;
    private testTimeout: any;
    private currentStep: TestStep;
    private currentTestTry: number;
    private testMessageHandler: (message: string) => void;
    private testCallback: (error?: string) => void;
    private testConfig: any = {
        pins: {
            up: {
                x: ['1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1'],
                y: ['1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1'],
                z: ['1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1']
            },
            down: {
                x: ['0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0'],
                y: ['0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0'],
                z: ['0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0']
            }
        },
        power: {
            poe_act: {
                vbus: {
                    min: 5,
                    max: 6
                },
                v3: {
                    min: 5,
                    max: 6
                },
                curr: {
                    min: 5,
                    max: 6
                }
            },
            poe_pas: {
                vbus: {
                    min: 5,
                    max: 6
                },
                v3: {
                    min: 5,
                    max: 6
                },
                curr: {
                    min: 5,
                    max: 6
                }
            },
            ext_pwr: {
                vbus: {
                    min: 5,
                    max: 6
                },
                v3: {
                    min: 5,
                    max: 6
                },
                curr: {
                    min: 5,
                    max: 6
                }
            },
            usb_pwr: {
                vbus: {
                    min: 5,
                    max: 6
                },
                v3: {
                    min: 5,
                    max: 6
                },
                curr: {
                    min: 5,
                    max: 6
                }
            }
        }
    };
}

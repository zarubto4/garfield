import { Serial } from '../communication/Serial';
import { Parsers } from '../utils/Parsers';
import { Logger } from 'logger';

enum TestStep {
    PinsHigh = 'Pins Up',
    MeasureHigh = 'Measure Pins Up',
    PinsLow = 'Pins Down',
    MeasureLow = 'Measure Pins Down',
    MeasurePower = 'Measure Power',
    Finish = 'Finish'
}

export class TestResult {
    public powerMeasurements: PowerMeasurement[] = [];
    public pinMeasurements: PinMeasurement[] = [];
    public errors: string[] = [];
}

export enum PowerSource {
    ActivePoe = 'poe_act',
    PasivePoe = 'poe_pas',
    External = 'ext_pwr',
    Usb = 'usb_pwr'
}

export enum PinMeasurementType {
    Up = 'up',
    Down = 'down'
}

export class PowerMeasurement {

    public static powerTypes: ('vbus'|'v3'|'curr')[] = ['vbus', 'v3', 'curr'];

    public type: PowerSource;
    public vbus: number;
    public v3: number;
    public curr: number;

    constructor(type: PowerSource) {
        this.type = type;
    }
}

export class PinMeasurement {

    public static pinTypes: ('x'|'y'|'z')[] = ['x', 'y', 'z'];

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

    public beginTest(test_config: any, callback: (errors?: string[]) => void) {
        Logger.info('Beggining test with config: ' + JSON.stringify(test_config));
        this.result = new TestResult();
        this.testConfig = test_config;
        this.currentStep = TestStep.PinsHigh;
        this.currentTestTry = 3;
        this.testCallback = callback;
        this.testMessageHandler = this.onTestMessage.bind(this);

        this.serial.on('message', this.testMessageHandler);

        this.test();
    }

    private test(): void {

        if (this.currentTestTry <= 0) {
            this.addError('Test \'' + this.currentStep + '\' failed: no response');
            this.skipTest();
        }

        Logger.info('Beggining test: ' + this.currentStep);

        this.currentTestTry--;

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
            this.testCallback(this.result.errors);
        } else {
            this.testCallback();
        }
    }

    private setTimeout(timeout: number) {
        this.testTimeout = setTimeout(() => {
            Logger.warn('Test \'' + this.currentStep + '\' timeout - current try: ' + this.currentTestTry);
            if (this.currentTestTry <= 0) {
                this.addError('Test \'' + this.currentStep + '\' failed: no response');
                this.skipTest();
            }
            this.test();
        }, timeout);
    }

    private skipTest() {
        Logger.error('Test \'' + this.currentStep + '\' failed - skipping');
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
        }
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

        // Array of measurement types that should be present in the result
        let pinMeasTypes: PinMeasurementType[] = [PinMeasurementType.Up, PinMeasurementType.Down];
        let powerSources: PowerSource[] = [PowerSource.ActivePoe, PowerSource.PasivePoe, PowerSource.External, PowerSource.Usb];

        // Eval the measurement for each type
        pinMeasTypes.forEach((pinMeasType: PinMeasurementType) => {

            // Find the measurement in the result
            let pinMeas: PinMeasurement = this.result.pinMeasurements.find((el: PinMeasurement) => {
                return el.type === pinMeasType;
            });

            // Eval or add error
            if (pinMeas) {

                // Compares wanted values of pins with measured ones
                PinMeasurement.pinTypes.forEach((type) => {
                    this.testConfig.pins[pinMeas.type][type].forEach((pin: ('0'|'1'), index: number) => {
                        if (!pinMeas[type][index]) {
                            this.addError('Pin \'' + type + index + '\' is undefined, perhaps missing from the measurement. (index starts from zero)');
                        } else if (pinMeas[type][index] !== pin) {
                            this.addError('Pin \'' + type + index + '\' is ' + pinMeas[type][index] + ', when it should be ' + pin + '. (index starts from zero)');
                        }
                    });
                });
            } else {
                this.addError('Missing \'' + pinMeasType + '\' pin measurement.');
            }
        });

        // Eval the measurement for each power source
        powerSources.forEach((source: PowerSource) => {
            let powerMeas: PowerMeasurement = this.result.powerMeasurements.find((el: PowerMeasurement) => {
                return el.type === source;
            });

            // Eval or add error
            if (powerMeas) {

                // Compares wanted values of power sources with measured ones
                PowerMeasurement.powerTypes.forEach((type) => {
                    let wanted = this.testConfig.power[powerMeas.type][type];

                    if (!powerMeas[type]) {
                        this.addError('Value of \'' + type + '\' for source \'' + source + '\' is undefined');
                    } else {
                        if (powerMeas[type] < wanted.min) {
                            this.addError('Value of \'' + type + '\' for source \'' + source + '\' is ' + powerMeas[type] + ', minimal allowed value is ' + wanted.min);
                        }

                        if (powerMeas[type] > wanted.max) {
                            this.addError('Value of \'' + type + '\' for source \'' + source + '\' is ' + powerMeas[type] + ', maximal allowed value is ' + wanted.min);
                        }
                    }
                });
            } else {
                this.addError('Missing \'' + source + '\' power measurement.');
            }
        });
    }

    private addError(error: string): void {
        this.result.errors.push(error);
    }

    private serial: Serial;
    private testTimeout: any;
    private currentStep: TestStep;
    private currentTestTry: number;
    private testMessageHandler: (message: string) => void;
    private testCallback: (error?: string[]) => void;
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
                    max: 200
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

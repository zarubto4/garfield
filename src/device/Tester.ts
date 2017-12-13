import { Serial, SerialMessage } from '../communication/Serial';
import { Parsers } from '../utils/Parsers';
import { Queue } from '../utils/Queue';
import { LoggerClass } from 'logger';

enum TestType {
    PinsHigh = 'Pins Up',
    MeasureHigh = 'Measure Pins Up',
    PinsLow = 'Pins Down',
    MeasureLow = 'Measure Pins Down',
    MeasurePower = 'Measure Power'
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

class Test {
    constructor(type: TestType) {
        this.type = type;
        switch (type) {
            case TestType.PinsHigh: {
                this.message = new SerialMessage('IODA', 'pins_up', null , 5000);
                break;
            }
            case TestType.MeasureHigh: {
                this.message = new SerialMessage('TK3G', 'meas_pins', null , 5000);
                break;
            }
            case TestType.PinsLow: {
                this.message = new SerialMessage('IODA', 'pins_down', null , 5000);
                break;
            }
            case TestType.MeasureLow: {
                this.message = new SerialMessage('TK3G', 'meas_pins', null , 5000);
                break;
            }
            case TestType.MeasurePower: {
                this.message = new SerialMessage('TK3G', 'meas_pwr', null , 20000);
                break;
            }
        }
    }

    public getMessage(): SerialMessage {
        return this.message;
    }

    public getType(): TestType {
        return this.type;
    }

    private type: TestType;
    private message: SerialMessage;
}

export class Tester {

    public result: TestResult;

    constructor(serial: Serial, logger: LoggerClass) {
        this.serial = serial;
        this.logger = logger;
    }

    public beginTest(testConfig: any, callback: (errors?: string[]) => void) {
        this.logger.info('Tester::beginTest - config: ' + JSON.stringify(testConfig));

        this.queue = new Queue<Test>();

        this.queue.push(new Test(TestType.PinsHigh));
        this.queue.push(new Test(TestType.MeasureHigh));
        this.queue.push(new Test(TestType.PinsLow));
        this.queue.push(new Test(TestType.MeasureLow));
        this.queue.push(new Test(TestType.MeasurePower));

        this.result = new TestResult();
        this.testConfig = testConfig;
        this.testCallback = callback;

        this.test();
    }

    private test() {
        let test: Test = this.queue.getTop();
        this.serial.send(test.getMessage()).then((response: string) => {
            if (response) {
                switch (test.getType()) {
                    case TestType.MeasureHigh: {
                        this.result.pinMeasurements.push(Parsers.parsePinMeasurement(PinMeasurementType.Up, response));
                        break;
                    }
                    case TestType.MeasureLow: {
                        this.result.pinMeasurements.push(Parsers.parsePinMeasurement(PinMeasurementType.Down, response));
                        break;
                    }
                    case TestType.MeasurePower: {
                        this.result.powerMeasurements = Parsers.parsePowerMeasurement(response);
                        break;
                    }
                }
                this.continue();
            } else {
                this.addError(`Test '${test.getType()}' failed: no response`);
                this.logger.error(`Test '${test.getType()}' failed: no response`);
            }
        }, (error) => {
            this.addError(`Test '${test.getType()}' failed: ${error}`);
            this.logger.error(`Test '${test.getType()}' failed - skipping: ${error}`);
            this.continue();
        });
    }

    private continue(): void {
        this.queue.pop();
        if (this.queue.isEmpty()) {
            this.endTest();
        } else {
            this.test();
        }
    }

    private endTest() {
        this.evalTest();
        if (this.result.errors.length > 0) {
            this.testCallback(this.result.errors);
        } else {
            this.testCallback();
        }
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
                            this.addError(`Pin '${type + index}' is undefined, perhaps missing from the measurement. (index starts from zero)`);
                        } else if (pinMeas[type][index] !== pin) {
                            this.addError(`Pin '${type + index}' is ${pinMeas[type][index]}, when it should be ${pin}. (index starts from zero)`);
                        }
                    });
                });
            } else {
                this.addError(`Missing '${pinMeasType}' pin measurement.`);
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
                        this.addError(`Value of '${type}' for source '${source}' is undefined`);
                    } else {
                        if (powerMeas[type] < wanted.min) {
                            this.addError(`Value of '${type}' for source '${source}' is ${powerMeas[type]}, minimal allowed value is ${wanted.min}`);
                        }

                        if (powerMeas[type] > wanted.max) {
                            this.addError(`Value of '${type}' for source '${source}' is ${powerMeas[type]}, maximal allowed value is ${wanted.max}`);
                        }
                    }
                });
            } else {
                this.addError(`Missing '${source}' power measurement.`);
            }
        });
    }

    private addError(error: string): void {
        this.result.errors.push(error);
    }

    private queue: Queue<Test>;
    private serial: Serial;
    private logger: LoggerClass;
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

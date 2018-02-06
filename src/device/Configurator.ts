import { Serial, SerialMessage } from '../communication/Serial';
import { LoggerClass } from 'logger';
import { Queue } from '../utils/Queue';

class Property {

    constructor(key: string, value: any) {
        this.key = key;
        if (typeof value === 'boolean') {
            this.value = value ? '1' : '0';
        } else {
            this.value = value.toString();
        }
        this.message = new SerialMessage('IODA', this.key, this.value);
    }

    public getMessage(): SerialMessage {
        return this.message;
    }

    public getValue(): string {
        return this.value;
    }

    public toString(): string {
        return this.key + ': ' + this.value;
    }

    private key: string;
    private value: string;
    private message: SerialMessage;
}

export class Configurator {

    constructor(config: any, serial: Serial, logger: LoggerClass) {
        this.serial = serial;
        this.config = config;
        this.logger = logger;
    }

    public beginConfiguration(callback: (configurationError?: string) => void) {
        if (!this.serial) {
            callback('serial port is not opened');
            return;
        }

        this.logger.info('Configurator::beginConfiguration - config:', this.config);

        // Set defaults first
        this.serial.send(new SerialMessage('IODA', 'defaults', null, 10000))
            .then((response) => {
                if (response === 'ok') {
                    this.queue = new Queue<Property>();

                    for (const key in this.config) {
                        if (this.config.hasOwnProperty(key) && this.config[key] !== null && this.config[key] !== undefined && key !== 'backuptime') {
                            this.queue.push(new Property(key, this.config[key]));
                        }
                    }

                    this.queue.push(new Property('configured', 1));
                    this.callback = callback;
                    this.configure();

                } else {
                    callback('failed to set defaults - canceled');
                }
            })
            .catch((error) => {
                callback('unable to set defaults - canceled, ' + error);
            });
    }

    private send(property: Property): Promise<string> {
        return this.serial.send(property.getMessage());
    }

    private configure() {
        let property: Property = this.queue.getTop();
        this.logger.debug('Configurator::configure - configuring property:', property.toString());
        this.send(property)
            .then((response: string) => {
                if (response !== property.getValue()) {
                    this.logger.trace('Configurator::configure - property:', property.toString(), 'was not changed, received:', response, '- repeating');
                    this.send(property)
                        .then((res: string) => {
                            if (res === property.getValue()) {
                                this.continue();
                            } else {
                                this.logger.trace('Configurator::configure - property:', property.toString(), 'was not changed, received:', res, '- end configuration');
                                this.endConfiguration('Failed to set property \'' + property.toString() + '\'');
                            }
                        })
                        .catch( (error) => {
                            this.endConfiguration('Unable to set property \'' + property.toString() + '\', ' + error);
                        });
                } else {
                    this.continue();
                }
            })
            .catch( (error) => {
                this.endConfiguration('Unable to set property \'' + property.toString() + '\', ' + error);
            });
    }

    private continue(): void {
        this.queue.pop();
        if (this.queue.isEmpty()) {
            this.endConfiguration();
        } else {
            this.configure();
        }
    }

    private endConfiguration(error?: string): void {
        this.serial.flush();
        this.callback(error);
    }

    private logger: LoggerClass;
    private serial: Serial;
    private queue: Queue<Property>;
    private callback: (error?: string) => void;

    private config: any = {
        normal_mqtt_hostname: 'dummy_host',
        normal_mqtt_port: '80',
        normal_mqtt_username: 'dummy_username',
        normal_mqtt_password: 'dummy_password',
        backup_mqtt_hostname: 'dummy_b_host',
        backup_mqtt_port: '8080',
        backup_mqtt_username: 'dummy_b_username',
        backup_mqtt_password: 'dummy_b_password'
    };
}

import { Serial, SerialMessage } from '../communication/Serial';
import { Logger } from 'logger';
import { Queue } from '../utils/Queue';

class Property {

    constructor(key: string, value: any) {
        this.key = key;
        this.value = value.toString();
        this.message = new SerialMessage('IODA', this.key, this.value);
    }

    public getMessage(): SerialMessage {
        return this.message;
    }

    public getValue(): string {
        return this.value;
    }

    private key: string;
    private value: string;
    private message: SerialMessage;
}

export class Configurator {

    public serial: Serial;

    constructor(config: any, serial: Serial) {
        this.serial = serial;
        this.config = config;
    }

    public beginConfiguration(callback: (configurationError?: string) => void) {
        if (!this.serial) {

            callback('Serial communication is not opened');
            return;
        }

        Logger.info('Configurator::beginConfiguration - config: ' + JSON.stringify(this.config));

        // Set defaults first
        this.serial.send(new SerialMessage('IODA', 'defaults', null, 20000)).then((response) => {
            if (response === 'ok') {
                this.queue = new Queue<Property>();

                for (const key in this.config) {
                    if (this.config[key] !== null && this.config[key] !== undefined) {
                        this.queue.push(new Property(key, this.config[key]));
                    }
                }

                this.queue.push(new Property('configured', 1));
                this.configurationCallback = callback;
                this.configure();

            } else {
                callback('Failed to set defaults before configuration - canceled');
            }
        }, (error) => {
            callback('Unable to set defaults before configuration - canceled, ' + error);
        });
    }

    private send(property: Property): Promise<string> {
        return this.serial.send(property.getMessage());
    }

    private configure() {
        let property: Property = this.queue.getTop();
        this.send(property).then((response: string) => {
            if (response !== property.getValue()) {
                this.send(property).then((res: string) => {
                    if (res === property.getValue()) {
                        this.continue();
                    } else {
                        this.endConfiguration('Failed to set property \'' + property + '\'');
                    }
                }, (err) => {
                    this.endConfiguration('Unable to set protperty \'' + property + '\', ' + err);
                });
            } else {
                this.continue();
            }
        }, (error) => {
            this.endConfiguration('Unable to set protperty \'' + property + '\', ' + error);
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
        this.configurationCallback(error);
    }

    private queue: Queue<Property>;
    private configurationCallback: (configurationError?: string) => void;

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

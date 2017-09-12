import { Serial } from '../communication/serial/SerialHandler';
import { Logger } from 'logger';
import { Queue } from '../utils/Queue';

class Property {

    public key: string;
    public value: string;

    constructor(key: string, value: any) {
        this.key = key;
        this.value = value.toString();
    }
}

export class Configurator {

    public connection: Serial;

    constructor(serialConnection: Serial) {
        this.connection = serialConnection;
    }

    public connect(connectionCallback, messageCallback) {
        /*this.connection = new Serial((err) => {

            if (err) {
                connectionCallback(err);
                return;
            }

        });*/

        this.connection = new Serial();
        this.connection.on('connect', () => {
            Logger.info('Configurator aquired a connection');
        });

        this.messageCallback = messageCallback;
        this.connection.on('message', this.messageCallback);

        this.connection.connect(connectionCallback);
    }

    public beginConfiguration(callback: (configurationError?: string) => void) {
        if (this.connection) {

            this.queue = new Queue<Property>();

            for (const key of Object.keys(this.config)) {

                this.queue.push(new Property(key, this.config[key]));
            }

            this.queue.push(new Property('configured', 1));

            this.currentPropertyTry = 3;
            this.configurationCallback = callback;
            this.configureMessageHandler = this.onConfigureMessage.bind(this);
            this.connection.on('message', this.configureMessageHandler);
            this.configure();
        }
    }

    public send(message: string) {
        if (this.connection) {
            this.connection.send(message);
        }
    }

    public disconnect(callback) {
        if (this.connection) {
            this.connection.disconnect(callback);
        }
    }

    public ping() {
        if (this.connection) {
            this.connection.ping();
        }
    }

    private configure() {
        this.currentPropertyTry--;
        let property: Property = this.queue.getTop();
        this.send('YODA:' + property.key + '=' + property.value);
        this.currentPropertyTimeout = setTimeout(() => {
            Logger.info('Response timeout - number of remaining tries = ' + this.currentPropertyTry);
            if (this.currentPropertyTry === 0) {
                this.endConfiguration('TimeOut for setting property \'' + property + '\'');
                return;
            }
            this.configure();
        }, 10000);
    }

    private endConfiguration(error?: string): void {
        this.connection.removeListener('message', this.configureMessageHandler);
        this.connection.flush();
        this.configureMessageHandler = null;
        this.configurationCallback(error);
    }

    private onConfigureMessage(message: string) {
        clearTimeout(this.currentPropertyTimeout);

        Logger.info('Configurator got response on configure = ' + message);

        message = message.replace('YODA:', ''); // Remove prefix

        let type: string = Serial.getMessageType(message);
        let value: string = Serial.getMessageValue(message);

        let property: Property = this.queue.getTop();

        Logger.info('Current property = ' + type + ' value = ' + value);

        if (property.value === value) { // If the current property was changed successfully
            this.queue.pop(); // Shifts queue, so the first element is out
            this.currentPropertyTry = 3;
            if (this.queue.isEmpty()) {
                this.endConfiguration();
                return;
            }
        }
        this.configure();
    }

    private queue: Queue<Property>;
    private currentPropertyTimeout: any;
    private currentPropertyTry: number;
    private messageCallback: (message: string) => void;
    private configurationCallback: (configurationError?: string) => void;
    private configureMessageHandler: (message: string) => void;

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

import { Serial } from '../communication/serial/SerialHandler';
import { Logger } from 'logger';
import { Queue } from './Queue';

export class DeviceConfigurator{

    public connection: Serial;
    public messageCallback: any;
    
    public queue: Queue<string>;

    public connect(connectionCallback, messageCallback) {
        this.connection = new Serial((err) => {

            if (err) {
                connectionCallback(err);
            }

            Logger.info('Device is connected');
            this.connection.on('message', (message) => {
                Logger.info('DeviceConfigurator got this message = ' + message);
                messageCallback(message);
            });
            connectionCallback();
        });
    }

    public beginConfiguration(callback: (configurationError?: string) => void) {
        if (this.connection) {

            this.queue = new Queue<string>();
            this.configurationCallback = callback;

            for (const key of Object.keys(this.config)) {
                this.queue.push(key);
            }

            this.currentPropertyTry = 3;
            this.configure();

            this.configureMessageHandler = this.onConfigureMessage.bind(this)

            this.connection.on('message', this.configureMessageHandler);
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
        let property: string = this.queue.getTop();
        this.send(property + '=' + this.config[property]);
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
        this.configureMessageHandler = null;
        this.configurationCallback(error);
    }

    private onConfigureMessage(message: string) {
        clearTimeout(this.currentPropertyTimeout);

        Logger.info('DeviceConfigurator got response on configure = ' + message);

        let type: string = Serial.getMessageType(message);
        let value: string = Serial.getMessageValue(message);

        Logger.info('Current property = ' + type + ' value = ' + this.config[type]);

        if (this.config[type] === value) { // If the current property was changed successfully
            this.queue.pop(); // Shifts queue, so the first element is out
            this.currentPropertyTry = 3;
            if (this.queue.isEmpty()) {
                this.endConfiguration();
                return;
            }
        }
        this.configure();
    }

    private currentPropertyTimeout: any;
    private currentPropertyTry: number;
    private configurationCallback: (configurationError?: string) => void;
    private configureMessageHandler: (message: string) => void

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

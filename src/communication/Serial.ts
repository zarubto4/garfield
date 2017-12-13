import { LoggerClass } from 'logger';
import * as SerialPort from 'serialport';
import { EventEmitter } from 'events';
import * as Promise from 'promise';
import { ConfigManager } from '../utils/ConfigManager';

export class SerialMessage extends EventEmitter {

    public static readonly REPEAT = 'repeat';
    public static readonly TIMEOUT = 'timeout';

    constructor(target: ('TK3G'|'IODA'), type: string, value?: string, timeout?: number, retry?: number, delay?: number) {
        super();

        this.target = target;
        this.type = type;

        if (value) {
            this.value = value;
        }

        if (timeout) {
            this.timeout = timeout;
        }

        if (retry) {
            this.retry = retry;
        }

        if (delay) {
            this.delay = delay;
        }
    }

    public resolve(response: string): void {
        clearTimeout(this.timeoutHandler);
        if (this.resolveCallback) {
            this.resolveCallback(response);
        }
    }

    public reject(err?: string): void {
        clearTimeout(this.timeoutHandler);
        if (this.rejectCallback) {
            this.rejectCallback(err);
        }
    }

    public getTarget(): string {
        return this.target;
    }

    public getType(): string {
        return this.type;
    }

    public getValue(): string {
        return this.value;
    }

    public getDelay(): number {
        return this.delay;
    }

    public getMessage(): string {
        let message: string = this.target + ':' + this.type;

        if (this.value) {
            message += '=' + this.value;
        }
        return message;
    }

    public setCallbacks(resolve: (response: string) => void, reject: (err?: string) => void) {
        this.resolveCallback = resolve;
        this.rejectCallback = reject;
    }

    public startTimeout() {
        this.retry--;
        this.timeoutHandler = setTimeout(() => {
            if (this.retry > 0) {
                this.emit(SerialMessage.REPEAT, this);
            } else {
                this.reject('timeout'); // TODO
                this.emit(SerialMessage.TIMEOUT, this);
            }
        }, this.timeout);
    }

    private resolveCallback: (response: string) => void;
    private rejectCallback: (err?: string) => void;
    private timeoutHandler: any;
    private target: ('TK3G'|'IODA');
    private type: string;
    private value: string;
    private timeout: number = 10000;
    private retry: number = 3;
    private delay: number;
}

export class SerialConnection extends EventEmitter {

    public static readonly MESSAGE = 'message';
    public static readonly DESTROY = 'destroy';
    public static readonly OPENED = 'opened';
    public static readonly CLOSED = 'closed';
    public static readonly ERROR = 'error';

    constructor(logger: LoggerClass, com: string, options: any) {
        super();
        this.logger = logger;
        this.crcEnabled = options.crcEnabled;
        this.connection = new SerialPort(com, {baudRate: options.baudRate, rtscts: options.rtscts});
        this.connection.on('open', this.onOpen);
        this.connectionTimeout = setTimeout(this.onConnectionTimeout, 8000);
    }

    public write(message: string): void {
        this.logger.debug('SerialConnection::write - sending message:', message);
        if (this.connection) {
            setTimeout(() => { // Little delay between messages, so the device better consumes it
                this.connection.write(this.addCrc(message) + '\r\n');
            }, 25);
        }
    }

    public flush(): void {
        this.connection.flush();
    }

    public close(): void {
        this.connection.close((err) => {
            this.emit(SerialConnection.CLOSED);
        });
    }

    public isOpened(): boolean {
        return this.connection && this.connection.isOpen;
    }

    private onOpen = () => {
        this.logger.info('SerialConnection::onOpen - connection:', this.connection.path, 'is opened');
        this.parser = this.connection.pipe(new SerialPort.parsers.Readline({ delimiter: '\n' }));
        this.parser.on('data', this.onFirstData);

        setTimeout(() => {
            this.logger.trace('SerialConnection::onOpen - ping port', this.connection.path);
            this.connection.flush();
            this.connection.write(this.addCrc('TK3G:ping') + '\r\n');
        }, 1000);
    }

    private onConnectionTimeout = () => {
        this.logger.info('SerialConnection::onConnectionTimeout - timeout for connection', this.connection.path);
        if (this.connection.isOpen) {
            this.connection.close();
        }
        this.emit(SerialConnection.DESTROY);
    }

    private onFirstData = (data) => {
        data = data.trim();

        this.logger.debug('SerialConnection::onFirstData - received data:', data, 'from', this.connection.path);

        if (!this.checkCrc(data)) {
            this.logger.trace('SerialConnection::onFirstData - checksum is invalid');
            return;
        }

        data = data.substring(0, data.lastIndexOf('#')); // Removes the CRC checksum

        if (data === 'TK3G:ping=ok') {
            if (this.connectionTimeout) {
                clearTimeout(this.connectionTimeout);
                this.connectionTimeout = null;
            }
            this.logger.info('SerialConnection::onFirstData - found tester on ' + this.connection.path);
            this.parser.removeAllListeners('data');
            this.parser.on('data', this.onData);
            this.emit(SerialConnection.OPENED);
        }
    }

    private onData = (data) => {
        if (!this.checkCrc(data.trim())) { // Checking CRC checksum
            this.emit(SerialConnection.ERROR, 'broken data, invalid crc');
        } else {
            let index = data.lastIndexOf('#');
            if (index > -1) {
                this.emit(SerialConnection.MESSAGE, data.substring(0, index));
            } else {
                this.emit(SerialConnection.MESSAGE, data);
            }
        }
    }

    private crc(message: string): string {
        let crc: number = 0;
        for (let i = 0; i < message.length; i++) {
            // tslint:disable-next-line:no-bitwise
            crc ^= message.charCodeAt(i);
        }

        let crcStr: string = crc.toString(16);
        if (crcStr.length === 1) {
            crcStr = '0' + crcStr;
        }

        return crcStr.toUpperCase();
    }

    private addCrc(message: string): string {
        if (this.crcEnabled) {
            return message + '#' + this.crc(message);
        }
        return message;
    }

    private checkCrc(message: string): boolean {
        if (this.crcEnabled) {
            let crc: string = message.substring(message.lastIndexOf('#') + 1);
            message = message.substring(0, message.lastIndexOf('#'));
            this.logger.trace('SerialConnection::checkCrc - crc: ' + crc + ', message: ' + message);

            if (crc === this.crc(message)) {
                this.logger.trace('SerialConnection::checkCrc - valid');
                return true;
            }
            this.logger.warn('SerialConnection::checkCrc - invalid');
            return false;
        } else {
            return true;
        }
    }

    private connectionTimeout;
    private crcEnabled: boolean;
    private logger: LoggerClass;
    private connection: SerialPort;
    private parser: SerialPort.parsers.Readline;
}

export class Serial extends EventEmitter {

    public static readonly OPENED = 'opened';
    public static readonly CONNECTION_ERROR = 'connection_error';
    public static readonly ERROR = 'error';
    public static readonly BUTTON = 'button';
    public static readonly CLOSED = 'closed';
    public static readonly MESSAGE = 'message';

    public static getMessageSender(message: string): string {
        if (message.match(/^\w{4}:/)) {
            return message.substring(0, message.indexOf(':'));
        }
        return undefined;
    }

    public static getMessageType(message: string): string {
        message = message.replace('IODA:', '').replace('TK3G:', '');
        if (message.includes('=')) {
            return message.substring(0, message.indexOf('='));
        }
        return message;
    }

    public static getMessageValue(message: string): string {
        if (message.includes('=')) {
            return message.substring(message.indexOf('=') + 1);
        }
        return undefined;
    }

    constructor(configManager: ConfigManager, logger: LoggerClass) {
        super();
        this.configManager = configManager;
        this.logger = logger;

        let config: any = this.configManager.get<any>('serial');
        this.baudRate = config.baudRate;
        this.rtsCtsEnabled = config.rtscts;
        this.crcEnabled = config.crc;
        this.logger.debug('Serial::constructor - baudRate:', this.baudRate, 'rtscts:', this.rtsCtsEnabled, 'crcEnabled:', this.crcEnabled);
    }

    public connect() {

        this.logger.info('Serial::connect - connecting');

        SerialPort.list()
            .then((ports) => {
                if (ports.length === 0) {
                    throw new Error('No device detected');
                }

                ports.forEach((port) => {
                    this.logger.trace('Serial::connect - Trying port:', port);
                    let connection: SerialConnection = new SerialConnection(this.logger, port.comName, {baudRate: this.baudRate, rtscts: this.rtsCtsEnabled, crcEnabled: this.crcEnabled});
                    let onOpen = () => {
                        this.connection = connection;
                        this.connection.on(SerialConnection.MESSAGE, this.messageResolver);
                        this.blink(5, 150);
                        this.emit(Serial.OPENED);
                    };
                    connection.on(SerialConnection.OPENED, onOpen.bind(this));
                });
            })
            .catch((err) => {
                this.logger.error('Serial::connect - connection error:', err);
                this.emit(Serial.CONNECTION_ERROR, err.message);
            });
    }

    public close() {

        this.logger.info('Serial::close - closing serial port');

        if (this.connection.isOpened()) {
            this.connection.close();
            /*this.connection.close(() => {
                this.logger.debug('Serial::close - connection closed');
                this.connection = null;
                this.emit(Serial.CLOSED);
            });*/
        } else {
            this.connection = null;
            this.emit(Serial.CLOSED);
        }
    }

    public send(message: SerialMessage): Promise<string> {
        return new Promise((resolve, reject) => {
            let doSend = () => {
                message.setCallbacks(resolve, reject);
                message.startTimeout();
                message
                    .on(SerialMessage.REPEAT, this.onRepeat.bind(this))
                    .on(SerialMessage.TIMEOUT, this.onTimeout.bind(this));
                this.messageBuffer.push(message);
                this.connection.write(message.getMessage());
            };

            let delay: number = message.getDelay();
            if (delay) {
                this.logger.trace('Serial::send - delaying message for', delay, 'ms');
                setTimeout(doSend, delay);
            } else {
                doSend();
            }
        });
    }

    public sendPlain(message: string): void {
        this.connection.write(message);
    }

    public ping(): Promise<string> {
        this.logger.debug('Serial::ping - sending ping');
        return this.send(new SerialMessage('TK3G', 'ping', null, 2000, 3));
    }

    public blink(count: number, delay: number) {
        if (count > 0) {
            this.connection.write('TK3G:leds=111111');
            setTimeout(() => {
                this.connection.write('TK3G:leds=000000');
                setTimeout(() => {
                    this.blink(--count, delay);
                }, delay);
            }, delay);
        }
    }

    public blinkError() {
        this.blinkErrorInterval = setInterval(() => {
            this.ledHigh(6);
            setTimeout(() => {
                this.ledLow(6);
            }, 500);
        }, 1000);
    }

    public resetLeds() {
        if (this.blinkErrorInterval) {
            clearInterval(this.blinkErrorInterval);
            this.blinkErrorInterval = null;
        }
        this.leds = '000000';
        this.connection.write('TK3G:leds=' + this.leds);
    }

    public ledHigh(index: number): void {
        this.ledChange('1', index);
    }

    public ledLow(index: number): void {
        this.ledChange('0', index);
    }

    public ledChange(val: string, index: number): void {
        if (index === 0) {
            this.leds = val + this.leds.substring(1);
        }

        if (index > 0 && index < 5) {
            this.leds = this.leds.substring(0, index) + val + this.leds.substring(index + 1);
        }

        if (index === 5) {
            this.leds = this.leds.substring(0, 5) + val;
        }

        this.connection.write('TK3G:leds=' + this.leds);
    }

    public flush() {
        this.logger.debug('Serial::flush - flushing');
        this.connection.flush();
    }

    public isOpened(): boolean {
        return this.connection != null && this.connection.isOpened();
    }

    private onRepeat(message: SerialMessage) {
        message.startTimeout();
        this.connection.write(message.getMessage());
    }

    private onTimeout(message: SerialMessage) {
        let index: number = this.messageBuffer.findIndex((msg: SerialMessage) => {
            return message.getTarget() === msg.getTarget() && message.getType() === msg.getType() && message.getValue() === msg.getValue();
        });
        if (index > -1) {
            this.messageBuffer.splice(index, 1);
        }
    }

    private messageResolver = (message: string) => {

        this.logger.info('Serial::messageResolver - received new message:', message);

        if (!message.startsWith('*')) { // Filtering out comments

            let sender: string = Serial.getMessageSender(message);
            let type: string = Serial.getMessageType(message);
            let value: string = Serial.getMessageValue(message);

            if (type === 'btn') {
                this.emit(Serial.BUTTON, value);
            } else {
                let request: SerialMessage = this.messageBuffer.find((msg: SerialMessage) => {
                    return msg.getTarget() === sender && msg.getType() === type;
                });

                this.logger.trace('Serial::messageResolver - buffer length:', this.messageBuffer.length);

                if (request) {
                    this.logger.debug('Serial::messageResolver - found request message in buffer');

                    if (value) {
                        request.resolve(value);
                    } else {
                        request.reject('response was empty');
                    }

                    let index: number = this.messageBuffer.findIndex((msg: SerialMessage) => {
                        return sender === msg.getTarget() && type === msg.getType();
                    });

                    if (index > -1) {
                        this.messageBuffer.splice(index, 1);
                    }
                } else {
                    this.logger.debug('Serial::messageResolver - request message not found - emitting');
                    this.emit(Serial.MESSAGE, message);
                }
            }
        }
    }

    private messageBuffer: SerialMessage[] = [];
    private connection: SerialConnection = null;
    private logger: LoggerClass;
    private configManager: ConfigManager;
    private baudRate: number = 115200;
    private rtsCtsEnabled: boolean = true;
    private crcEnabled: boolean = true;
    private leds: string = '000000';
    private blinkErrorInterval;
}

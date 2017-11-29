import { Logger, LoggerManager, LoggerLevel, LoggerFileTarget } from 'logger';
import * as SerialPort from 'serialport';
import { EventEmitter } from 'events';
import * as Promise from 'promise';

export class SerialMessage extends EventEmitter {

    constructor(target: ('TK3G'|'IODA'), type: string, value?: string, timeout?: number, retry?: number) {
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
                this.emit('repeat', this);
            } else {
                this.reject('timeout');
                this.emit('timeout', this);
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
}

export class Serial extends EventEmitter {

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

    public connect() {

        let opened_connections: SerialPort[] = []; // Reference for all opened connections

        SerialPort.list((listError, ports) => { // List all available ports

            Logger.info('Serial::connect - getting all devices');

            if (listError) {
                Logger.error(listError);
                this.emit('connection_error', listError.message);
                return;
            }

            if (ports.length === 0) {
                this.emit('connection_error', 'No device detected');
                return;
            }

            ports.forEach((port: any, index: number) => { // Try every port until Tester is found

                Logger.info('Serial::connect - Trying port = ' + JSON.stringify(port));

                let temp_connection: SerialPort = new SerialPort(port.comName, {baudRate: 115200, rtscts: true}, (connectionError: any) => {
                    if (connectionError) {

                        // temp_connection.close();
                        // Logger.error('Serial::connect - unable to open connection on: ' + temp_connection.path + ', ' + connectionError.toString());
                        // this.emit('connection_error', connectionError.message);
                    } else if (temp_connection.isOpen) {
                        Logger.info('Serial::connect - port ' + temp_connection.path + ' opened');
                        opened_connections.push(temp_connection); // Keeping reference to current connection
                        try {
                            setTimeout(() => {
                                try {
                                    Logger.warn('Serial::connect - ping port ' + temp_connection.path);
                                    if (temp_connection.isOpen) {
                                        temp_connection.flush();
                                        temp_connection.write(Serial.addCrc('TK3G:ping') + '\r\n');
                                    }
                                }catch (trr) {
                                    Logger.error('Serial::connect - setTimeout ', trr.toString());
                                }
                            }, 1500);
                        }catch (exc) {
                            Logger.error('Serial::connect - setTimeout ', exc.toString());
                        }
                    }else {
                        opened_connections.push(temp_connection); // Keeping reference to current connection
                    }
                });

                let lastConnectionTimout;

                if (index === ports.lenght - 1) {
                    lastConnectionTimout = setTimeout(() => {
                        this.connectionCleanUp(opened_connections);
                        this.emit('connection_error', 'TimeOut - No desirable device detected or responded');
                    }, 15000);
                }

                let temp_parser = temp_connection.pipe(new SerialPort.parsers.Readline({ delimiter: '\n' })); // parser which emits data, when the delimiter is received

                let flag_potvrzeno: boolean = false;

                temp_parser.on('data', (data: any) => { // temporary listener for connecting

                    data = data.trim();

                    Logger.info('Serial::connect - received data = ' + data + ' from ' + temp_connection.path);

                    if (!Serial.checkCrc(data)) {
                        Logger.info('Serial::connect - checksum is invalid');
                        return;
                    }

                    data = data.substring(0, data.lastIndexOf('#')); // Removes the CRC checksum

                    if (data === 'TK3G:ping=ok') {

                        if (lastConnectionTimout) {
                            clearTimeout(lastConnectionTimout);
                        }

                        Logger.info('Serial::connect - found tester on ' + temp_connection.path);
                        temp_connection.removeAllListeners('data'); // removing temporary listener
                        this.connection = temp_connection;
                        this.parser = this.connection.pipe(new SerialPort.parsers.Readline({ delimiter: '\n' }));
                        this.parser.on('data', this.messageResolver);

                        this.once('connected', () => {
                            this.blink(5, 150);
                        });

                        this.connectionCleanUp(opened_connections);
                        Logger.info('Serial::connect - Connection Procedure Done!');
                        this.emit('connected');
                        flag_potvrzeno = true;
                    }else if (!flag_potvrzeno) {
                        Logger.error('Serial::connect - flag není potvrzen a žádám ping a posílám na ', temp_connection.path);
                        temp_connection.write(Serial.addCrc('TK3G:ping') + '\r\n');
                    } else {
                        Logger.error('Serial::connect - TK3G:ping=FAIL!!!!:: ' + data);
                    }
                });
            });
        });
    }

    public disconnect(callback) {

        Logger.info('Serial::disconnect - disconnecting serial port');

        this.connection.close(() => {
            Logger.info('Serial::disconnect - connection closed');
            this.connection = null;
            callback();
        });
    }

    public send(message: SerialMessage): Promise<string> {
        return new Promise((resolve, reject) => {
            message.setCallbacks(resolve, reject);
            message.startTimeout();
            message.on('repeat', this.onRepeat.bind(this)).on('timeout', this.onTimeout.bind(this));
            this.messageBuffer.push(message);
            this.write(message.getMessage());
        });
    }

    public ping(): Promise<string> {
        Logger.info('Serial::ping - sending ping');
        return this.send(new SerialMessage('TK3G', 'ping', null, 2000, 3));
    }

    public blink(count: number, delay: number) {
        if (count > 0) {
            this.write('TK3G:leds=111111');
            setTimeout(() => {
                this.write('TK3G:leds=000000');
                setTimeout(() => {
                    this.blink(--count, delay);
                }, delay);
            }, delay);
        }
    }

    public ledHigh(index: number): Promise<string> {
        return this.ledChange('1', index);
    }

    public ledLow(index: number): Promise<string> {
        return this.ledChange('0', index);
    }

    public ledChange(val: string, index: number): Promise<string> {
        if (index === 0) {
            this.leds = val + this.leds.substring(1);
        }

        if (index > 0 && index < 5) {

            this.leds = this.leds.substring(0, index) + val + this.leds.substring(index + 1);
        }

        if (index === 5) {
            this.leds = this.leds.substring(0, 5) + val;
        }

        return this.send(new SerialMessage('TK3G', 'leds', this.leds));
    }

    public flush() {
        Logger.info('Serial::flush - flushing');
        this.connection.flush();
    }

    public isOpen(): boolean {
        return this.connection != null && this.connection.isOpen;
    }

    public getPath(): string {
        return this.connection.path;
    }

    private static crc(message: string): string {
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

    private static addCrc(message: string): string {
        return message + '#' + Serial.crc(message);
    }

    private static checkCrc(message: string): boolean {
        let crc: string = message.substring(message.lastIndexOf('#') + 1);
        message = message.substring(0, message.lastIndexOf('#'));
        // Logger.trace('Serial::checkCrc - crc: ' + crc + ', message: ' + message);

        if (crc === Serial.crc(message)) {
           // Logger.trace('Serial::checkCrc - valid');
            return true;
        }
        // Logger.trace('Serial::checkCrc - invalid');
        return false;
    }

    private write(message: string): void {
        Logger.info('Serial::write - sending message: ' + message);
        if (this.connection) {
            setTimeout(() => { // Little delay between messages, so the device better consumes it
                this.connection.write(Serial.addCrc(message) + '\r\n');
            }, 25);
        }
    }

    private connectionCleanUp(connections: SerialPort[]) {
        connections.forEach((conn) => { // closing unnecesary connections
            if (!this.connection || conn.path !== this.connection.path) {
                conn.close(() => {
                    Logger.info('Serial::connectionCleanUp - disconnected wrong device on', conn.path);
                    connections.splice(conn);
                });
            }
        });
    }

    private onRepeat(message: SerialMessage) {
        message.startTimeout();
        this.write(message.getMessage());
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

        Logger.info('Serial::messageResolver - received new message:', message);

        if (!message.startsWith('*')) { // Filtering out comments
            if (!Serial.checkCrc(message.trim())) { // Checking CRC checksum
                Logger.error('Data broken - CRC checksum is invalid');
                // this.emit('error', 'Data broken - CRC checksum is invalid');
            } else {
                message = message.substring(0, message.lastIndexOf('#')); // Removes the CRC checksum

                let sender: string = Serial.getMessageSender(message);
                let type: string = Serial.getMessageType(message);
                let value: string = Serial.getMessageValue(message);

                if (type === 'btn') {
                    this.emit('button', value);
                } else {
                    let request: SerialMessage = this.messageBuffer.find((msg: SerialMessage) => {
                        return msg.getTarget() === sender && msg.getType() === type;
                    });

                    Logger.info('Serial::messageResolver - buffer length:', this.messageBuffer.length);

                    if (request) {
                        Logger.info('Serial::messageResolver - found request message in buffer');

                        if (value) {
                            request.resolve(value);
                        } else {
                            request.reject('Response was empty');
                        }

                        let index: number = this.messageBuffer.findIndex((msg: SerialMessage) => {
                            return sender === msg.getTarget() && type === msg.getType();
                        });

                        if (index > -1) {
                            this.messageBuffer.splice(index, 1);
                        }
                    } else {
                        Logger.info('Serial::messageResolver - request message not found emitting');
                        this.emit('message', message);
                    }
                }
            }
        }
    }

    private messageBuffer: SerialMessage[] = [];
    private connection: SerialPort = null;
    private parser: SerialPort.parsers.Readline;
    private leds: string = '000000';
}

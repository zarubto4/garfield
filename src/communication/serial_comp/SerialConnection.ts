import {Logger, LoggerClass, LoggerManager} from 'logger';
import * as SerialPort from 'serialport';
import {EventEmitter} from 'events';

export class SerialConnection extends EventEmitter {

    public static readonly MESSAGE = 'message';
    public static readonly DESTROY = 'destroy';
    public static readonly OPENED = 'opened';
    public static readonly CLOSED = 'closed';
    public static readonly ERROR = 'error';

    constructor(protected com: string, options: any) {
        super();

        if (!this.logger) {
            this.logger = LoggerManager.get('serial');
            if (!this.logger) {
                this.logger = Logger;
            }
        }

        this.crcEnabled = options.crcEnabled;
        this.connection = new SerialPort(com, {
            baudRate: options.baudRate,
            rtscts: options.rtscts
        });

        this.connection
            .on('open', this.onOpen)
            .on('error', (e) => this.onError(e))
            .once('close', this.onClose);

        this.connectionTimeout = setTimeout(this.onConnectionTimeout, 9000);
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
        if (this.isOpen) {
            this.isOpen = false;
            this.connection.close();
        } else {
            this.onClose();
        }
    }

    public isOpened(): boolean {
        return this.connection && this.isOpen;
    }

    private onOpen = () => {
        try {

            this.isOpen = true;
            this.logger.info('SerialConnection::1::onOpen -', this.com, 'is opened');
            this.parser = this.connection.pipe(new SerialPort.parsers.Readline({delimiter: '\n'}));
            this.parser.on('data', this.onFirstData);

            this.logger.info('SerialConnection::2::onOpen - Creating Timeout Ping on: ', this.com);
            setTimeout(() => {
                this.logger.info('SerialConnection::3::onOpen - ping port', this.com);
                this.connection.flush();
                this.connection.write(this.addCrc('ATE:ping') + '\r\n');
            }, 1500);

        } catch (exc) {
            this.logger.error('SerialConnection::1::onOpen - ', this.com, 'Error:: ', exc);
        }
    }



    private set_let_down() {
        this.logger.info('SerialConnection::onFirstData - Set Led down  itself' + this.com);
        setTimeout(() => {
            this.logger.trace('SerialConnection:seLEDStatus', this.com);
            this.connection.write(this.addCrc('ATE:leds:000000') + '\r\n');
            this.set_led_up();
        }, 1000);
    }

    private set_led_up() {
        this.logger.info('SerialConnection::onFirstData - Set Led Up  itself' + this.com);
        setTimeout(() => {
            this.logger.trace('SerialConnection:seLEDStatus', this.com);
            this.connection.write(this.addCrc('ATE:leds:100000') + '\r\n');
            this.set_let_down();
        }, 1000);
    }

    private onError = (err) => {
        this.isOpen = false;

        if (err.message === 'Error Resource temporarily unavailable Cannot lock port') {
            this.logger.error('SerialConnection::onError - Port: ', this.com, ' temporarily unavailable Cannot lock port.');
            return;
        }

        if (err.message === 'Port is not open') {
            // nothing
            return;
        }

        if (err.message === 'Port is already open') {
            this.logger.error('SerialConnection::onError - Port: ', this.com, 'is already open');
            return;
        }

        this.logger.warn('SerialConnection::onError -', this.com, 'is broken. Error:: ', err.message);
    }

    private onClose = () => {
        this.logger.info('SerialConnection::onClose -', this.com, 'is closed');
        this.connection = null;
        this.emit(SerialConnection.CLOSED);
    }

    private onConnectionTimeout = () => {
        this.logger.info('SerialConnection::onConnectionTimeout - timeout for connection', this.com);
        this.connection.close();
        this.emit(SerialConnection.DESTROY);
    }

    private onFirstData = (data) => {
        data = data.trim();

        this.logger.debug('SerialConnection::onFirstData - received data:', data, 'from', this.com);

        if (!this.checkCrc(data)) {
            this.logger.trace('SerialConnection::onFirstData - checksum is invalid');
            return;
        }

        data = data.substring(0, data.lastIndexOf('#')); // Removes the CRC checksum

        if (data === 'ATE:ping=ok') {
            if (this.connectionTimeout) {

                this.logger.debug('SerialConnection::onFirstData: clearTimeout');
                clearTimeout(this.connectionTimeout);
                this.connectionTimeout = null;

            }
            this.logger.info('SerialConnection::onFirstData - found tester on ' + this.com);
            this.parser.removeAllListeners('data');

            this.logger.info('SerialConnection::onFirstData - parse on ' + this.com);
            this.parser.on('data', this.onData);

            this.logger.info('SerialConnection::onFirstData - on emit' + this.com);

            this.emit(SerialConnection.OPENED, this);

            this.logger.warn('SerialConnection::onFirstData - Set Led Up' + this.com);
            this.set_led_up();
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
    private isOpen: boolean = false;
    private connectionTimeout;
    private crcEnabled: boolean;
    private logger: LoggerClass;
    private connection: SerialPort;
    private parser: SerialPort.parsers.Readline;
}
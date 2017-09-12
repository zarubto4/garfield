import { Logger, LoggerManager, LoggerLevel, LoggerFileTarget } from 'logger';
import * as SerialPort from 'serialport';
import { EventEmitter } from 'events';

export class Serial extends EventEmitter {

    public static getMessageSender(message: string): string {
        if (message.match(/^\w{4}:/)) {
            return message.substring(0, message.indexOf(':'));
        }
        return undefined;
    }

    public static getMessageType(message: string): string {
        message = message.replace('YODA:', '').replace('TK3G:', '');
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

    /*constructor(callback: (err) => void) {
        super();
        this.connect(callback);
    }*/

    public connect(callback) {

        let opened_connections: SerialPort[] = []; // Reference for all opened connections

        SerialPort.list((listError, ports) => { // List all available ports

            Logger.info('Connecting - Getting all devices');

            if (listError) {
                Logger.error(listError);
                callback(listError.message);
                return;
            }

            if (ports.length === 0) {
                callback('No device detected');
                return;
            }

            ports.forEach((port: any, index: number) => { // Try every port until Tester is found

                Logger.info('Connecting - Trying port = ' + JSON.stringify(port));

                let temp_connection: SerialPort = new SerialPort(port.comName, {baudRate: 115200, rtscts: true}, (connectionError: any) => {
                    if (connectionError) {
                        Logger.error(connectionError);
                        callback(connectionError.message);
                    } else {
                        Logger.info('Connected to ' + temp_connection.path);
                        opened_connections.push(temp_connection); // Keeping reference to current connection
                        setTimeout(() => {
                            Logger.info('Sending ping to ' + temp_connection.path);
                            temp_connection.flush();
                            temp_connection.write('TK3G:ping\r\n');
                        }, 1500);
                    }
                });

                let lastConnectionTimout;

                if (index === ports.lenght - 1) {
                    lastConnectionTimout = setTimeout(() => {
                        this.connectionCleanUp(opened_connections);
                        callback('TimeOut - No desirable device detected or responded');
                    }, 15000);
                }

                let temp_parser = temp_connection.pipe(new SerialPort.parsers.Readline({ delimiter: '\n' })); // parser which emits data, when the delimiter is received

                temp_parser.on('data', (data: any) => { // temporary listener for connecting

                    data = data.trim();

                    Logger.info('Received data = ' + data + ' from ' + temp_connection.path);

                    if (!Serial.checkCrc(data)) {
                        Logger.info('Checksum is invalid');
                        return;
                    }

                    data = data.substring(0, data.lastIndexOf('#')); // Removes the CRC checksum

                    if (data === 'TK3G:ping=ok') {

                        if (lastConnectionTimout) {
                            clearTimeout(lastConnectionTimout);
                        }

                        Logger.info('Found Yoda - keeping connection on ' + temp_connection.path);
                        temp_connection.removeAllListeners('data'); // removing temporary listener
                        this.connection = temp_connection;
                        this.parser = this.connection.pipe(new SerialPort.parsers.Readline({ delimiter: '\n' }));
                        this.parser.on('data', (message) => {
                            if (!message.startsWith('*')) {
                                if (!Serial.checkCrc(message.trim())) {
                                    this.emit('error', 'Data broken - CRC checksum is invalid');
                                } else {
                                    message = message.substring(0, message.lastIndexOf('#')); // Removes the CRC checksum
                                    this.emit('message', message);
                                }
                            }
                        });

                        this.once('connect', () => {
                            this.blink(5, 150);
                        });

                        this.connectionCleanUp(opened_connections);
                        this.emit('connect');
                        callback();
                    }
                });
            });
        });
    }

    public disconnect(callback) {

        Logger.info('Disconnecting Yoda');

        this.connection.close(() => {
            Logger.info('Yoda disconnected');
            this.connection = null;
            callback();
        });
    }

    public send(message: string) {
        Logger.info('Sending message = ' + message);
        if (this.connection) {
            setTimeout(() => { // Little delay between messages, so the device better consumes it
                this.connection.write(message + '#' + Serial.crc(message) + '\r\n');
            }, 25);
        }
    }

    public ping() {
        Logger.info('Sending ping');
        this.send('ping');
    }

    public blink(count: number, delay: number) {
        Logger.info('Count is ' + count);
        if (count > 0) {
            this.send('TK3G:leds=111111');
            setTimeout(() => {
                this.send('TK3G:leds=000000');
                setTimeout(() => {
                    this.blink(--count, delay);
                }, delay);
            }, delay);
        }
    }

    public ledHigh(index: number) {
        this.ledChange('1', index);
    }

    public ledLow(index: number) {
        this.ledChange('0', index);
    }

    public ledChange(val: string, index: number) {
        if (index === 0) {
            this.leds = val + this.leds.substring(1);
        }

        if (index > 0 && index < 5) {

            this.leds = this.leds.substring(0, index) + val + this.leds.substring(index + 1);
        }

        if (index === 5) {
            this.leds = this.leds.substring(0, 5) + val;
        }

        this.send('TK3G:leds=' + this.leds);
    }

    public flush() {
        Logger.info('Flush');
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
            crc ^= message.charCodeAt(i);
        }

        let crcStr: string = crc.toString(16);
        if (crcStr.length === 1) {
            crcStr = '0' + crcStr;
        }

        return crcStr.toUpperCase();
    }

    private static checkCrc(message: string): boolean {
        let crc: string = message.substring(message.lastIndexOf('#') + 1);
        message = message.substring(0, message.lastIndexOf('#'));
        Logger.info('Checking crc = ' + crc + ' for message = ' + message);

        if (crc === Serial.crc(message)) {
            Logger.info('Checking crc = valid');
            return true;
        }
        Logger.info('Checking crc = invalid');
        return false;
    }

    private connectionCleanUp(connections: SerialPort[]) {
        connections.forEach((conn) => { // closing unnecesary connections
            if (!this.connection || conn.path !== this.connection.path) {
                conn.close(() => {
                    Logger.info('Disconnected wrong device on ' + conn.path);
                    connections.splice(conn);
                });
            }
        });
    }

    private connection: SerialPort = null;
    private parser: SerialPort.parsers.Readline;
    private leds: string = '000000';
}

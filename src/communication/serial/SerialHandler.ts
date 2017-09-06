import { Logger, LoggerManager, LoggerLevel, LoggerFileTarget } from 'logger';
import { SerialMessage } from './SerialMessage';
import * as SerialPort from 'serialport';
import { EventEmitter } from 'events';

export class Serial extends EventEmitter {

    public static getMessageType(message: string): string {
        if (message.includes('=')) {
            return message.substring(0, message.indexOf('='));
        }
        return message;
    }

    public static getMessageValue(message: string): string {
        if (message.includes('=')) {
            return message.substring(message.indexOf('=') + 1);
        }
        return message;
    }

    constructor(callback) {
        super();
        this.connect(callback);
    }

    public connect(callback) {

        let opened_connections: SerialPort[] = []; // Reference for all opened connections

        SerialPort.list((listError, ports) => {

            Logger.info('Connecting - Getting all devices');

            if (listError) {
                Logger.error(listError);
                callback(listError);
            }

            ports.forEach((port: any) => {

                Logger.info('Connecting - Trying port = ' + JSON.stringify(port));

                let temp_connection: SerialPort = new SerialPort(port.comName, {baudRate: 115200, rtscts: true}, (connectionError: any) => {
                    if (connectionError) {
                        Logger.error(connectionError);
                        callback(connectionError);
                    } else {
                        Logger.info('Connected to ' + temp_connection.path);
                        opened_connections.push(temp_connection);
                        setTimeout(() => {
                            Logger.info('Sending ping to ' + temp_connection.path);
                            temp_connection.flush();
                            temp_connection.write('ping\r\n');
                        }, 1500);
                    }
                });

                let temp_parser = temp_connection.pipe(new SerialPort.parsers.Readline({ delimiter: '\n' })); // parser which emits data, when the delimiter is received

                temp_parser.on('data', (temp_data: any) => { // temporary listener for connecting

                    let message: string = temp_data.toString();

                    Logger.info('Received data = ' + message + ' from ' + temp_connection.path);

                    if (message === 'ping=ok') {
                        Logger.info('Found Yoda - keeping connection on ' + temp_connection.path);
                        temp_connection.removeAllListeners('data'); // removing temporary listener
                        this.connection = temp_connection;
                        this.parser = this.connection.pipe(new SerialPort.parsers.Readline({ delimiter: '\n' }));
                        this.parser.on('data', (data) => {
                            if (!data.startsWith('*')) {
                                this.emit('message', data);
                            }
                        });
                        opened_connections.forEach((conn) => { // closing unnecesary connections
                            if (conn.path !== this.connection.path) {
                                conn.close(() => {
                                    Logger.info('Disconnected wrong device on ' + conn.path);
                                    opened_connections.splice(conn);
                                });
                            }
                        });
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
            this.connection.write(message + '\r\n');
        }
    }

    public ping() {
        Logger.info('Sending ping');
        this.send('ping');
    }

    public isOpen(): boolean {
        return this.connection != null && this.connection.isOpen;
    }

    private connection: SerialPort = null;
    private parser: SerialPort.parsers.Readline;
}

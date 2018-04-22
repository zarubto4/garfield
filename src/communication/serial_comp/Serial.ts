import { LoggerClass } from 'logger';
import * as SerialPort from 'serialport';
import { EventEmitter } from 'events';
import * as Promise from 'promise';
import { ConfigManager } from '../../utils/ConfigManager';
import { SerialConnection } from './SerialConnection';
import { SerialMessage } from './SerialMessage';



/**
 * Class is used for serial communication with the TestKit.
 * It handles serial connections and received messages.
 */
export class Serial extends EventEmitter {

    public static readonly OPENED = 'opened';
    public static readonly CONNECTION_ERROR = 'connection_error';
    public static readonly ERROR = 'error';
    public static readonly BUTTON = 'button';
    public static readonly CLOSED = 'closed';
    public static readonly MESSAGE = 'message';

    /**
     * Extracts the message sender from the given message.
     * @param {string} message to inspect
     * @returns {string} ATE or DUT
     */
    public static getMessageSender(message: string): string {
        if (message.match(/^\w{3}:/)) {
            return message.substring(0, message.indexOf(':'));
        }
        return undefined;
    }

    /**
     * Extract the message type from the given message.
     * @param {string} message to inspect
     * @returns {string} type of message
     */
    public static getMessageType(message: string): string {
        message = message.replace('DUT:', '').replace('ATE:', '');
        if (message.includes('=')) {
            return message.substring(0, message.indexOf('='));
        }
        return message;
    }

    /**
     * Extracts the value from the given message.
     * @param {string} message to inspect
     * @returns {string} value from message
     */
    public static getMessageValue(message: string): string {
        if (message.includes('=')) {
            return message.substring(message.indexOf('=') + 1);
        }
        return undefined;
    }

    constructor(protected configManager: ConfigManager, logger: LoggerClass) {
        super();
        this.logger = logger;

        let config: any = this.configManager.get<any>('serial');
        this.baudRate = config.baudRate;
        this.rtsCtsEnabled = config.rtscts;
        this.crcEnabled = config.crc;
        this.logger.debug('Serial::constructor - baudRate:', this.baudRate, 'rtscts:', this.rtsCtsEnabled, 'crcEnabled:', this.crcEnabled);
    }

    /**
     * Opens connections on every available serial port.
     * If connection gets opened, method will send ping to it.
     * Event 'opened' is emitted when some device responds
     * on the ping message and that connection is kept, others are closed.
     */
    public connect() {

        this.logger.info('Serial::connect - Auto connecting');

        SerialPort.list()
            .then((ports) => {
                this.logger.info('Serial::connect - Serial Port List: ', ports);

                if (ports.length === 0) {
                    this.logger.error('Serial::connect:: No device in list detected');
                }

                ports.forEach((port) => {
                    this.logger.trace('Serial::connect - Trying port:', port);
                    let connection: SerialConnection = new SerialConnection(port.comName, {baudRate: this.baudRate, rtscts: this.rtsCtsEnabled, crcEnabled: this.crcEnabled});

                    let onOpen = (conn: SerialConnection) => {
                        this.logger.warn('Serial: onOpenSuccesfulConnection: Cooncetion Found and opened', conn['com']);
                        this.connection = conn;
                        this.connection
                            .on(SerialConnection.MESSAGE, this.messageResolver)
                            .once(SerialConnection.CLOSED, this.onConnectionClosed);
                        this.blink(5, 150);
                        this.emit(Serial.OPENED, this);
                    };

                    connection.on(SerialConnection.OPENED, (con: SerialConnection) => {
                        setImmediate(onOpen.bind(this, con));
                    });
                });
            })
            .catch((err) => {
                this.logger.error('Serial::connect - connection error:', err);
                this.emit(Serial.CONNECTION_ERROR, err.message);
            });
    }




    /**
     * Closes serial communication. Event 'closed' is emitted after connection is closed.
     */
    public close() {
        this.logger.info('Serial::close - closing serial port');
        this.connection.close();
    }

    /**
     * Used when response is needed. Sends message with attributes.
     * @param {SerialMessage} message
     * @returns {ThenPromise<string>}
     */
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

    /**
     * Writes plain text message to the serial port.
     * This method does not handle message repeating, timeout and delay, etc.
     * @param {string} message to send
     */
    public sendPlain(message: string): void {
        this.connection.write(message);
    }

    /**
     * Sends ping to serial port, retries max three times.
     * @returns {ThenPromise<string>} response
     */
    public ping(): Promise<string> {
        this.logger.debug('Serial::ping - sending ping');
        return this.send(new SerialMessage('ATE', 'ping', null, 2000, 3));
    }

    /**
     * Method blinks all LEDs on the TestKit.
     * @param {number} count of blinks
     * @param {number} delay between blinks
     */
    public blink(count: number, delay: number) {
        if (count > 0) {
            this.connection.write('ATE:leds=111111');
            setTimeout(() => {
                this.connection.write('ATE:leds=000000');
                setTimeout(() => {
                    this.blink(--count, delay);
                }, delay);
            }, delay);
        }
    }

    /**
     * Sets error blinking with the 6th red LED on the TestKit.
     */
    public blinkError() {
        this.blinkErrorInterval = setInterval(() => {
            this.ledHigh(5);
            setTimeout(() => {
                this.ledLow(5);
            }, 500);
        }, 1000);
    }

    /**
     * Turns off all LEDs on the TestKit.
     */
    public resetLeds() {
        if (this.blinkErrorInterval) {
            clearInterval(this.blinkErrorInterval);
            this.blinkErrorInterval = null;
        }
        this.leds = '000000';
        this.connection.write('ATE:leds=' + this.leds);
    }

    /**
     * Lights up the LED based on the index.
     * The index should be between 0 or 5 both included.
     * @param {number} index of the LED
     */
    public ledHigh(index: number): void {
        this.ledChange('1', index);
    }

    /**
     * Turn off the LED based on the index.
     * The index should be between 0 or 5 both included.
     * @param {number} index of the LED
     */
    public ledLow(index: number): void {
        this.ledChange('0', index);
    }

    /**
     * Changes the state of the LED on the index.
     * Writes LEDs to the serial port.
     * @param {string} value of the LED
     * @param {number} index of the LED
     */
    public ledChange(value: string, index: number): void {
        if (index < 0 || index > 5) {
            this.logger.warn('Serial::ledChange - index is out of bounds, allowed values are between 0 and 5 both included, received value:', index);
        } else if (index === 0) {
            this.leds = value + this.leds.substring(1);
        } else if (index > 0 && index < 5) {
            this.leds = this.leds.substring(0, index) + value + this.leds.substring(index + 1);
        } else if (index === 5) {
            this.leds = this.leds.substring(0, 5) + value;
        }

        this.connection.write('ATE:leds=' + this.leds);
    }

    public flush() {
        this.logger.debug('Serial::flush - flushing');
        this.connection.flush();
    }

    public isOpened(): boolean {
        return this.connection != null && this.connection.isOpened();
    }

    private onConnectionClosed() {
        this.logger.info('Serial::onConnectionClosed - serial port was closed');
        this.connection = null;
        this.emit(Serial.CLOSED);

        this.logger.warn('Serial::onConnectionClosed - ITS TIME TO TRY RECONECTION AGAIN!');
        this.connect();
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
    private baudRate: number = 115200;
    private rtsCtsEnabled: boolean = true;
    private crcEnabled: boolean = true;
    private leds: string = '000000';
    private blinkErrorInterval;
}

import * as Rx from 'rxjs';
import { LoggerClass } from 'logger';
import * as WebSocket from 'ws';
import * as rp from 'request-promise';
import { EventEmitter } from 'events';
import { ConfigManager } from '../utils/ConfigManager';

export class IWebSocketMessage {
    public message_id: string;
    public message_channel: string;
    public message_type: string;

    constructor(message_type: string) {
        this.message_id = Becki.uuid();
        this.message_channel = Becki.WS_CHANNEL;
        this.message_type = message_type;
    }
}

export class WsMessageError extends IWebSocketMessage {
    status: string;
    error: string;

    constructor(message_type: string, error_message: string) {
        super(message_type); // jediné, co se dopisuje je Message_type, ostatní se generuje v nadřazené třídě
        this.status = 'error';
        this.error = error_message;
    }
}

export class WsMessageSuccess extends IWebSocketMessage {
    status: string;

    constructor(message_type: string) {
        super(message_type);
        this.status = 'success';
    }
}

export class WsMessageTesterConnect extends IWebSocketMessage {
    tester_id: string;

    constructor(tester_id: string) {
        super('tester_connect');
        this.tester_id = tester_id;
    }
}

export class WsMessageTesterDisconnect extends IWebSocketMessage {
    tester_id: string;

    constructor(tester_id: string) {
        super('tester_disconnect');
        this.tester_id = tester_id;
    }
}

export class WsMessageDeviceConnect extends IWebSocketMessage {
    device_id: string;

    constructor(device_id: string) {
        super('device_connect');
        this.device_id = device_id;
    }
}

export class WsMessageDeviceDisconnect extends IWebSocketMessage {
    device_id: string;

    constructor(device_id: string) {
        super('device_disconnect');
        this.device_id = device_id;
    }
}

export class WsMessageDeviceId extends IWebSocketMessage {
    device_id: string;

    constructor(device_id: string) {
        super('device_id');
        this.device_id = device_id;
    }
}

export class WsMessageDeviceBinary extends IWebSocketMessage {
    url: string; // url for download
    type: ('bootloader' | 'firmware'); // bootloader or firmware
    constructor() {
        super('device_binary');
    }
}

export class WsMessageDeviceBinaryResult extends WsMessageSuccess {
    type: ('bootloader' | 'firmware'); // bootloader or firmware
    constructor(type: ('bootloader' | 'firmware')) {
        super('device_binary');
        this.type = type;
    }
}

export class WsMessageDeviceTest extends IWebSocketMessage {
    test_config: JSON;
    constructor() {
        super('device_test');
    }
}

export class WsMessageDeviceTestResult extends IWebSocketMessage {
    errors: string[];
    status: string = 'error';
    constructor(errors: string[]) {
        super('device_test');
        this.errors = errors;
    }
}

export class WsMessageDeviceConfigure extends IWebSocketMessage {
    configuration: JSON; // TODO přepsat/rozepsat dle nastavení HW
    constructor() {
        super('device_configure');
    }
}

export interface IWebSocketToken {
    /**
     * @name websocket_token
     * @type string
     * @description Swagger_Websocket_Token - for WebSocket access. The ttl of the token is 5 seconds. It is disposable. It can not be used twice.
     * @readonly
     * @required
     */
    websocket_token: string;
}

export interface Request {
    data: any;
    reply: (data: Object) => void;
}

export class Becki extends EventEmitter {

    public static readonly WS_CHANNEL = 'garfield';
    public static readonly MESSAGE_RECEIVED = 'message';
    public static readonly OPEN = 'open';
    public static readonly CLOSE = 'close';

    public static uuid(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            // tslint:disable-next-line:no-bitwise
            let r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    public logger: LoggerClass;

    public host = 'localhost:9000';

    public wsProtocol = 'ws';

    public authToken: string;

    public webSocketErrorOccurred: Rx.Subject<any> = new Rx.Subject<any>();

    constructor(configManager: ConfigManager, authToken: string, logger: LoggerClass) {
        super();
        this.configManager = configManager;
        this.host = this.configManager.get<string>('tyrionHost').trim();
        this.wsProtocol = this.configManager.get<boolean>('tyrionSecured') ? 'wss' : 'ws';
        this.authToken = authToken;
        this.logger = logger;
    }

    public connect(): void {
        this.logger.info('Becki::connect - connecting');

        if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
            this.logger.info('Becki::connect - disconnect previous one');
            this.disconnect();
        }

        this.getAccessToken()
            .then((webSocketToken: IWebSocketToken) => {
                this.logger.debug('Becki::connect - access token:', webSocketToken.websocket_token);
                this.websocketErrorShown = false;
                this.webSocket = new WebSocket(`${this.wsProtocol}://${this.host}/websocket/becki/${webSocketToken.websocket_token}`);
                this.webSocket.addEventListener('close', this.onClose);
                let opened = Rx.Observable.fromEvent<void>(this.webSocket, 'open');
                let channelReceived = Rx.Observable
                    .fromEvent<MessageEvent>(this.webSocket, 'message')
                    .map(event => { // TODO: think why is this triggered 8 times (for 8 subscribes)
                        try {
                            return JSON.parse(event.data);
                        } catch (e) {
                            this.logger.error('Becki::connect - parse error: ', e);
                        }
                        return null;
                    })
                    .filter(message => (message && message.message_channel === Becki.WS_CHANNEL));

                let errorOccurred = Rx.Observable.fromEvent(this.webSocket, 'error');

                opened.subscribe(anything => {
                    this.subscribeBecki();
                    this.logger.info('Becki::connect - connected');
                });

                // Respond on ping messages
                channelReceived
                    .filter(message => message.message_type === 'ping')
                    .subscribe((msg) => {
                        if (this.webSocket.readyState === WebSocket.OPEN) {
                            this.webSocket.send(JSON.stringify({
                                message_type: 'ping',
                                message_id: msg.message_id,
                                message_channel: msg.message_channel,
                                status: 'success'
                            }));
                        }
                    });

                // Respond on keepalive messages
                channelReceived
                    .filter(message => message.message_type === 'keepalive')
                    .subscribe((msg) => {
                        if (this.webSocket.readyState === WebSocket.OPEN) {
                            this.webSocket.send(JSON.stringify({
                                message_type: 'keepalive',
                                message_id: msg.message_id,
                                message_channel: msg.message_channel,
                                status: 'success'
                            }));
                        }
                    });

                // Respond on subscribe_garfield messages
                channelReceived
                    .filter(message => message.message_type === 'subscribe_garfield')
                    .subscribe((msg) => {
                        this.setKeepAlive();
                        this.emit(Becki.OPEN);
                        if (this.webSocket.readyState === WebSocket.OPEN && !msg.hasOwnProperty('status')) {
                            this.webSocket.send(JSON.stringify({
                                message_type: 'subscribe_garfield',
                                message_id: msg.message_id,
                                message_channel: msg.message_channel,
                                status: 'success'
                            }));
                        }
                        this.sendMessageQueue();
                    });

                channelReceived
                    .filter(message => message.status === 'error')
                    .map(message => this.logger.error(message))
                    .subscribe(this.webSocketErrorOccurred);

                channelReceived
                    .filter(message => message.message_type !== 'ping' && message.message_type !== 'keepalive' && message.message_type !== 'subscribe_garfield')
                    .subscribe(message => this.emit(Becki.MESSAGE_RECEIVED, message, this.responseFunction.bind(this, message['message_id'], message['message_type']))); // All messages except ping are emitted and caught by listeners

                errorOccurred
                    .subscribe(this.webSocketErrorOccurred);
            })
            .catch((error) => {
                if (!this.websocketErrorShown) {
                    this.websocketErrorShown = true;
                    this.webSocketErrorOccurred.next(error);
                }

                this.unsetKeepAlive();

                this.logger.error('Becki::connect - reconnecting, error occurred:', error.message);
                this.reconnectAfterTimeout();
            });
    }

    public isSubscribed(): boolean {
        return !!this.keepAlive;
    }

    public subscribeBecki(): void {
        this.logger.debug('Becki::subscribeBecki - requesting subscription');
        let message = new IWebSocketMessage('subscribe_garfield');
        if (!this.findEnqueuedMessage(message, 'message_channel', 'message_type')) {
            this.send(message);
        }
    }

    public send(message: IWebSocketMessage): void {
        this.logger.trace('Becki::send - sending message: ' + JSON.stringify(message));
        this.webSocketMessageQueue.push(message);
        this.sendMessageQueue();
    }

    public disconnect(): void {
        this.logger.info('Becki::disconnect - disconnecting');
        this.send(new IWebSocketMessage('unsubscribe_garfield'));
        this.unsetKeepAlive();

        if (this.webSocketReconnectTimeout) {
            this.logger.trace('Becki::disconnect - clear reconnect timeout');
            clearTimeout(this.webSocketReconnectTimeout);
            this.webSocketReconnectTimeout = null;
        }
        if (this.webSocket) {
            this.logger.trace('Becki::disconnect - removing event listener and closing');
            this.webSocket.removeEventListener('close', this.onClose);
            this.webSocket.close();
        }

        this.logger.debug('Becki::disconnect - connection closed');
        this.webSocket = null;
    }

    protected onClose = () => {
        this.unsetKeepAlive();
        this.emit(Becki.CLOSE);
        this.reconnectAfterTimeout();
    }

    // define function as property is needed to can set it as event listener (class methods is called with wrong this)
    protected reconnectAfterTimeout = () => {
        clearTimeout(this.webSocketReconnectTimeout);
        this.webSocketReconnectTimeout = setTimeout(() => {
            this.connect();
        }, 5000);
    }

    private responseFunction(messageId: string, messageType: string, data: Object) {
        data['message_id'] = messageId;
        data['message_type'] = messageType;
        data['message_channel'] = Becki.WS_CHANNEL;
        this.send(<IWebSocketMessage>data);
    }

    private setKeepAlive(): void {
        this.unsetKeepAlive();
        this.keepAlive = setInterval(() => {
            this.send(new IWebSocketMessage('keepalive'));
        }, 5000);
    }

    private unsetKeepAlive(): void {
        if (this.keepAlive) {
            clearInterval(this.keepAlive);
            this.keepAlive = null;
        }
    }

    private sendMessageQueue(): void {
        if (this.webSocket) {
            this.webSocketMessageQueue.slice().forEach(message => {
                try {
                    this.webSocket.send(JSON.stringify(message));
                    let i = this.webSocketMessageQueue.indexOf(message);
                    if (i > -1) {
                        this.webSocketMessageQueue.splice(i, 1);
                    }
                } catch (err) {
                    console.error('ERR', err);
                }
            });
        }
    }

    private findEnqueuedMessage(original: IWebSocketMessage, ...keys: string[]): IWebSocketMessage {
        return this.webSocketMessageQueue.find(message => {
            let match = true;
            keys.forEach(key => {
                if (!(<any>message)[key] || !(<any>original)[key] || (<any>original)[key] !== (<any>message)[key]) {
                    match = false;
                }
            });
            return match;
        });
    }

    private getAccessToken(): Promise<IWebSocketToken> {
        this.logger.trace('Becki::getAccessToken - token: ', this.authToken);
        let options = {
            method: 'GET',
            uri: (this.configManager.get<boolean>('tyrionSecured') ? 'https://' : 'http://') +
                this.configManager.get<string>('tyrionHost').trim() + '/websocket/access_token',
            body: {},
            json: true,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'garfield-app',
                'x-auth-token': this.authToken
            }
        };
        return rp(options);
    }

    protected websocketErrorShown: boolean = false;
    private webSocketMessageQueue: IWebSocketMessage[] = [];
    private webSocket: WebSocket = null;
    private webSocketReconnectTimeout: any = null;
    private token = null;
    private configManager: ConfigManager = null;
    private keepAlive = null;
}

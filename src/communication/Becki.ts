import * as Rx from 'rxjs';
import { resolve } from 'path';
import { Logger } from 'logger';
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
    message: string;

    constructor(message_type: string, error_message: string) {
        super(message_type); // jediné, co se dopisuje je Message_type, ostatní se generuje v nadřazené třídě
        this.status = 'error';
        this.message = error_message;
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

export class WsMessageDeviceBinary extends IWebSocketMessage {// TODO přepsat a domluvit se, jak a co budeme posílat v tomto
    url: string; // url for download
    type: ('bootloader' | 'firmware'); // bootloader or firmware
    constructor() {
        super('device_binary');
    }
}

export class WsMessageDeviceBinaryResult extends WsMessageSuccess {// TODO přepsat a domluvit se, jak a co budeme posílat v tomto
    type: ('bootloader' | 'firmware'); // bootloader or firmware
    constructor(type: ('bootloader' | 'firmware')) {
        super('device_binary');
        this.type = type;
    }
}

export class WsMessageGetConfiguration extends IWebSocketMessage { // get jakožto z pohledu Becki //TODO promyslet zda to necheme přejmenovat
    configuration: JSON; // TODO přepsat/rozepsat dle nastavení HW
    constructor(configuration: any) {
        super('get_configuration');
        this.configuration = configuration;
    }
}

export class WsMessageDeviceConfigure extends IWebSocketMessage {
    configuration: JSON; // TODO přepsat/rozepsat dle nastavení HW
    constructor() {
        super('device_configure');
    }
}

export class WsMessageForceDeviceConnection extends IWebSocketMessage {
    constructor() {
        super('force_device_connect');
    }
}

export interface IWebSocketToken {
    /**
     * @name websocket_token
     * @type string
     * @description Swagger_Websocket_Token - used this token for WebSocket access. The lifetime of the token is 5 seconds. It is disposable. It can not be used twice. In the event of the expiration of the life of the disabled.
     * @readonly
     * @required
     */
    websocket_token: string;
}

export class RestRequest {

    method: string;

    url: string;

    headers: { [name: string]: string };

    body: Object;

    constructor(method: string, url: string, headers: { [name: string]: string } = {}, body?: Object) {
        this.method = method;
        this.url = url;
        this.headers = {};
        for (let header in headers) {
            if (headers.hasOwnProperty(header)) {
                this.headers[header] = headers[header];
            }
        }
        this.headers['Accept'] = 'application/json';
        this.headers['Content-Type'] = 'application/json';
        this.body = body;

    }
}

export class Becki extends EventEmitter {

    public static WS_CHANNEL = 'garfield';

    public static uuid(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            // tslint:disable-next-line:no-bitwise
            let r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    public host = '127.0.0.1:9000';

    public protocol = 'http';

    public wsProtocol = 'ws';

    public authToken: string;

    public requestProxyServerUrl = 'http://127.0.0.1:3000/fetch/';

    public webSocketErrorOccurred: Rx.Subject<any> = new Rx.Subject<any>();

    public interactionsSchemeSubscribed: Rx.Subject<any> = new Rx.Subject<any>();

    public beckiMessageSubscribed: Rx.Subject<any> = new Rx.Subject<any>();

    constructor(authToken: string) {
        super();
        this.authToken = authToken;
        this.interactionsSchemeSubscribed.subscribe(msg => (this.getMessage(msg)));
        this.beckiMessageSubscribed.subscribe(msg => (this.getDiffMessage(msg)));
    }

    public getDiffMessage(msg: WsMessageDeviceConfigure) {
        Logger.info(msg);
    }

    public getMessage(msg) {
        Logger.info('WS: ', msg);
    }

    public connectWebSocket(): void {
        Logger.info('connectWebSocket()');

        this.disconnectWebSocket();

        this.websocketGetAccessToken()
            .then((webSocketToken: IWebSocketToken) => {
                Logger.info('Access token:', webSocketToken.websocket_token);
                this.websocketErrorShown = false;
                this.webSocket = new WebSocket(`${this.wsProtocol}://${this.host}/websocket/becki/${webSocketToken.websocket_token}`);
                this.webSocket.addEventListener('close', this.reconnectWebSocketAfterTimeout);
                let opened = Rx.Observable
                    .fromEvent<void>(this.webSocket, 'open');
                let channelReceived = Rx.Observable
                    .fromEvent<MessageEvent>(this.webSocket, 'message')
                    .map(event => { // TODO: think why is this triggered 8 times (for 8 subscribes)
                        try {
                            return JSON.parse(event.data);
                        } catch (e) {
                            console.error('Parse error: ', e);
                        }
                        return null;
                    })
                    .filter(message => (message && message.message_channel === Becki.WS_CHANNEL));
                let errorOccurred = Rx.Observable
                    .fromEvent(this.webSocket, 'error');

                opened.subscribe(anything => {
                    this.requestBeckiSubscribe();
                    this.emit('open');
                });
                opened
                    .subscribe(() => this.sendWebSocketMessageQueue());

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

                channelReceived
                    .filter(message => message.status === 'error')
                    .map(message => Logger.info(message))
                    .subscribe(this.webSocketErrorOccurred);

                channelReceived
                    .filter(message => message.message_type === 'garfield')
                    .subscribe(this.interactionsSchemeSubscribed);

                channelReceived
                    .filter(message => message.message_type !== 'ping')
                    .subscribe(message => this.emit(message.message_type, message)); // All messages except ping are emitted and caught by listeners

                errorOccurred
                    .subscribe(this.webSocketErrorOccurred);

            })
            .catch((error) => {
                if (!this.websocketErrorShown) {
                    this.websocketErrorShown = true;
                    this.webSocketErrorOccurred.next(error);
                }
                Logger.error('Reconecting - error occured:', error.message);
                this.reconnectWebSocketAfterTimeout();
            });
    }

    public requestBeckiSubscribe(): void {
        Logger.info('Requesting subscription');
        let message = new IWebSocketMessage('subscribe_garfield');
        if (!this.findEnqueuedWebSocketMessage(message, 'message_channel', 'message_type')) {
            this.sendWebSocketMessage(message);
        }
    }

    public sendWebSocketMessage(message: IWebSocketMessage): void {
        Logger.info('WS message: ' + JSON.stringify(message));
        this.webSocketMessageQueue.push(message);
        this.sendWebSocketMessageQueue();
    }

    public disconnectWebSocket(): void {
        if (this.webSocket) {
            this.webSocket.removeEventListener('close', this.reconnectWebSocketAfterTimeout);
            this.webSocket.close();
        }
        this.webSocket = null;
    }

    // define function as property is needed to can set it as event listener (class methods is called with wrong this)
    protected reconnectWebSocketAfterTimeout = () => {
        clearTimeout(this.webSocketReconnectTimeout);
        this.webSocketReconnectTimeout = setTimeout(() => {
            this.connectWebSocket();
        }, 5000);
    }

    private sendWebSocketMessageQueue(): void {
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

    private findEnqueuedWebSocketMessage(original: IWebSocketMessage, ...keys: string[]): IWebSocketMessage {
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

    private websocketGetAccessToken(): Promise<IWebSocketToken> {
        Logger.info('token: ', this.authToken);
        let options = {
            method: 'GET',
            uri: (ConfigManager.config.get<boolean>('tyrionSecured') ? 'https://' : 'http://') +
                ConfigManager.config.get<string>('tyrionHost').trim() + '/websocket/access_token',
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
    // protected abstract requestRestPath<T>(method: string, path: string, body: Object, success: number[]): Promise<T>;
}

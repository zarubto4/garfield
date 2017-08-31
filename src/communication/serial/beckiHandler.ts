import * as Rx from 'rxjs';

export interface IWebSocketMessage {
    message_id: string;
    message_channel: string;
    message_type: string;
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


export class beckiCom {


    public static WS_CHANNEL = 'garfield';

    public host = '127.0.0.1:9000';

    public protocol = 'http';

    public wsProtocol = 'ws';

    public requestProxyServerUrl = 'http://127.0.0.1:3000/fetch/';

    private webSocketMessageQueue: IWebSocketMessage[] = [];
    
    public webSocketErrorOccurred: Rx.Subject<any> = new Rx.Subject<any>();

    public interactionsSchemeSubscribed: Rx.Subject<any> = new Rx.Subject<any>();    

    private webSocket: WebSocket = null;

    private webSocketReconnectTimeout: any = null;

    protected websocketErrorShown: boolean = false;
    
    protected abstract requestRestPath<T>(method: string, path: string, body: Object, success: number[]): Promise<T>;
    

    public websocketGetAccessToken(): Promise<IWebSocketToken> {
        return this.requestRestPath("GET", `/websocket/access_token`, {}, [200]);
    }

    // define function as property is needed to can set it as event listener (class methods is called with wrong this)
    protected reconnectWebSocketAfterTimeout = () => {
        // console.log('reconnectWebSocketAfterTimeout()');
        clearTimeout(this.webSocketReconnectTimeout);
        this.webSocketReconnectTimeout = setTimeout(() => {
            this.connectWebSocket();
        }, 5000);
    }

    protected disconnectWebSocket(): void {
        // console.log('disconnectWebSocket()');
        if (this.webSocket) {
            this.webSocket.removeEventListener('close', this.reconnectWebSocketAfterTimeout);
            this.webSocket.close();
        }
        this.webSocket = null;
    }

    public sendWebSocketMessage(message: IWebSocketMessage): void {
        this.webSocketMessageQueue.push(message);
        this.sendWebSocketMessageQueue();
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

    public requestBeckiSubscribe(): void {
        let message = {
            message_id: this.uuid(),
            message_channel: beckiCom.WS_CHANNEL,
            message_type: 'subscribe_becki'
        };
        if (!this.findEnqueuedWebSocketMessage(message, 'message_channel', 'message_type')) {
            this.sendWebSocketMessage(message);
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

    protected connectWebSocket(): void {
        // console.log('connectWebSocket()');


        this.disconnectWebSocket();

        this.websocketGetAccessToken()
            .then((webSocketToken: IWebSocketToken) => {

                this.websocketErrorShown = false;

                this.webSocket = new WebSocket(`${this.wsProtocol}://${this.host}/websocket/garfield/${webSocketToken.websocket_token}`);
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
                    .filter(message => (message && message.message_channel === beckiCom.WS_CHANNEL));
                let errorOccurred = Rx.Observable
                    .fromEvent(this.webSocket, 'error');

                opened.subscribe(() => {
                    this.requestBeckiSubscribe();
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
                    .map(message => console.log(message))
                    .subscribe(this.webSocketErrorOccurred);
                channelReceived
                    .filter(message => message.message_type === 'garfield')
                    .subscribe(this.interactionsSchemeSubscribed);
            
                errorOccurred
                    .subscribe(this.webSocketErrorOccurred);

            })
            .catch((error) => {
                if (!this.websocketErrorShown) {
                    this.websocketErrorShown = true;
                    this.webSocketErrorOccurred.next(error);
                }
                this.reconnectWebSocketAfterTimeout();
            });
    }

    public uuid(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            // tslint:disable-next-line:no-bitwise
            let r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

}
import {
    Becki, Request
} from './communication/Becki';
import { ConfigManager } from './utils/ConfigManager';
import { EventEmitter } from 'events';
import * as rp from 'request-promise';
import {Logger, LoggerClass, LoggerManager} from 'logger';
import { Router } from './utils/Router';
import {SerialServiceHandlerer} from './communication/serial_comp/SerialServiceHandlerer';

export class Garfield extends EventEmitter {

    /**************************************
     *                                    *
     * Public interface                   *
     *                                    *
     **************************************/

    public static readonly SHUTDOWN = 'shutdown';
    public static readonly AUTHORIZED = 'authorized';
    public static readonly UNAUTHORIZED = 'unauthorized';
    public static readonly NOTIFICATION = 'notification';
    public static readonly TESTER_CONNECTED = 'tester_connected';
    public static readonly TESTER_DISCONNECTED = 'tester_disconnected';
    public static readonly BECKI_SEND = 'becki_send';
    public static readonly BECKI_IS_CONNECTED = 'becki_connected';
    public static readonly BECKI_IS_DISCONNECTED = 'becki_disconnected';

    public person: IPerson;
    public path: string;                                // Path to Save File to USB Drive - Independent on serialHandlerer
    public serialHandlerer: SerialServiceHandlerer;     // Independent serial Handlerer with auto reconection etc..

    constructor(configManager: ConfigManager) {
        super();
        this.configManager = configManager;
        this.serialHandlerer = new SerialServiceHandlerer(this, configManager);


        // Set Logger
        if (!this.logger) {
            this.logger = LoggerManager.get('garfield_main');
            if (!this.logger) {
                this.logger = Logger;
            }
        }
    }

    /**
     * Connection To Tyrion Via Websocket
     * Response: Details About Person by Token
     * @param {string} token
     */
    public init(token: string): void {

        this.logger.info('Garfield::init - initiating with token:', token);
        let uri: string = (this.configManager.get<boolean>('tyrionSecured') ? 'https://' : 'http://') + this.configManager.get<string>('tyrionHost').trim() + '/login/person';
        this.logger.info('Garfield::init - path:', uri);
        rp({
            method: 'GET',
            uri: uri,
            body: {},
            json: true,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'garfield-app',
                'x-auth-token': token
            }
        }).then((body) => {
            this.person = body.person;
            this.authToken = token;
            this.initializeRouter();
            this.becki = new Becki(this.configManager, token, LoggerManager.get('websocket'));
            this.becki
                .on(Becki.OPEN, this.onBeckiConnected)
                .on(Becki.CLOSE, this.onBeckiDisconnected)
                .on(Becki.MESSAGE_RECEIVED, this.messageResolver);
            this.becki.connect();

            this.serialHandlerer.addListener(SerialServiceHandlerer.BECKI_SEND, this.becki.send.bind(this.becki));

            this.emit(Garfield.AUTHORIZED);
        }).catch((error) => {
            this.logger.error('Garfield::init - cannot retrieve person, error:', error.toString());
            this.logger.error('Garfield::init - cannot retrieve person, error:', JSON.stringify(error));
            if (error.hasOwnProperty('response')) {
                this.emit(Garfield.UNAUTHORIZED, 'Authorization was unsuccessful, response status ' + error.response.statusCode);
            } else if (error.hasOwnProperty('options')) {
                this.emit(Garfield.UNAUTHORIZED, 'Unable to connect to the remote server on ' + error.options.uri);
            } else {
                this.emit(Garfield.UNAUTHORIZED, 'Unauthorized, please login.');
            }
        });
    }

    public hasBecki(): boolean {
        return !!this.becki;
    }

    public getBecki(): Becki {
        return this.becki;
    }

    public hasTestKit(): boolean {
        if (this.serialHandlerer) {
            return this.serialHandlerer.hasTestKit();
        }else {
            return false;
        }
    }

    public reconnectBecki(): void {
        this.becki.connect();
    }

    public getAuth(): string {
        return this.authToken;
    }

    public hasAuth(): boolean {
        return !!this.authToken;
    }

    /**
     * Total Shutdown of application and required cleaning
     */
    public shutdown() {

        if (this.becki) {
            this.becki.disconnect();
            this.becki = null;
        }

        if (this.serialHandlerer) {
            this.serialHandlerer.disconnectTester();
            this.serialHandlerer = null;
        }

        this.authToken = null;

        this.emit(Garfield.SHUTDOWN);
    }

    /**
     *
     * Set callback to on open event
     *
     */
    public set onMenuChangeCallback(callback: ((e: any) => void)) {
        this._onMenuChangeCallback = callback;
    }

    /**
     * Optional Restat button for some stack situation
     */
    public reset() {

        if (this.becki) {
            this.becki.connect();
        } else {
            this.logger.error('Garfield::reset:: this.becki is null!');
        }

        if (this.serialHandlerer) {
            this.serialHandlerer.reset();
        } else {
            this.logger.error('Garfield::reset:: this.serialHandlerer is null!');
        }

    }

    private onBeckiConnected = () => {
        this.emit(Garfield.NOTIFICATION, 'Becki is connected.');
        this.emit(Garfield.BECKI_IS_CONNECTED);
    }

    private onBeckiDisconnected = () => {
        this.emit(Garfield.NOTIFICATION, 'Becki is disconnected.');
        this.emit(Garfield.BECKI_IS_DISCONNECTED);
    }

    private initializeRouter() {
        this.router = new Router();
        this.router.route['device_id'] = this.on_device_id;
        this.router.route['device_configure'] = this.on_device_configure;
        this.router.route['device_test'] = this.on_device_test;
        this.router.route['device_binary'] = this.on_device_binary;
        this.router.route['device_backup'] = this.on_device_backup;
    }

    private messageResolver = (data: any, response: (data: Object) => void) => {
        if (data.message_type && data.message_channel) {
            if (data.message_channel === Becki.WS_CHANNEL) {

                if (!this.router.resolve([data.message_type], <Request>{
                    data: data,
                    reply: response
                })) {
                    if (data.message_type !== 'token_web_view_verification' || data.message_type !== 'hardware_verification') {
                        this.logger.error('Garfield::messageResolver - unknownEndpoint: ' + data.message_type + ' - ' + data.message_channel, 'Possible routes: ', Object.keys(this.router.route));
                    }
                }
            }
        }
    }


    private on_device_id = (path: string[], request: Request): boolean => {
        if (this.serialHandlerer && this.serialHandlerer.hasTestKit()) {
            return this.serialHandlerer.getTesterKitDevice().getDeviceId(path, request);
        } else {
            request.reply({
                'status' : 'error',
                'error' : 'Test Kit is Offline',
            });
            return true;
        }
    }

    private on_device_configure = (path: string[], request: Request): boolean => {
        if (this.serialHandlerer && this.serialHandlerer.hasTestKit()) {
            return this.serialHandlerer.getTesterKitDevice().configureDevice(path, request);
        } else {
            request.reply({
                'status' : 'error',
                'error' : 'Test Kit is Offline',
            });
            return true;
        }
    }

    private on_device_test = (path: string[], request: Request): boolean => {
        if (this.serialHandlerer && this.serialHandlerer.hasTestKit()) {
            return this.serialHandlerer.getTesterKitDevice().testDevice(path, request);
        } else {
            request.reply({
                'status' : 'error',
                'error' : 'Test Kit is Offline',
            });
            return true;
        }
    }

    private on_device_binary = (path: string[], request: Request): boolean => {
        if (this.serialHandlerer && this.serialHandlerer.hasTestKit()) {
            return this.serialHandlerer.getTesterKitDevice().uploadBinary(path, request);
        } else {
            request.reply({
                'status' : 'error',
                'error' : 'Test Kit is Offline',
            });
            return true;
        }
    }

    private on_device_backup = (path: string[], request: Request): boolean => {
        if (this.serialHandlerer && this.serialHandlerer.hasTestKit()) {
            return this.serialHandlerer.getTesterKitDevice().backupDevice(path, request);
        } else {
            request.reply({
                'status' : 'error',
                'error' : 'Test Kit is Offline',
            });
            return true;
        }
    }



    protected _onMenuChangeCallback: ((e: any) => void);

    private deviceDetection;
    private router: Router;
    private becki: Becki;       // Object for communication with Becki
    private authToken: string;
    private configManager: ConfigManager;
    private logger: LoggerClass;
}

export interface IPerson {
    country: string;
    edit_permission: boolean;
    full_name: string;
    gender: string;
    id: string;
    mail: string;
    nick_name: string;
    picture_link: string;
}

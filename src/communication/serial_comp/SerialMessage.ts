import { EventEmitter } from 'events';

export class SerialMessage extends EventEmitter {

    public static readonly REPEAT = 'repeat';
    public static readonly TIMEOUT = 'timeout';

    constructor(target: ('ATE'|'DUT'), type: string, value?: string, timeout?: number, retry?: number, delay?: number) {
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
    private target: ('ATE'|'DUT');
    private type: string;
    private value: string;
    private timeout: number = 10000;
    private retry: number = 3;
    private delay: number;
}
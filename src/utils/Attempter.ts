/**
 *
 * Attempter is simple helper for repeating operations n times.
 *
 * When you call again() - it will automatically run action again
 * it counting tries and when attempts expired, it will call catch callback
 *
 */
export class Attempter {
    /**************************************
     *
     * Public interface
     *
     **************************************/

    public static readonly ATTEMPTS_EXPIRED = 'ATTEMPTS_EXPIRED';
    public static readonly ATTEMPTER_ATTEMPT_DELAY = 1000;

    /**
     * Creates new attempter with max tries count.
     * It automatically runs action in constructor and try it again,
     * when you call again function. When attempts expired, again function will return false
     */
    constructor(tries: number, action: () => void) {
        this.action = action;
        this.triesCounter = 0;
        this.triesMax = tries;
        this.again(0);
    }

    /**
     * Run action again
     */
    public again(delay: number = Attempter.ATTEMPTER_ATTEMPT_DELAY): boolean {
        if (!this.action) {
            return false;
        }

        if (this.againDelay) {
            clearTimeout(this.againDelay);
        }

        if (this.triesCounter < this.triesMax) {
            this.triesCounter++;

            if (delay) {
                this.againDelay = setTimeout(() => this.action(), delay);
            } else {
                this.action();
            }

            return true;
        } else if (this.catchCallback) {
            this.catchCallback(Attempter.ATTEMPTS_EXPIRED);
            this.catchCallback = null;
            this.action = null;
        }

        return false;
    }

    /**
     * Add callback for repeat fail
     */
    public catch(callback: (reason: string) => void) {
        this.catchCallback = callback;
    }

    /**
     * Get number af tries, that was already tried
     */
    public get tries(): number {
        return this.triesCounter;
    }

    /**************************************
     *
     * Protected interface
     *
     **************************************/

    protected action: () => void;
    protected triesCounter: number;
    protected triesMax: number;
    protected catchCallback: (reason: string) => void;

    protected againDelay: any;
}

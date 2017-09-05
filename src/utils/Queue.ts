/**
 * Base FIFO queue
 */

export class Queue<T> {
    /**************************************
     *
     * Public interface
     *
     **************************************/

    constructor() {
        this.reset();
    }

    /**
     * Push item into end of queue
     */
    public push(item: T) {
        this.queue.push(item);
    }

    /**
     * Pop first element (from begin) of queue
     */
    public pop(): T {
        return this.queue.shift();
    }

    /**
     * Insert item to specific position in list (0 - top)
     * Be careful, this is advanced function!
     * Think before use it
     */
    public insertToPosition(index: number, item: T) {
        this.queue.splice(index, 0, item);
    }

    /**
     * Get first of action in queue
     */
    public getTop(): T {
        return this.queue[0];
    }

    /**
     * Gets all items in queue
     * Its read only!
     */
    public get all(): T[] {
        return this.queue;
    }

    /**
     * Reset queue
     *
     * Clear all elements
     */
    public reset() {
        this.queue = [];
    }

    /**
     * Get if queue is empty
     */
    public isEmpty() {
        return this.queue.length === 0;
    }

    /**************************************
     *
     * Protected interface
     *
     **************************************/
    protected queue: T[];
}

/**
 *
 * Simple string array router
 *
 * You have to specify routes name in Router.route object.
 * Route can be Router instance or callback
 * You will get payload and remaining (not resolved routes) in callback args
 *
 */
export type ResolveCallback = (resolveData?: any) => void;
export type RejectCallback = (rejectData?: any) => void;
export type RouterCallback = (path: string[], payload: any, resolveFunc?: ResolveCallback, rejectFunc?: RejectCallback) => boolean;
export type RouterNoDataCallback = (path: string[], resolveFunc?: ResolveCallback, rejectFunc?: RejectCallback) => boolean;

export class Router {

    /**************************************
     *
     * Public interface
     *
     **************************************/
    public route: { [name: string]: (Router | RouterCallback | RouterNoDataCallback) };

    constructor() {
        this.route = {};
    }

    /**
     * Resolve presenter by path
     * It will go through presenters to the end of path
     * If return true, that means, resolved was successful
     */
    public resolve(path: string[], payload?: any, resolveFunc?: ResolveCallback, rejectFunc?: RejectCallback): boolean {
        const newPath = path.slice(0); // make copy
        return this.resolveInternal(newPath, payload, resolveFunc, rejectFunc);
    }

    /**************************************
     *
     * Protected interface
     *
     **************************************/

    /**
     * Resolve presenter by path
     * It will go through presenters to the end of path
     * If return true, that means, resolved was successful
     * It will consume path array!
     */
    protected resolveInternal(path: string[], payload: any, resolveFunc?: ResolveCallback, rejectFunc?: RejectCallback): boolean {
        const name = path.shift();

        if (name) {
            const route = this.route[name];

            if (!route) {
                return false;
            }

            if (route instanceof Router) {
                // if route is router
                return route.resolve(path, payload, resolveFunc, rejectFunc);
            } else if (route.length === 2) {
                // if route is callback function
                return (<RouterCallback>route)(path, payload);
            } else if (route.length === 4) {
                // if route is callback function
                return (<RouterCallback>route)(path, payload, resolveFunc, rejectFunc);
            } else if (route.length === 1) {
                // if route is callback function
                return (<RouterNoDataCallback>route)(path);
            } else if (route.length === 3) {
                // if route is callback function
                return (<RouterNoDataCallback>route)(path, resolveFunc, rejectFunc);
            }
        }

        return false;
    }
}

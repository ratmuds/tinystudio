export class EventEmitter {
    private listeners: Map<string, Set<{ cb: Function; once: boolean }>>;

    constructor() {
        this.listeners = new Map<
            string,
            Set<{ cb: Function; once: boolean }>
        >();
    }

    on(event: string, cb: Function): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)?.add({ cb, once: false });
    }

    once(event: string, cb: Function): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)?.add({ cb, once: true });
    }

    off(event: string, cb: Function): void {
        const listeners = this.listeners.get(event);
        if (listeners) {
            for (const listener of listeners) {
                if (listener.cb === cb) {
                    listeners.delete(listener);
                    break;
                }
            }
        }
    }

    emit(event: string, ...args: any[]): void {
        const listeners = this.listeners.get(event);
        if (listeners) {
            for (const listener of Array.from(listeners)) {
                listener.cb(...args);
                if (listener.once) {
                    listeners.delete(listener);
                }
            }
        }
    }

    clear(): void {
        this.listeners.clear();
    }
}

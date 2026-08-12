export interface EventScheduler {
    schedule(callback: Function, args: any[]): void;
}

export class EventEmitter {
    private nextId = 0;
    private listeners: Map<
        string,
        { event: string; cb: Function; once: boolean; scheduler?: EventScheduler }
    >;
    private eventIndex: Map<string, Set<string>>;

    constructor() {
        this.listeners = new Map();
        this.eventIndex = new Map();
    }

    on(event: string, cb: Function, scheduler?: EventScheduler): string {
        const id = String(this.nextId++);
        this.listeners.set(id, { event, cb, once: false, scheduler });
        if (!this.eventIndex.has(event)) {
            this.eventIndex.set(event, new Set());
        }
        this.eventIndex.get(event)!.add(id);
        return id;
    }

    once(event: string, cb: Function, scheduler?: EventScheduler): string {
        const id = String(this.nextId++);
        this.listeners.set(id, { event, cb, once: true, scheduler });
        if (!this.eventIndex.has(event)) {
            this.eventIndex.set(event, new Set());
        }
        this.eventIndex.get(event)!.add(id);
        return id;
    }

    off(id: string): void {
        const listener = this.listeners.get(id);
        if (listener) {
            this.listeners.delete(id);
            const ids = this.eventIndex.get(listener.event);
            if (ids) {
                ids.delete(id);
                if (ids.size === 0) this.eventIndex.delete(listener.event);
            }
        }
    }

    emit(event: string, ...args: any[]): void {
        const ids = this.eventIndex.get(event);
        if (!ids) return;
        for (const id of Array.from(ids)) {
            const listener = this.listeners.get(id);
            if (!listener) continue;
            if (listener.scheduler) {
                listener.scheduler.schedule(listener.cb, args);
            } else {
                listener.cb(...args);
            }
            if (listener.once) {
                this.listeners.delete(id);
                ids.delete(id);
            }
        }
        if (ids.size === 0) this.eventIndex.delete(event);
    }

    clear(): void {
        this.listeners.clear();
        this.eventIndex.clear();
    }
}

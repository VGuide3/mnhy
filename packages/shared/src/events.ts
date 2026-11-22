export type EventListener<Payload> = (payload: Payload) => void;

type AnyListener = (payload: never) => void;

export class EventEmitter<Events extends object> {
  private readonly listeners = new Map<keyof Events, Set<AnyListener>>();

  on<K extends keyof Events>(event: K, listener: EventListener<Events[K]>): this {
    const listeners = this.listeners.get(event) ?? new Set<AnyListener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  off<K extends keyof Events>(event: K, listener: EventListener<Events[K]>): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  once<K extends keyof Events>(event: K, listener: EventListener<Events[K]>): this {
    const wrapper: EventListener<Events[K]> = (payload) => {
      this.off(event, wrapper);
      listener(payload);
    };
    return this.on(event, wrapper);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): boolean {
    const listeners = this.listeners.get(event);
    if (!listeners || listeners.size === 0) return false;

    for (const listener of [...listeners]) {
      (listener as EventListener<Events[K]>)(payload);
    }
    return true;
  }

  removeAllListeners(event?: keyof Events): this {
    if (event === undefined) {
      this.listeners.clear();
    } else {
      this.listeners.delete(event);
    }
    return this;
  }

  listenerCount(event: keyof Events): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}

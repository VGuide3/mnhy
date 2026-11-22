import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from './events.js';

interface TestEvents {
  message: { value: number };
  done: undefined;
}

describe('EventEmitter', () => {
  it('delivers events to listeners and reports listener counts', () => {
    const emitter = new EventEmitter<TestEvents>();
    const listener = vi.fn();

    expect(emitter.listenerCount('message')).toBe(0);
    emitter.on('message', listener);
    expect(emitter.listenerCount('message')).toBe(1);
    expect(emitter.emit('message', { value: 42 })).toBe(true);
    expect(listener).toHaveBeenCalledWith({ value: 42 });

    emitter.off('message', listener);
    expect(emitter.emit('message', { value: 1 })).toBe(false);
  });

  it('supports one-shot listeners', () => {
    const emitter = new EventEmitter<TestEvents>();
    const listener = vi.fn();

    emitter.once('message', listener);
    emitter.emit('message', { value: 1 });
    emitter.emit('message', { value: 2 });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ value: 1 });
  });

  it('removes listeners for one event or all events', () => {
    const emitter = new EventEmitter<TestEvents>();
    const messageListener = vi.fn();
    const doneListener = vi.fn();

    emitter.on('message', messageListener).on('done', doneListener);
    emitter.removeAllListeners('message');

    expect(emitter.listenerCount('message')).toBe(0);
    expect(emitter.listenerCount('done')).toBe(1);

    emitter.removeAllListeners();
    expect(emitter.listenerCount('done')).toBe(0);
  });
});

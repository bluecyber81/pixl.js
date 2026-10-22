// The browser companion needs a small synchronous dispatcher, not Node's
// EventEmitter or bundler-provided Node polyfills.
class EventDispatcher {
    constructor() {
        this.listeners = Object.create(null);
    }

    addListener(name, listener) {
        if (typeof listener !== 'function') throw new TypeError('Listener must be a function');
        if (!this.listeners[name]) this.listeners[name] = [];
        this.listeners[name].push(listener);
        return this;
    }

    on(name, listener) {
        return this.addListener(name, listener);
    }

    removeListener(name, listener) {
        const listeners = this.listeners[name];
        if (!listeners) return this;
        const index = listeners.lastIndexOf(listener);
        if (index !== -1) listeners.splice(index, 1);
        if (listeners.length === 0) delete this.listeners[name];
        return this;
    }

    off(name, listener) {
        return this.removeListener(name, listener);
    }

    listenerCount(name) {
        return this.listeners[name] ? this.listeners[name].length : 0;
    }

    emit(name, ...args) {
        const listeners = this.listeners[name];
        if (!listeners) return false;
        // Mutating subscriptions inside a listener affects the next emission.
        listeners.slice().forEach(listener => listener.apply(this, args));
        return true;
    }
}

var eventDispatcher = new EventDispatcher();

export function sharedEventDispatcher() {
    return eventDispatcher;
}

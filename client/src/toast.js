// Lightweight pub-sub so any component can trigger a toast without prop drilling
// or React context — mirrors the singleton pattern already used for `socket`/`api`.
const listeners = new Set();

export function showToast(message, type = 'error') {
    const toast = { id: `${Date.now()}-${Math.random()}`, message, type };
    listeners.forEach(fn => fn(toast));
}

export function subscribeToast(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

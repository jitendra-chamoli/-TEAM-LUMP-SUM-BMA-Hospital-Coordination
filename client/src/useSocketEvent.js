import { useEffect, useRef } from 'react';
import { socket } from './api';

// Subscribes to one socket event for the lifetime of the component. Removes
// only its own listener on unmount, so other components listening to the same
// event keep working. The latest handler is always used without re-subscribing.
export function useSocketEvent(event, handler) {
    const handlerRef = useRef(handler);

    useEffect(() => {
        handlerRef.current = handler;
    });

    useEffect(() => {
        const listener = (...args) => handlerRef.current(...args);
        socket.on(event, listener);
        return () => socket.off(event, listener);
    }, [event]);
}

declare module 'node-global-key-listener' {
    export interface IGlobalKeyEvent {
        keycode: number;
        name: string;
        state: 'DOWN' | 'UP';
        rawcode: number;
        altKey: boolean;
        shiftKey: boolean;
        ctrlKey: boolean;
        metaKey: boolean;
        modifiers: string[];
    }

    export class GlobalKeyboardListener {
        constructor();
        addListener(callback: (e: IGlobalKeyEvent, isDown: boolean) => void): void;
        removeListener(callback: (e: IGlobalKeyEvent, isDown: boolean) => void): void;
        start(): void;
        stop(): void;
        kill(): void;
    }
} 
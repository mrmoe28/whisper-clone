declare module 'robotjs' {
    export function setKeyboardDelay(ms: number): void;
    export function typeString(string: string): void;
    export function keyTap(key: string, modifier?: string | string[]): void;
    export function keyToggle(key: string, down: 'down' | 'up', modifier?: string | string[]): void;
    export function getPixelColor(x: number, y: number): string;
    export function getScreenSize(): { width: number; height: number };
    export function moveMouse(x: number, y: number): void;
    export function mouseClick(button?: string, double?: boolean): void;
    export function mouseToggle(down?: 'down' | 'up', button?: string): void;
    export function dragMouse(x: number, y: number): void;
    export function scrollMouse(x: number, y: number): void;
} 
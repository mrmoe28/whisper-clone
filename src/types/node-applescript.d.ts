declare module 'applescript' {
    export function execString(script: string, callback: (err: Error | null, result: any) => void): void;
    export function execFile(scriptPath: string, callback: (err: Error | null, result: any) => void): void;
    
    // Promise-based versions
    export function execStringPromise(script: string): Promise<any>;
    export function execFilePromise(scriptPath: string): Promise<any>;
} 
declare module 'circomlibjs' {
  export function buildPoseidon(): Promise<any>;
}

declare module '*circomlibjs/main.js' {
  export function buildPoseidon(): Promise<any>;
}

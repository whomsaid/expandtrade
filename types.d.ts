declare module 'jsonwebtoken' {
  export function sign(payload: string | object | Buffer, secretOrPrivateKey: string, options?: Record<string, any>): string;
  export function verify(token: string, secretOrPublicKey: string): Record<string, any>;
}

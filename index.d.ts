declare module 'canvas-confetti' {
  export interface IOptions {
    particleCount: number;
    angle: number;
    spread: number;
    startVelocity: number;
    decay: number;
    gravity: number;
    ticks: number;
    origin: {
      x: number;
      y: number;
    };
    colors: string[];
    shapes: ('circle' | 'square')[];
    scalar: number;
    zIndex: number;
    disableForReducedMotion: boolean;
  }

  export interface IGlobalOptions {
    resize: boolean;
    useWorker: boolean;
    disableForReducedMotion: boolean;
  }

  export type TResetFn = () => void;
  export type TFireFn = (opts: Partial<IOptions>) => Promise<undefined>;
  export type TFire = TFireFn & { reset: TResetFn };
  export type TConfettiCannonFn = (globalOptions?: Partial<IGlobalOptions>) => TFire;
  export type TConfettiCannonCreateFn = (canvas: HTMLCanvasElement, globalOptions?: Partial<IGlobalOptions>) => TFire;

  const module: TConfettiCannonFn & { create: TConfettiCannonCreateFn };

  export default module;
}

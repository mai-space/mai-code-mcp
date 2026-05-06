import _pino from 'pino';
// pino ships as a CJS module; cast needed for ESM/NodeNext interop
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pino = _pino as unknown as (opts: unknown) => _pino.Logger;

export const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
});

export default logger;

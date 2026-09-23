/**
 * Lightweight, zero-dependency bounded concurrency limiter.
 * Implements a FIFO promise queue to strictly cap concurrent asynchronous tasks.
 */
export interface Limiter {
  <T>(fn: () => Promise<T>): Promise<T>;
  readonly activeCount: number;
  readonly pendingCount: number;
}

export function createLimiter(concurrency: number): Limiter {
  if (concurrency < 1) {
    throw new Error(`Concurrency must be at least 1, received ${concurrency}`);
  }

  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    active--;
    if (queue.length > 0) {
      active++;
      const resolveNext = queue.shift()!;
      resolveNext();
    }
  };

  const limiter = async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= concurrency) {
      await new Promise<void>((resolve) => {
        queue.push(resolve);
      });
    } else {
      active++;
    }

    try {
      return await fn();
    } finally {
      next();
    }
  };

  Object.defineProperty(limiter, "activeCount", {
    get: () => active,
  });

  Object.defineProperty(limiter, "pendingCount", {
    get: () => queue.length,
  });

  return limiter as Limiter;
}

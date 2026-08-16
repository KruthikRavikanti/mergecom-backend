import Redis from 'ioredis';

export type DependencyStatus = 'ready' | 'unavailable';
export type ReadinessDependencies = Record<string, DependencyStatus>;

export interface WorkerReadinessProbe {
  (): Promise<ReadinessDependencies>;
  close?: () => Promise<void>;
}

export function createRedisReadinessProbe(
  redisUrl: string | undefined,
): WorkerReadinessProbe {
  if (!redisUrl) return () => Promise.resolve({ redis: 'unavailable' });

  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
  });
  const probe: WorkerReadinessProbe = async () => {
    try {
      if (redis.status === 'wait') await redis.connect();
      return {
        redis: (await redis.ping()) === 'PONG' ? 'ready' : 'unavailable',
      };
    } catch {
      return { redis: 'unavailable' };
    }
  };
  probe.close = () => {
    redis.disconnect();
    return Promise.resolve();
  };
  return probe;
}

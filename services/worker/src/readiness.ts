import Redis from 'ioredis';

export interface RedisReadinessProbe {
  (): Promise<'ready' | 'unavailable'>;
  close?: () => Promise<void>;
}

export function createRedisReadinessProbe(
  redisUrl: string | undefined,
): RedisReadinessProbe {
  if (!redisUrl) return () => Promise.resolve('unavailable');

  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
  });
  const probe: RedisReadinessProbe = async () => {
    try {
      if (redis.status === 'wait') await redis.connect();
      return (await redis.ping()) === 'PONG' ? 'ready' : 'unavailable';
    } catch {
      return 'unavailable';
    }
  };
  probe.close = () => {
    redis.disconnect();
    return Promise.resolve();
  };
  return probe;
}

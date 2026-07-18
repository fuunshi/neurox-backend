import { InjectRedis } from "@nestjs-modules/ioredis";
import { Injectable } from "@nestjs/common";
import type { Redis } from "ioredis";

@Injectable()
export class RedisService {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  // -----------------------
  // Basic key-value operations
  // -----------------------

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const serialized = this.serialize(value);

    if (ttlSeconds !== undefined) {
      await this.redis.set(key, serialized, "EX", ttlSeconds);
      return;
    }

    await this.redis.set(key, serialized);
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    if (value === null) return null;

    return this.deserialize<T>(value);
  }

  async del(key: string): Promise<number> {
    return this.redis.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.redis.exists(key);
    return result === 1;
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.expire(key, ttlSeconds);
    return result === 1;
  }

  async ttl(key: string): Promise<number> {
    return this.redis.ttl(key);
  }

  // -----------------------
  // Hash operations
  // -----------------------

  async hset(
    key: string,
    field: string | Record<string, string>,
    value?: string,
  ): Promise<void> {
    if (typeof field === "string") {
      if (value === undefined) {
        throw new Error("HSET requires a value when field is a string");
      }
      await this.redis.hset(key, field, value);
      return;
    }

    await this.redis.hset(key, field);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.redis.hget(key, field);
  }

  async hgetAll(key: string): Promise<Record<string, string>> {
    return this.redis.hgetall(key);
  }

  // -----------------------
  // Cache helper
  // -----------------------

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds?: number,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const value = await factory();
    await this.set(key, value, ttlSeconds);

    return value;
  }

  // -----------------------
  // Helpers
  // -----------------------

  private serialize(value: unknown): string {
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  }

  private deserialize<T>(value: string): T {
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }
}

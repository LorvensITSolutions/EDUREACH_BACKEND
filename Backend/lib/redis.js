import Redis from "ioredis"
import dotenv from "dotenv";

dotenv.config()

// Redis connection using Upstash
export const redis = new Redis(process.env.UPSTASH_REDIS_URL);

// Redis connection event handlers
redis.on('connect', () => {
  console.log('✅ Redis connected successfully');
});

redis.on('error', (err) => {
  console.error('❌ Redis connection error:', err);
});

redis.on('close', () => {
  console.log('🔌 Redis connection closed');
});

// Cache utility functions
export const cache = {
  // Set cache with TTL (Time To Live) in seconds
  async set(key, value, ttl = 300) {
    try {
      const serializedValue = JSON.stringify(value);
      if (ttl > 0) {
        await redis.setex(key, ttl, serializedValue);
      } else {
        await redis.set(key, serializedValue);
      }
      return true;
    } catch (error) {
      console.error('Redis SET error:', error);
      return false;
    }
  },

  // Get cache value
  async get(key) {
    try {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Redis GET error:', error);
      return null;
    }
  },

  // Delete cache
  async del(key) {
    try {
      await redis.del(key);
      return true;
    } catch (error) {
      console.error('Redis DEL error:', error);
      return false;
    }
  },

  // Delete multiple keys with pattern
  async delPattern(pattern) {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      return true;
    } catch (error) {
      console.error('Redis DEL pattern error:', error);
      return false;
    }
  },

  // Check if key exists
  async exists(key) {
    try {
      const result = await redis.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Redis EXISTS error:', error);
      return false;
    }
  },

  // Get TTL of a key
  async ttl(key) {
    try {
      return await redis.ttl(key);
    } catch (error) {
      console.error('Redis TTL error:', error);
      return -1;
    }
  },

  // Increment a key
  async incr(key) {
    try {
      return await redis.incr(key);
    } catch (error) {
      console.error('Redis INCR error:', error);
      return null;
    }
  },

  // Set multiple key-value pairs
  async mset(keyValuePairs) {
    try {
      const serializedPairs = [];
      for (const [key, value] of Object.entries(keyValuePairs)) {
        serializedPairs.push(key, JSON.stringify(value));
      }
      await redis.mset(...serializedPairs);
      return true;
    } catch (error) {
      console.error('Redis MSET error:', error);
      return false;
    }
  },

  // Get multiple keys
  async mget(keys) {
    try {
      const values = await redis.mget(...keys);
      return values.map(value => value ? JSON.parse(value) : null);
    } catch (error) {
      console.error('Redis MGET error:', error);
      return [];
    }
  }
};

// Cache key generators
export const cacheKeys = {
  students: {
    list: (filters = {}) => {
      const filterString = Object.entries(filters)
        .filter(([_, value]) => value !== undefined && value !== '')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}:${value}`)
        .join('|');
      return `students:list:${filterString || 'all'}`;
    },
    count: (filters = {}) => {
      const filterString = Object.entries(filters)
        .filter(([_, value]) => value !== undefined && value !== '')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}:${value}`)
        .join('|');
      return `students:count:${filterString || 'all'}`;
    },
    detail: (id) => `students:detail:${id}`,
    summary: () => 'students:summary',
  },
  teachers: {
    list: (filters = {}) => {
      const filterString = Object.entries(filters)
        .filter(([_, value]) => value !== undefined && value !== '')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}:${value}`)
        .join('|');
      return `teachers:list:${filterString || 'all'}`;
    },
    count: (filters = {}) => {
      const filterString = Object.entries(filters)
        .filter(([_, value]) => value !== undefined && value !== '')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}:${value}`)
        .join('|');
      return `teachers:count:${filterString || 'all'}`;
    },
    detail: (id) => `teachers:detail:${id}`,
    summary: () => 'teachers:summary',
  },
  school: {
    config: () => 'school:config',
  },
  analytics: {
    dashboard: (date = '', academicYear = '') => `analytics:dashboard:${academicYear}:${date}`,
    realTime: (date = '', academicYear = '') => `analytics:realtime:${academicYear}:${date}`,
    alerts: (academicYear = '') => `analytics:alerts:${academicYear}`,
    feeCollection: (filters = {}) => {
      const filterString = Object.entries(filters)
        .filter(([_, value]) => value !== undefined && value !== '')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}:${value}`)
        .join('|');
      return `analytics:feecollection:${filterString || 'all'}`;
    },
    paymentMethods: (academicYear = '') => `analytics:paymentmethods:${academicYear}`,
    attendance: {
      student: (filters = {}) => {
        const filterString = Object.entries(filters)
          .filter(([_, value]) => value !== undefined && value !== '')
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => `${key}:${value}`)
          .join('|');
        return `analytics:attendance:student:${filterString || 'all'}`;
      },
      teacher: (filters = {}) => {
        const filterString = Object.entries(filters)
          .filter(([_, value]) => value !== undefined && value !== '')
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => `${key}:${value}`)
          .join('|');
        return `analytics:attendance:teacher:${filterString || 'all'}`;
      },
      comparative: (filters = {}) => {
        const filterString = Object.entries(filters)
          .filter(([_, value]) => value !== undefined && value !== '')
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => `${key}:${value}`)
          .join('|');
        return `analytics:attendance:comparative:${filterString || 'all'}`;
      },
      inspection: (filters = {}) => {
        const filterString = Object.entries(filters)
          .filter(([_, value]) => value !== undefined && value !== '')
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => `${key}:${value}`)
          .join('|');
        return `analytics:attendance:inspection:${filterString || 'all'}`;
      }
    },
    performance: {
      teacher: (filters = {}) => {
        const filterString = Object.entries(filters)
          .filter(([_, value]) => value !== undefined && value !== '')
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => `${key}:${value}`)
          .join('|');
        return `analytics:performance:teacher:${filterString || 'all'}`;
      },
      trends: (filters = {}) => {
        const filterString = Object.entries(filters)
          .filter(([_, value]) => value !== undefined && value !== '')
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => `${key}:${value}`)
          .join('|');
        return `analytics:performance:trends:${filterString || 'all'}`;
      }
    },
    incomeExpense: (filters = {}) => {
      const filterString = Object.entries(filters)
        .filter(([_, value]) => value !== undefined && value !== '')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}:${value}`)
        .join('|');
      return `analytics:incomeexpense:${filterString || 'all'}`;
    },
    annualFee: (academicYear = '') => `analytics:annualfee:${academicYear}`
  }
};

// Cache invalidation helpers
export const invalidateCache = {
  students: async () => {
    await cache.delPattern('students:*');
  },
  student: async (studentId) => {
    await cache.del(cacheKeys.students.detail(studentId));
    await cache.delPattern('students:list:*');
    await cache.delPattern('students:count:*');
    await cache.del(cacheKeys.students.summary());
  },
  teachers: async () => {
    await cache.delPattern('teachers:*');
  },
  teacher: async (teacherId) => {
    await cache.del(cacheKeys.teachers.detail(teacherId));
    await cache.delPattern('teachers:list:*');
    await cache.delPattern('teachers:count:*');
    await cache.del(cacheKeys.teachers.summary());
  },
  school: async () => {
    await cache.del(cacheKeys.school.config());
  },
  analytics: async () => {
    await cache.delPattern('analytics:*');
  },
  dashboard: async (academicYear = '') => {
    await cache.delPattern(`analytics:dashboard:${academicYear}:*`);
    await cache.delPattern(`analytics:realtime:${academicYear}:*`);
  },
  attendance: async () => {
    await cache.delPattern('analytics:attendance:*');
  },
  fees: async () => {
    await cache.delPattern('analytics:feecollection:*');
    await cache.delPattern('analytics:paymentmethods:*');
    await cache.delPattern('analytics:incomeexpense:*');
    await cache.delPattern('analytics:annualfee:*');
  },
  performance: async () => {
    await cache.delPattern('analytics:performance:*');
  }
};

// Test connection
try {
  await redis.set('foo', 'bar');
  console.log('🔗 Redis connection test successful');
} catch (error) {
  console.error('❌ Redis connection test failed:', error);
}
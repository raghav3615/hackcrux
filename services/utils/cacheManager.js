/**
 * Cache management service for storing and retrieving data
 * with expiration times to reduce API calls and improve performance
 */

// Cache storage with Map for O(1) lookups
const cache = new Map();

// Default cache options
const DEFAULT_OPTIONS = {
  maxSize: 100,          // Maximum number of items to store
  defaultTTL: 60 * 1000, // Default time-to-live: 60 seconds
  cleanupInterval: 5 * 60 * 1000 // Run cleanup every 5 minutes
};

// Configuration
let options = { ...DEFAULT_OPTIONS };
let cleanupTimer = null;

/**
 * Initialize the cache manager with options
 * @param {Object} customOptions - Custom configuration options
 */
function initialize(customOptions = {}) {
  options = { ...DEFAULT_OPTIONS, ...customOptions };
  console.log('Cache manager initialized with options:', options);
  
  // Set up automatic cleanup
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
  }
  
  cleanupTimer = setInterval(() => {
    cleanup();
  }, options.cleanupInterval);
}

/**
 * Set an item in the cache
 * @param {string} key - Cache key
 * @param {any} value - Value to store
 * @param {number} ttl - Time to live in milliseconds (optional)
 * @returns {boolean} Success status
 */
function set(key, value, ttl = options.defaultTTL) {
  try {
    if (!key) {
      console.error('Cannot set cache item with empty key');
      return false;
    }
    
    // Enforce cache size limit - remove oldest item if full
    if (cache.size >= options.maxSize && !cache.has(key)) {
      const oldestKey = getOldestKey();
      if (oldestKey) {
        cache.delete(oldestKey);
      }
    }
    
    cache.set(key, {
      value,
      expires: Date.now() + ttl,
      timestamp: Date.now()
    });
    
    return true;
  } catch (error) {
    console.error('Error setting cache item:', error);
    return false;
  }
}

/**
 * Get an item from the cache
 * @param {string} key - Cache key
 * @returns {any|null} Cached value or null if not found or expired
 */
function get(key) {
  try {
    if (!key || !cache.has(key)) {
      return null;
    }
    
    const item = cache.get(key);
    
    // Check if item has expired
    if (item.expires < Date.now()) {
      cache.delete(key);
      return null;
    }
    
    return item.value;
  } catch (error) {
    console.error('Error getting cache item:', error);
    return null;
  }
}

/**
 * Check if a key exists and is not expired
 * @param {string} key - Cache key
 * @returns {boolean} Whether the key exists
 */
function has(key) {
  try {
    if (!key || !cache.has(key)) {
      return false;
    }
    
    const item = cache.get(key);
    
    // Check if item has expired
    if (item.expires < Date.now()) {
      cache.delete(key);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error checking cache key:', error);
    return false;
  }
}

/**
 * Remove an item from the cache
 * @param {string} key - Cache key
 * @returns {boolean} Success status
 */
function remove(key) {
  try {
    return cache.delete(key);
  } catch (error) {
    console.error('Error removing cache item:', error);
    return false;
  }
}

/**
 * Clear all items from the cache
 * @returns {boolean} Success status
 */
function clear() {
  try {
    cache.clear();
    return true;
  } catch (error) {
    console.error('Error clearing cache:', error);
    return false;
  }
}

/**
 * Get current cache size
 * @returns {number} Number of items in cache
 */
function size() {
  return cache.size;
}

/**
 * Get statistics about the cache
 * @returns {Object} Cache statistics
 */
function getStats() {
  const now = Date.now();
  let expiredCount = 0;
  let totalSize = 0;
  
  // Calculate stats
  cache.forEach(item => {
    if (item.expires < now) {
      expiredCount++;
    }
    
    // Estimate size (rough approximation)
    try {
      totalSize += JSON.stringify(item).length;
    } catch (e) {
      // If not serializable, make a rough guess
      totalSize += 1000;
    }
  });
  
  return {
    count: cache.size,
    expiredCount,
    totalSizeBytes: totalSize,
    maxSize: options.maxSize,
    defaultTTL: options.defaultTTL
  };
}

/**
 * Remove expired items from the cache
 * @returns {number} Number of items removed
 */
function cleanup() {
  const now = Date.now();
  let removedCount = 0;
  
  // Find and remove expired items
  cache.forEach((item, key) => {
    if (item.expires < now) {
      cache.delete(key);
      removedCount++;
    }
  });
  
  if (removedCount > 0) {
    console.log(`Cache cleanup: removed ${removedCount} expired items`);
  }
  
  return removedCount;
}

/**
 * Find the oldest item in the cache
 * @returns {string|null} Oldest item key or null if cache is empty
 */
function getOldestKey() {
  if (cache.size === 0) {
    return null;
  }
  
  let oldestKey = null;
  let oldestTimestamp = Infinity;
  
  cache.forEach((item, key) => {
    if (item.timestamp < oldestTimestamp) {
      oldestTimestamp = item.timestamp;
      oldestKey = key;
    }
  });
  
  return oldestKey;
}

/**
 * Set multiple items in the cache at once
 * @param {Object} items - Key-value pairs to cache
 * @param {number} ttl - Time to live in milliseconds (optional)
 * @returns {boolean} Success status
 */
function setMultiple(items, ttl = options.defaultTTL) {
  try {
    if (!items || typeof items !== 'object') {
      return false;
    }
    
    let success = true;
    for (const [key, value] of Object.entries(items)) {
      if (!set(key, value, ttl)) {
        success = false;
      }
    }
    
    return success;
  } catch (error) {
    console.error('Error setting multiple cache items:', error);
    return false;
  }
}

/**
 * Get multiple items from the cache
 * @param {Array} keys - Array of keys to retrieve
 * @returns {Object} Object with key-value pairs of found items
 */
function getMultiple(keys) {
  try {
    if (!Array.isArray(keys)) {
      return {};
    }
    
    const result = {};
    keys.forEach(key => {
      const value = get(key);
      if (value !== null) {
        result[key] = value;
      }
    });
    
    return result;
  } catch (error) {
    console.error('Error getting multiple cache items:', error);
    return {};
  }
}

/**
 * Remove multiple items from the cache
 * @param {Array} keys - Array of keys to remove
 * @returns {boolean} Success status
 */
function removeMultiple(keys) {
  try {
    if (!Array.isArray(keys)) {
      return false;
    }
    
    let success = true;
    keys.forEach(key => {
      if (!remove(key)) {
        success = false;
      }
    });
    
    return success;
  } catch (error) {
    console.error('Error removing multiple cache items:', error);
    return false;
  }
}

// Export the API
module.exports = {
  initialize,
  set,
  get,
  has,
  remove,
  clear,
  size,
  getStats,
  cleanup,
  setMultiple,
  getMultiple,
  removeMultiple
};
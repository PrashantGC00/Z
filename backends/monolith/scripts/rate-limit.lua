local bucket = redis.call("HMGET", KEYS[1], "tokens", "ts")

local capacity = tonumber(ARGV[1])
local refillPerSecond = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local tokens = tonumber(bucket[1])
local ts = tonumber(bucket[2])

if tokens == nil then
  tokens = capacity
  ts = now
end

local effectiveNow = math.max(now, ts)
local elapsed = (effectiveNow - ts) / 1000

tokens = math.min(capacity, tokens + elapsed * refillPerSecond)

local allowed = 0
local retryAfterSeconds = 0

if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
else
  retryAfterSeconds = math.ceil((1 - tokens) / refillPerSecond)
end

redis.call("HSET", KEYS[1], "tokens", tokens, "ts", effectiveNow)

local ttl = math.ceil((capacity / refillPerSecond) * 1000)
redis.call("PEXPIRE", KEYS[1], ttl)

return { allowed, retryAfterSeconds }

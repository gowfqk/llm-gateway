-- 为 providers 表添加 proxy_json 列
ALTER TABLE providers 
ADD COLUMN IF NOT EXISTS proxy_json JSONB DEFAULT NULL;

-- 为 usage_records 表添加需要的列（如果不存在）
ALTER TABLE usage_records 
ADD COLUMN IF NOT EXISTS response_headers JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS error_message TEXT DEFAULT NULL;

-- 为 route_rules 表添加需要的列（如果不存在）
ALTER TABLE route_rules 
ADD COLUMN IF NOT EXISTS headers JSONB DEFAULT NULL;

-- 为 gateway_configs 表添加需要的列（如果不存在）
ALTER TABLE gateway_configs 
ADD COLUMN IF NOT EXISTS rate_limit INT DEFAULT 1000,
ADD COLUMN IF NOT EXISTS cache_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS cache_ttl INT DEFAULT 300;

-- 添加注释
COMMENT ON COLUMN providers.proxy_json IS '独立代理配置 JSON';
COMMENT ON COLUMN usage_records.response_headers IS '响应头信息 JSON';
COMMENT ON COLUMN usage_records.error_message IS '错误消息';
COMMENT ON COLUMN route_rules.headers IS '请求头配置 JSON';
COMMENT ON COLUMN gateway_configs.rate_limit IS '全局请求速率限制';
COMMENT ON COLUMN gateway_configs.cache_enabled IS '是否启用缓存';
COMMENT ON COLUMN gateway_configs.cache_ttl IS '缓存过期时间（秒）';

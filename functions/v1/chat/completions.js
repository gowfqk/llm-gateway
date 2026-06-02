     1|/**
     2| * POST /v1/chat/completions — OpenAI 兼容的 Chat Completions 端点
     3| * 
     4| * 支持流式和非流式响应，根据路由规则自动选择供应商
     5| * 认证：Bearer <gateway_api_key>
     6| */
     7|import {
     8|  corsHeaders, jsonResponse, errorResponse,
     9|  validateApiKey, getProviders, getRoutes,
    10|  resolveProvider, resolveProviderCandidates, resolveModelAlias, isModelAllowed,
    11|  buildUpstreamUrl, buildUpstreamHeaders,
    12|  buildUpstreamBody, convertAnthropicResponse, convertGoogleResponse, convertCohereResponse,
    13|  handleStreamRequest, logUsage, gatewayFetch, generateRequestId,
    14|} from "../_lib.js";
    15|
    16|export async function onRequestPost(context) {
    17|  // --- 生成请求 ID ---
    18|  const incomingRequestId = context.request.headers.get("x-request-id");
    19|  const requestId = incomingRequestId || generateRequestId();
    20|  const requestIdHeaders = { "x-request-id": requestId };
    21|
    22|  // --- 认证 ---
    23|  const authResult = await validateApiKey(context.request, context.env);
    24|  if (!authResult.isValid) {
    25|    return errorResponse("Invalid API key. Provide a valid Bearer token in Authorization header.", 401, requestIdHeaders);
    26|  }
    27|  const { userId } = authResult;
    28|
    29|  try {
    30|    const body = await context.request.json();
    31|    const model = body.model;
    32|    if (!model) {
    33|      return errorResponse("Missing required parameter: 'model'", 400, requestIdHeaders);
    34|    }
    35|
    36|    // --- 加载供应商和路由配置 ---
    37|    const [providers, routes] = await Promise.all([
    38|      getProviders(context.env),
    39|      getRoutes(context.env),
    40|    ]);
    41|
    42|    if (!providers || providers.length === 0) {
    43|      return errorResponse("No providers configured. Please add providers in the dashboard.", 503, requestIdHeaders);
    44|    }
    45|
    46|    // --- 模型别名解析 ---
    47|    let resolvedModel = model;
    48|    let pinnedProvider = null;
    49|    const aliasResult = resolveModelAlias(model, providers);
    50|    if (aliasResult) {
    51|      resolvedModel = aliasResult.actualModel;
    52|      pinnedProvider = aliasResult.pinnedProvider || null;
    53|      if (pinnedProvider) {
    54|        console.log(`[alias] "${model}" → "${pinnedProvider.name}/${resolvedModel}" (pinned provider)`);
    55|      } else {
    56|        console.log(`[alias] "${model}" → "${resolvedModel}" (via ${aliasResult.provider.name})`);
    57|      }
    58|    }
    59|
    60|    // --- 模型权限检查 ---
    61|    // allowedModels 为 null 时表示无限制；否则检查原始模型名和解析后的模型名
    62|    const { allowedModels } = authResult;
    63|    if (allowedModels && !isModelAllowed(model, allowedModels) && !isModelAllowed(resolvedModel, allowedModels)) {
    64|      return errorResponse(
    65|        `Model '${model}' is not allowed for this API key. Allowed models: ${allowedModels.join(", ")}`,
    66|        403,
    67|        requestIdHeaders
    68|      );
    69|    }
    70|
    71|    // --- 路由匹配（含 fallback 候选列表） ---
    72|    // 如果别名指定了供应商（pinnedProvider），则直接使用该供应商，跳过路由匹配
    73|    // candidates 现在是 { provider, resolvedModel } 对象数组
    74|    let candidates;
    75|    if (pinnedProvider) {
    76|      candidates = [{ provider: pinnedProvider, resolvedModel: resolvedModel }];
    77|    } else {
    78|      candidates = resolveProviderCandidates(resolvedModel, providers, routes);
    79|    }
    80|    if (!candidates || candidates.length === 0) {
    81|      return errorResponse(`Model '${model}' not found. Available models: /v1/models`, 404, requestIdHeaders);
    82|    }
    83|
    84|    // --- 构建上游请求 ---
    85|    const isStream = body.stream === true;
    86|
    87|    // --- 流式响应（支持 fallback：依次尝试候选供应商） ---
    88|    if (isStream) {
    89|      const maxStreamRetries = Math.min(candidates.length, 3);
    90|      let streamLastError = null;
    91|
    92|      for (let attempt = 0; attempt < maxStreamRetries; attempt++) {
    93|        const { provider, resolvedModel: actualModel } = candidates[attempt];
    94|        const upstreamUrl = buildUpstreamUrl(provider, actualModel);
    95|        const upstreamHeaders = { ...buildUpstreamHeaders(provider, actualModel), "x-request-id": requestId };
    96|        const upstreamBody = buildUpstreamBody(provider, actualModel, body);
    97|        const startTime = Date.now();
    98|
    99|        try {
   100|          const streamResp = await handleStreamRequest(upstreamUrl, upstreamHeaders, upstreamBody, provider.type, actualModel);
   101|          
   102|          // 流式成功 — 延迟记录 usage（等待流结束后从 _streamUsage 获取 token 统计）
   103|          const streamUsage = streamResp._streamUsage;
   104|          const streamStartTime = startTime;
   105|          context.waitUntil((async () => {
   106|            // 等待一段时间让流传输完成，然后记录 usage
   107|            // _streamUsage 对象会在流传输过程中被实时更新
   108|            await new Promise(r => setTimeout(r, 30000)); // 等 30s 让流传完
   109|            await logUsage(context.env, {
   110|              id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
   111|              userId,
   112|              providerId: provider.id,
   113|              providerName: provider.name,
   114|              model: actualModel,
   115|              promptTokens: streamUsage?.prompt_tokens || 0,
   116|              completionTokens: streamUsage?.completion_tokens || 0,
   117|              totalTokens: streamUsage?.total_tokens || 0,
   118|              timestamp: new Date().toISOString(),
   119|              status: "success",
   120|              latency: Date.now() - streamStartTime,
   121|            });
   122|          })());
   123|
   124|          return streamResp;
   125|        } catch (streamErr) {
   126|          const latency = Date.now() - startTime;
   127|          streamLastError = { message: streamErr.message || "Stream error", status: 502, provider };
   128|          console.warn(`[fallback/stream] ${provider.name} failed: ${streamLastError.message}, trying next...`);
   129|
   130|          // 记录失败
   131|          context.waitUntil(logUsage(context.env, {
   132|            id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
   133|            userId,
   134|            providerId: provider.id,
   135|            providerName: provider.name,
   136|            model: actualModel,
   137|            promptTokens: 0,
   138|            completionTokens: 0,
   139|            totalTokens: 0,
   140|            timestamp: new Date().toISOString(),
   141|            status: "error",
   142|            latency,
   143|          }));
   144|          continue;
   145|        }
   146|      }
   147|
   148|      // 所有流式候选都失败
   149|      const finalStreamMsg = streamLastError?.message || "All providers failed (stream)";
   150|      return errorResponse(`流式请求所有供应商均失败 (最后错误: ${finalStreamMsg})`, 502, requestIdHeaders);
   151|    }
   152|
   153|    // --- 非流式请求（支持 fallback 重试） ---
   154|    let lastError = null;
   155|    const maxRetries = Math.min(candidates.length, 3); // 最多尝试 3 个供应商
   156|
   157|    for (let attempt = 0; attempt < maxRetries; attempt++) {
   158|      const { provider, resolvedModel: actualModel } = candidates[attempt];
   159|      const upstreamUrl = buildUpstreamUrl(provider, actualModel);
   160|      const upstreamHeaders = { ...buildUpstreamHeaders(provider, actualModel), "x-request-id": requestId };
   161|      const upstreamBody = buildUpstreamBody(provider, actualModel, body);
   162|
   163|      const startTime = Date.now();
   164|      const controller = new AbortController();
   165|      const timeout = setTimeout(() => controller.abort(), 120000); // 2 分钟超时
   166|
   167|      let upstreamResp;
   168|      try {
   169|        upstreamResp = await gatewayFetch(upstreamUrl, {
   170|          method: "POST",
   171|          headers: upstreamHeaders,
   172|          body: JSON.stringify(upstreamBody),
   173|          signal: controller.signal,
   174|        });
   175|      } catch (fetchErr) {
   176|        clearTimeout(timeout);
   177|        // 网络错误或超时 → 尝试下一个供应商
   178|        lastError = { message: fetchErr.message || "Network error", status: 502, provider };
   179|        console.warn(`[fallback] ${provider.name} failed (network): ${lastError.message}, trying next...`);
   180|        continue;
   181|      } finally {
   182|        clearTimeout(timeout);
   183|      }
   184|
   185|      const latency = Date.now() - startTime;
   186|      const respData = await upstreamResp.json().catch(() => null);
   187|
   188|      // 5xx / 429 → 尝试 fallback
   189|      if (upstreamResp.status >= 500 || upstreamResp.status === 429) {
   190|        const errMsg = respData?.error?.message || respData?.error || `上游返回 ${upstreamResp.status}`;
   191|        lastError = { message: errMsg, status: upstreamResp.status, provider };
   192|        console.warn(`[fallback] ${provider.name} returned ${upstreamResp.status}: ${errMsg}, trying next...`);
   193|
   194|        // 记录失败（不阻塞）
   195|        context.waitUntil(logUsage(context.env, {
   196|          id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
   197|          userId,
   198|          providerId: provider.id,
   199|          providerName: provider.name,
   200|          model: actualModel,
   201|          promptTokens: 0,
   202|          completionTokens: 0,
   203|          totalTokens: 0,
   204|          timestamp: new Date().toISOString(),
   205|          status: "error",
   206|          latency,
   207|        }));
   208|        continue;
   209|      }
   210|
   211|      // 4xx（非 429）→ 不重试，客户端错误直接返回
   212|      if (!upstreamResp.ok) {
   213|        const errMsg = respData?.error?.message || respData?.error || `上游返回 ${upstreamResp.status}`;
   214|        context.waitUntil(logUsage(context.env, {
   215|          id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
   216|          userId,
   217|          providerId: provider.id,
   218|          providerName: provider.name,
   219|          model: actualModel,
   220|          promptTokens: 0,
   221|          completionTokens: 0,
   222|          totalTokens: 0,
   223|          timestamp: new Date().toISOString(),
   224|          status: "error",
   225|          latency,
   226|        }));
   227|        return errorResponse(errMsg, upstreamResp.status, requestIdHeaders);
   228|      }
   229|
   230|      // --- 成功：格式转换 ---
   231|      let result;
   232|      if (provider.type === "anthropic") {
   233|        result = convertAnthropicResponse(respData, actualModel);
   234|      } else if (provider.type === "google") {
   235|        result = convertGoogleResponse(respData, actualModel);
   236|      } else if (provider.type === "cohere") {
   237|        result = convertCohereResponse(respData, actualModel);
   238|      } else {
   239|        result = respData;
   240|      }
   241|
   242|      // 添加网关元信息
   243|      result._gateway = {
   244|        requestId,
   245|        provider: provider.name,
   246|        providerId: provider.id,
   247|        latency,
   248|        attempt: attempt + 1,
   249|        ...(aliasResult ? { originalModel: model, actualModel } : {}),
   250|      };
   251|
   252|      // --- 记录成功的使用日志 ---
   253|      const usage = result.usage || {};
   254|      context.waitUntil(logUsage(context.env, {
   255|        id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
   256|        userId,
   257|        providerId: provider.id,
   258|        providerName: provider.name,
   259|        model: actualModel,
   260|        promptTokens: usage.prompt_tokens || usage.promptTokens || 0,
   261|        completionTokens: usage.completion_tokens || usage.completionTokens || 0,
   262|        totalTokens: usage.total_tokens || usage.totalTokens || 0,
   263|        timestamp: new Date().toISOString(),
   264|        status: "success",
   265|        latency,
   266|      }));
   267|
   268|      return jsonResponse(result, 200, requestIdHeaders);
   269|    }
   270|
   271|    // 所有候选供应商都失败了
   272|    const finalMsg = lastError?.message || "All providers failed";
   273|    return errorResponse(`所有供应商均失败 (最后错误: ${finalMsg})`, lastError?.status || 502, requestIdHeaders);
   274|
   275|  } catch (err) {
   276|    const message = err instanceof Error ? err.message : "Unknown error";
   277|    if (message.includes("abort") || message.includes("AbortError")) {
   278|      return errorResponse("请求超时", 408, requestIdHeaders);
   279|    }
   280|    console.error("Chat completions error:", message);
   281|    return errorResponse(message, 500, requestIdHeaders);
   282|  }
   283|}
   284|
   285|/**
   286| * OPTIONS /v1/chat/completions — CORS preflight
   287| */
   288|export async function onRequestOptions() {
   289|  return new Response(null, { status: 204, headers: corsHeaders });
   290|}
   291|
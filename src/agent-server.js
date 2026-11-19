const allowedRecipe = 'PHONE-MOLD-6';

export async function interpretRequest(text, { apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_MODEL || 'gpt-6.2-sol', fetchFn = fetch } = {}) {
  if (typeof text !== 'string' || !text.trim() || text.length > 2000) {
    throw Object.assign(new Error('需求文字必須是 1–2000 字。'), { status: 400 });
  }
  if (!apiKey) throw Object.assign(new Error('本機未設定 OPENAI_API_KEY。'), { status: 503 });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  let response;
  try {
    response = await fetchFn('https://api.openai.com/v1/responses', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, store: false,
        instructions: `你是工廠模擬需求整理器。只輸出一個 JSON 物件，不加 Markdown。欄位：recipeId（只能是 ${allowedRecipe} 或 null）、quantity（整數或 null）、dueMinutes（非負數或 null）、notes（最多 160 字）。只有明確要求手機外殼模具工件且相容既有配方時才能匹配；不能產生新工藝、G-code、機台命令或擅自修改既定六道流程。若需求不符，recipeId 為 null 並在 notes 指明缺口。`,
        input: text }),
    });
  } catch (error) {
    throw Object.assign(new Error(error.name === 'AbortError' ? 'LLM 請求逾時。' : 'LLM 連線失敗。'), { status: 502 });
  } finally { clearTimeout(timeout); }
  if (!response.ok) throw Object.assign(new Error(`LLM API 回傳 HTTP ${response.status}。`), { status: 502 });
  const data = await response.json();
  const content = data.output?.flatMap(item => item.content || []).filter(part => part.type === 'output_text').map(part => part.text).join('') || data.output_text;
  if (!content) throw Object.assign(new Error('LLM 未回傳可解析文字。'), { status: 502 });
  let parsed;
  try { parsed = JSON.parse(content); } catch { throw Object.assign(new Error('LLM 回傳格式不正確。'), { status: 502 }); }
  const result = {
    recipeId: parsed.recipeId === allowedRecipe ? allowedRecipe : null,
    quantity: Number.isInteger(parsed.quantity) && parsed.quantity >= 1 && parsed.quantity <= 6 ? parsed.quantity : null,
    dueMinutes: Number.isFinite(parsed.dueMinutes) && parsed.dueMinutes >= 0 ? parsed.dueMinutes : null,
    notes: String(parsed.notes || '').slice(0, 160),
    source: 'openai_responses_api',
  };
  if (result.recipeId && result.quantity !== 6) result.notes = `${result.notes} 第一張示範工單固定六件；目前需求不可直接發布。`.trim();
  return result;
}

export function agentApiPlugin(options = {}) {
  return { name: 'agent-factory-local-agent-api', configureServer(server) {
    server.middlewares.use('/api/interpret', async (req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'Method not allowed' })); return; }
      let body = '';
      try {
        for await (const chunk of req) {
          body += chunk.toString();
          if (body.length > 8000) throw Object.assign(new Error('Request too large'), { status: 413 });
        }
        const payload = JSON.parse(body);
        const result = await interpretRequest(payload.text, options);
        res.statusCode = 200; res.end(JSON.stringify(result));
      } catch (error) {
        res.statusCode = error.status || 400;
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  } };
}

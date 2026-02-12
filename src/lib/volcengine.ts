import fs from 'fs';
import path from 'path';

const VOLCENGINE_SUBMIT_URL = 'https://openspeech.bytedance.com/api/v1/vc/submit';
const VOLCENGINE_QUERY_URL = 'https://openspeech.bytedance.com/api/v1/vc/query';

function getApiKey(): string {
  const key = process.env.VOLCENGINE_API_KEY;
  if (!key) throw new Error('VOLCENGINE_API_KEY not set in environment');
  return key;
}

function loadDictionary(): Array<{ Word: string }> {
  const dictPath = path.join(process.cwd(), 'dictionary.txt');
  if (!fs.existsSync(dictPath)) return [];

  const words = fs.readFileSync(dictPath, 'utf8')
    .split('\n')
    .filter(l => l.trim())
    .map(word => ({ Word: word.trim() }));

  return words;
}

export async function submitTranscription(audioUrl: string): Promise<string> {
  const apiKey = getApiKey();
  const hotWords = loadDictionary();

  const body: Record<string, unknown> = { url: audioUrl };
  if (hotWords.length > 0) {
    body.hot_words = hotWords;
  }

  const params = new URLSearchParams({
    language: 'zh-CN',
    use_itn: 'True',
    use_capitalize: 'True',
    max_lines: '1',
    words_per_line: '15',
  });

  const res = await fetch(`${VOLCENGINE_SUBMIT_URL}?${params}`, {
    method: 'POST',
    headers: {
      'Accept': '*/*',
      'x-api-key': apiKey,
      'Connection': 'keep-alive',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!data.id) {
    throw new Error(`Volcengine submit failed: ${JSON.stringify(data)}`);
  }

  return data.id;
}

export async function queryTranscription(taskId: string): Promise<{
  status: 'processing' | 'done' | 'error';
  result?: Record<string, unknown>;
  error?: string;
}> {
  const apiKey = getApiKey();

  const res = await fetch(`${VOLCENGINE_QUERY_URL}?id=${taskId}`, {
    method: 'GET',
    headers: {
      'Accept': '*/*',
      'x-api-key': apiKey,
      'Connection': 'keep-alive',
    },
  });

  const data = await res.json();

  if (data.code === 0) {
    return { status: 'done', result: data };
  } else if (data.code === 1000) {
    return { status: 'processing' };
  } else {
    return { status: 'error', error: JSON.stringify(data) };
  }
}

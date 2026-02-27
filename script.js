// STATE
const state = {
  apiKey: localStorage.getItem('gemini_api_key') || '',
  region: 'KR',
  category: '경제',
  topic: '',
  maxArticles: 10,
  articleStyle: '객관적 보도',
  lang: 'ko',
  imgStyle: 'Photorealistic',
  articles: [],
  selectedArticles: new Set(),
  selectedArticlesData: [],
  generatedArticle: '',
  generatedImage: null,
  audioBuffer: null,
  audioSource: null,
  isPlaying: false,
  currentPage: 0,
  completedSteps: new Set(),
};

const WHITELIST = {
  KR: ['chosun.com', 'joins.com', 'donga.com', 'hani.co.kr', 'mk.co.kr', 'hankyung.com', 'yonhapnews.co.kr', 'yna.co.kr', 'news1.kr', 'newsis.com'],
  US: ['nytimes.com', 'washingtonpost.com', 'reuters.com', 'apnews.com', 'wsj.com', 'bloomberg.com', 'cnbc.com', 'cnn.com', 'bbc.com', 'theguardian.com'],
  GB: ['bbc.co.uk', 'theguardian.com', 'telegraph.co.uk', 'thetimes.co.uk', 'ft.com', 'independent.co.uk', 'sky.com', 'mirror.co.uk'],
};

// INTRO
setTimeout(() => {
  document.querySelectorAll('#intro > *').forEach(el => el.classList.add('intro-fade-out'));
}, 3200);
setTimeout(() => { document.getElementById('intro').classList.add('hidden'); }, 4000);

if (state.apiKey) { updateApiStatus('connected'); }
else { setTimeout(() => openModal(), 4200); }

// TTS 음성 목록 즉시 초기화 (페이지 로드 시)
setTimeout(() => initTTSVoices(), 500);

// NAVIGATION
function goPage(n) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  document.getElementById('page-' + n).classList.add('active');
  document.getElementById('nav-' + n).classList.add('active');
  state.currentPage = n;
  // 페이지 전환 시 스크롤을 항상 최상단으로 초기화
  const scrollEl = document.querySelector('#page-' + n + ' .main-scroll');
  if (scrollEl) scrollEl.scrollTop = 0;
  if (n === 4) updatePreview();
}

// SELECTORS
function selectRegion(el, region) {
  document.querySelectorAll('.region-btn').forEach(b => {
    if (['KR', 'US', 'GB'].some(r => b.textContent.includes(r))) b.classList.remove('active');
  });
  el.classList.add('active');
  state.region = region;
  document.getElementById('sb-region').textContent = region;
}

function toggleCat(el, cat) {
  el.classList.toggle('active');
  if (el.classList.contains('active')) {
    state.category = cat;
    document.getElementById('sb-cat').textContent = cat;
  }
}

function selectStyle(el, s) {
  el.closest('.panel').querySelectorAll('.region-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  state.articleStyle = s;
}

function selectLang(el, l) {
  el.closest('.panel').querySelectorAll('.region-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  state.lang = l;
}

function selectImgStyle(el, s) {
  el.closest('.style-grid').querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  state.imgStyle = s;
}

// API KEY
function openModal() { document.getElementById('modal-overlay').classList.add('open'); }
function closeModal() { document.getElementById('modal-overlay').classList.remove('open'); }

function saveApiKey() {
  const key = document.getElementById('api-key-input').value.trim();
  if (!key) { showToast('error', '❌ API 키를 입력해주세요.'); return; }
  state.apiKey = key;
  localStorage.setItem('gemini_api_key', key);
  updateApiStatus('connected');
  closeModal();
  showToast('success', '✅ API 키가 저장되었습니다.');
}

document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

function updateApiStatus(status) {
  const dot = document.getElementById('api-dot');
  const txt = document.getElementById('api-status-text');
  dot.className = 'api-dot';
  if (status === 'connected') { dot.style.background = 'var(--green)'; dot.style.boxShadow = '0 0 8px var(--green)'; txt.textContent = 'Gemini 연결됨'; }
  else if (status === 'working') { dot.style.background = 'var(--yellow)'; dot.style.boxShadow = '0 0 8px var(--yellow)'; txt.textContent = '처리 중...'; }
  else if (status === 'error') { dot.style.background = 'var(--red)'; dot.style.boxShadow = '0 0 8px var(--red)'; txt.textContent = '오류 발생'; }
  else { dot.style.background = 'var(--text3)'; dot.style.boxShadow = 'none'; txt.textContent = 'API 대기중'; }
}

// GEMINI API
async function callGemini(prompt, model = 'gemini-2.0-flash', tools = null) {
  if (!state.apiKey) { openModal(); throw new Error('API key required'); }
  const body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7 } };
  if (tools) body.tools = tools;
  const maxRetries = 3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${state.apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.status === 429 && attempt < maxRetries) {
      const waitSec = (attempt + 1) * 5;
      console.warn(`[API] 429 Rate limit — ${waitSec}초 대기 후 재시도 (${attempt + 1}/${maxRetries})`);
      showToast('info', `⏳ API 속도 제한 — ${waitSec}초 대기 후 재시도...`);
      await sleep(waitSec * 1000);
      continue;
    }
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error?.message || `HTTP ${res.status}`); }
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
}

async function callGeminiWithSearch(prompt) { return callGemini(prompt, 'gemini-2.0-flash', [{ googleSearch: {} }]); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// LOG
function addLog(type, msg) {
  const box = document.getElementById('log-box');
  const time = new Date().toTimeString().slice(0, 8);
  const line = document.createElement('div');
  line.className = 'log-line';
  const typeMap = { ok: '✓', warn: '⚠', err: '✗', info: '→' };
  const clsMap = { ok: 'log-ok', warn: 'log-warn', err: 'log-err', info: 'log-info' };
  line.innerHTML = `<span class="log-time">[${time}]</span><span class="${clsMap[type] || 'log-info'}">${typeMap[type] || '·'}</span><span class="log-msg">${msg}</span>`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function setProgress(pct, label) {
  document.getElementById('progress-bar').style.width = pct + '%';
  document.getElementById('progress-pct').textContent = pct + '%';
  document.getElementById('progress-text').textContent = label;
  document.getElementById('sb-status').textContent = label;
}

// 오늘 날짜 자동 계산
function getTodayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

function getTodayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// REGION CONFIG
const REGION_CONFIG = {
  KR: {
    name: '한국', language: 'Korean', searchLang: 'ko',
    siteFilter: 'site:chosun.com OR site:joins.com OR site:donga.com OR site:hani.co.kr OR site:mk.co.kr OR site:hankyung.com OR site:yonhapnews.co.kr OR site:yna.co.kr OR site:news1.kr OR site:newsis.com OR site:sbs.co.kr OR site:kbs.co.kr OR site:mbc.co.kr',
    instruction: '반드시 한국 언론사의 한국어 기사만 검색하세요. 한국 뉴스만 가져와야 합니다.',
    outlets: '조선일보, 중앙일보, 동아일보, 한겨레, 매일경제, 한국경제, 연합뉴스, 뉴스1, 뉴시스, SBS, KBS, MBC',
  },
  US: {
    name: '미국', language: 'English', searchLang: 'en',
    siteFilter: 'site:nytimes.com OR site:washingtonpost.com OR site:reuters.com OR site:apnews.com OR site:wsj.com OR site:bloomberg.com OR site:cnbc.com OR site:cnn.com OR site:foxnews.com OR site:usatoday.com',
    instruction: 'Search ONLY for articles from American/US news outlets. Only US media sources.',
    outlets: 'New York Times, Washington Post, Reuters, AP News, Wall Street Journal, Bloomberg, CNBC, CNN, Fox News, USA Today',
  },
  GB: {
    name: '영국', language: 'English', searchLang: 'en',
    siteFilter: 'site:bbc.co.uk OR site:bbc.com OR site:theguardian.com OR site:telegraph.co.uk OR site:thetimes.co.uk OR site:ft.com OR site:independent.co.uk OR site:sky.com OR site:mirror.co.uk OR site:dailymail.co.uk',
    instruction: 'Search ONLY for articles from British/UK news outlets. Only UK media sources.',
    outlets: 'BBC, The Guardian, The Telegraph, The Times, Financial Times, The Independent, Sky News, Mirror, Daily Mail',
  },
};

// RESEARCH
async function startResearch() {
  if (!state.apiKey) { openModal(); return; }
  state.topic = document.getElementById('topic-input').value.trim();
  const count = state.maxArticles;
  const regionCfg = REGION_CONFIG[state.region];
  document.getElementById('research-progress-panel').style.display = 'block';
  document.getElementById('collected-results-panel').style.display = 'none';
  document.getElementById('log-box').innerHTML = '';
  updateApiStatus('working');
  setProgress(5, '리서치 초기화 중...');
  const todayStr = getTodayStr();
  const todayISO = getTodayISO();
  addLog('info', `리서치 시작 — 날짜: ${todayStr} | 지역: ${regionCfg.name}(${state.region}) | 카테고리: ${state.category}`);
  addLog('info', `토픽: ${state.topic || '최신 이슈'} | 수집 목표: ${count}건`);
  addLog('info', `대상 언론사: ${regionCfg.outlets}`);
  addLog('info', `검색 모드: Deep Read (기사 전문 복사) | 기준일: 오늘(${todayStr})`);
  await sleep(300);
  setProgress(10, `${regionCfg.name} 뉴스 검색 쿼리 생성 중...`);

  const searchPrompt = `You are a professional news researcher. Your task is to find REAL news articles published TODAY.

CRITICAL RULES:
- TODAY'S DATE IS: ${todayStr} (${todayISO})
- ONLY find articles published TODAY (${todayStr}) or within the last 24 hours
- DO NOT include articles from previous days or older dates
- ${regionCfg.instruction}
- Search for: "${state.topic || state.category + ' 뉴스'} ${todayStr}"
- Category: ${state.category}
- ONLY use these ${regionCfg.name} news outlets: ${regionCfg.outlets}
- DO NOT include articles from other countries' media
- Search query should include: ${regionCfg.siteFilter}
- Find ${count} different articles from different sources
- Add date filter in search: after:${todayISO}

For EACH article found, use Google Search to find the actual article and READ THE FULL CONTENT of the article.
Then return a JSON array where each object contains:
- title: the EXACT original headline of the article (in ${regionCfg.language})
- source: the EXACT name of the news outlet (e.g., "${WHITELIST[state.region][0]}")
- fullContent: the COMPLETE article body text copied from the source (at least 500 characters, include ALL paragraphs)
- summary: a brief 2-3 sentence summary
- date: "${todayStr}" (today's date)
- author: the reporter/journalist name if available
- url: the actual URL of the article
- relevance: relevance score 1-10

IMPORTANT:
1. For "fullContent", you MUST read and copy the ENTIRE article text, not just a summary.
2. ALL articles MUST be from TODAY (${todayStr}). Do not include older articles.

Return ONLY a valid JSON array. No markdown formatting, no code blocks, no explanation.`;

  try {
    addLog('info', `${regionCfg.name} 뉴스 사이트에서 실시간 검색 중...`);
    setProgress(20, `${regionCfg.name} 뉴스 실시간 검색 중...`);

    let raw;
    try {
      raw = await callGeminiWithSearch(searchPrompt);
      addLog('ok', `Google Search + ${regionCfg.name} 뉴스 검색 완료`);
    } catch (e) {
      addLog('warn', `검색 API 에러: ${e.message} — 내부 지식 폴백`);
      raw = await callGemini(searchPrompt);
    }

    setProgress(45, '검색 결과 파싱 중...');
    addLog('info', '검색 결과 JSON 파싱 중...');

    let articles = [];
    try {
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (jsonMatch) articles = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(articles) || articles.length === 0) throw new Error('parse fail');
    } catch {
      addLog('warn', 'JSON 파싱 실패 — 텍스트 추출 폴백');
      articles = generateFallbackArticles(count);
    }

    const processedArticles = [];
    for (let i = 0; i < Math.min(articles.length, count); i++) {
      const a = articles[i];
      const pct = 45 + Math.round((i + 1) / count * 45);
      setProgress(pct, `기사 ${i + 1}/${count} 전문 읽기 중...`);
      addLog('info', `📖 기사 ${i + 1}/${count} 딥 리딩: ${(a.title || '').slice(0, 50)}...`);

      let fullContent = a.fullContent || a.summary || '';

      if (fullContent.length < 500 && a.title) {
        try {
          addLog('info', `   → 기사 전문 추가 수집 중 (${a.source || '출처 미상'})...`);
          const deepReadPrompt = `You are a news article reader. Find and read the FULL article with this title from ${regionCfg.name} news:

Title: "${a.title}"
Source: ${a.source || regionCfg.outlets.split(',')[0]}
${a.url && a.url !== '#' ? 'URL: ' + a.url : ''}

Using Google Search, find this exact article and copy the COMPLETE article text.
Include ALL paragraphs, ALL quotes, ALL details.
Return ONLY the full article body text (no JSON, no markdown, just the raw article content).
The article must be from a ${regionCfg.name} news source and in ${regionCfg.language}.`;

          const deepResult = await callGeminiWithSearch(deepReadPrompt);
          if (deepResult && deepResult.length > fullContent.length) {
            fullContent = deepResult;
            addLog('ok', `   ✓ 기사 전문 수집 완료 (${fullContent.length}자)`);
          }
        } catch (e) {
          addLog('warn', `   ⚠ 딥 리딩 실패: ${e.message}`);
        }
        await sleep(500);
      } else {
        addLog('ok', `   ✓ 기사 전문 확보 완료 (${fullContent.length}자)`);
        await sleep(200);
      }

      processedArticles.push({
        id: i,
        title: a.title || `${state.category} 관련 기사 ${i + 1}`,
        source: a.source || WHITELIST[state.region]?.[i % 5] || 'Unknown',
        summary: a.summary || fullContent.slice(0, 200) + '...',
        fullContent: fullContent,
        date: a.date || todayStr,
        author: a.author || '',
        relevance: a.relevance || Math.floor(Math.random() * 3) + 7,
        url: a.url || '#',
      });
    }

    state.articles = processedArticles;
    document.getElementById('sb-count').textContent = processedArticles.length;
    setProgress(100, `수집 완료 — ${processedArticles.length}건 (${regionCfg.name} 뉴스)`);
    addLog('ok', `✅ 총 ${processedArticles.length}건 ${regionCfg.name} 뉴스 수집 완료`);
    addLog('ok', `총 수집 텍스트: ${processedArticles.reduce((s, a) => s + (a.fullContent?.length || 0), 0).toLocaleString()}자`);
    renderCollectedArticles(processedArticles);
    updateApiStatus('connected');
    markStepComplete(0);
    showToast('success', `✅ ${regionCfg.name} 뉴스 ${processedArticles.length}건 수집 완료! 사용할 기사를 선택하세요.`);
  } catch (err) {
    addLog('err', `리서치 실패: ${err.message}`);
    setProgress(0, '오류 발생'); updateApiStatus('error');
    showToast('error', '❌ ' + err.message);
    document.getElementById('collected-articles-grid').innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>오류 발생. API 키 확인 후 재시도하세요.</p></div>';
    document.getElementById('collected-results-panel').style.display = 'block';
  }
}

function generateFallbackArticles(count) {
  const regionCfg = REGION_CONFIG[state.region];
  const titles = [`${state.category} 분야 최신 동향 분석`, `2026년 ${state.category} 핵심 이슈`, `글로벌 ${state.category} 시장 변화`, `전문가가 본 ${state.category} 전망`, `${state.topic || state.category} 심층 분석 리포트`, `${regionCfg.name} 주요 ${state.category} 뉴스`, `${state.category} 업계 구조적 변화`, `${state.category} 관련 정책 동향`, `${state.category} 혁신 사례 소개`, `${state.category} 미래 예측 보고서`];
  return Array.from({ length: count }, (_, i) => ({
    title: titles[i % titles.length],
    source: WHITELIST[state.region]?.[i % 5] || 'Reuters',
    summary: `${regionCfg.name} ${state.category} 분야에서 주목받고 있는 최신 이슈입니다.`,
    fullContent: `${regionCfg.name} ${state.category} 분야에서 주목받고 있는 최신 이슈입니다. 전문가들은 이번 변화가 업계에 미치는 영향을 분석 중이며, 향후 전망에 대한 다양한 의견이 제시되고 있습니다.`,
    date: getTodayStr(),
    author: '',
    relevance: 7 + (i % 3),
  }));
}

// 자료수집 페이지에 수집 결과 렌더링 — 카드 클릭으로 개별 선택/해제
function renderCollectedArticles(articles) {
  const grid = document.getElementById('collected-articles-grid');
  grid.innerHTML = '';
  state.selectedArticles.clear();
  document.getElementById('collected-results-panel').style.display = 'block';

  articles.forEach((a, i) => {
    const card = document.createElement('div');
    card.className = 'article-card';
    card.id = 'card-' + i;
    const cLen = a.fullContent ? a.fullContent.length : 0;
    const cBadge = cLen > 0 ? '<span class="card-badge" style="background:rgba(46,213,115,0.15);border-color:rgba(46,213,115,0.3);color:#2ed573;">📄 ' + cLen.toLocaleString() + '자</span>' : '';
    const aBadge = a.author ? '<span class="card-badge">' + a.author + '</span>' : '';
    const hasUrl = a.url && a.url !== '#';
    const urlHtml = hasUrl ? '<a href="' + a.url + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;font-family:var(--font-mono);font-size:10px;color:var(--teal);text-decoration:none;margin-top:8px;padding:4px 10px;background:var(--teal-dim);border:1px solid var(--border-teal);border-radius:4px;transition:all 0.2s;" onclick="event.stopPropagation();">🔗 원본 기사 보기</a>' : '';

    card.innerHTML = '<div style="flex:1;min-width:0;">' +
      '<div class="card-source">' + a.source +
      '<span class="card-badge">관련도 ' + a.relevance + '/10</span>' +
      '<span class="card-badge">' + a.date + '</span>' +
      aBadge + cBadge +
      '</div>' +
      '<div class="card-title">' + a.title + '</div>' +
      '<div class="card-desc">' + a.summary + '</div>' +
      urlHtml +
      '</div>' +
      '<div style="display:flex;flex-direction:column;align-items:center;gap:6px;min-width:44px;">' +
      '<div class="card-checkbox" id="check-' + i + '" style="font-size:26px;color:var(--text3);cursor:pointer;transition:all 0.2s;user-select:none;line-height:1;">☐</div>' +
      '<span style="font-size:9px;color:var(--text3);font-family:var(--font-mono);">#' + String(i + 1).padStart(2, '0') + '</span>' +
      '</div>';

    card.addEventListener('click', function () { toggleArticle(i); });
    grid.appendChild(card);
  });
  updateSelectedCount();
}

// 카드 클릭 시 개별 선택/해제 토글
function toggleArticle(i, e) {
  if (e) e.stopPropagation();
  const card = document.getElementById('card-' + i);
  const check = document.getElementById('check-' + i);
  if (!card) return;
  if (state.selectedArticles.has(i)) {
    state.selectedArticles.delete(i);
    card.classList.remove('selected');
    if (check) { check.textContent = '☐'; check.style.color = 'var(--text3)'; }
  } else {
    state.selectedArticles.add(i);
    card.classList.add('selected');
    if (check) { check.textContent = '☑'; check.style.color = 'var(--teal)'; }
  }
  updateSelectedCount();
}

function selectAllArticles() {
  state.articles.forEach((_, i) => {
    state.selectedArticles.add(i);
    const card = document.getElementById('card-' + i);
    const check = document.getElementById('check-' + i);
    if (card) card.classList.add('selected');
    if (check) { check.textContent = '☑'; check.style.color = 'var(--teal)'; }
  });
  updateSelectedCount();
}

function deselectAllArticles() {
  state.selectedArticles.clear();
  state.articles.forEach((_, i) => {
    const card = document.getElementById('card-' + i);
    const check = document.getElementById('check-' + i);
    if (card) card.classList.remove('selected');
    if (check) { check.textContent = '☐'; check.style.color = 'var(--text3)'; }
  });
  updateSelectedCount();
}

function updateSelectedCount() {
  const cnt = state.selectedArticles.size;
  document.getElementById('selected-count-badge').textContent = cnt + '건 선택됨';
  document.getElementById('send-btn').disabled = cnt === 0;
}

// 선택한 기사를 데이터정리로 보내기
function sendToDataProcessing() {
  if (state.selectedArticles.size === 0) {
    showToast('info', '사용할 기사를 선택해주세요.');
    return;
  }
  state.selectedArticlesData = [...state.selectedArticles].map(i => state.articles[i]).filter(Boolean);

  document.getElementById('data-article-count').textContent = state.selectedArticlesData.length;
  const totalChars = state.selectedArticlesData.reduce((s, a) => s + (a.fullContent?.length || 0), 0);
  document.getElementById('data-total-chars').textContent = totalChars.toLocaleString();
  const uniqueSources = new Set(state.selectedArticlesData.map(a => a.source));
  document.getElementById('data-sources-count').textContent = uniqueSources.size;

  const detailEl = document.getElementById('selected-articles-detail');
  detailEl.innerHTML = '';
  state.selectedArticlesData.forEach((a, i) => {
    const panel = document.createElement('div');
    panel.className = 'panel';
    const preview = (a.fullContent || a.summary || '').slice(0, 500);
    const hasUrl = a.url && a.url !== '#';
    const urlLink = hasUrl ? '<a href="' + a.url + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;font-family:var(--font-mono);font-size:10px;color:var(--teal);text-decoration:none;margin-top:8px;padding:4px 10px;background:var(--teal-dim);border:1px solid var(--border-teal);border-radius:4px;">🔗 원본 기사</a>' : '';
    panel.innerHTML =
      '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">' +
      '<div>' +
      '<div class="card-source" style="margin-bottom:4px;">' + a.source + '<span class="card-badge">' + a.date + '</span>' + (a.author ? '<span class="card-badge">' + a.author + '</span>' : '') + '</div>' +
      '<div style="font-size:15px; font-weight:700; color:var(--text);">' + a.title + '</div>' +
      urlLink +
      '</div>' +
      '<span class="tag">#' + (i + 1) + '</span>' +
      '</div>' +
      '<div style="font-size:12px; color:var(--text2); line-height:1.7; background:var(--bg4); border-radius:8px; padding:14px; max-height:200px; overflow-y:auto;">' + preview + (preview.length < (a.fullContent?.length || 0) ? '<span style="color:var(--teal);">... (전문 ' + a.fullContent.length.toLocaleString() + '자)</span>' : '') + '</div>';
    detailEl.appendChild(panel);
  });

  markStepComplete(0);
  goPage(1);
  showToast('success', '📤 ' + state.selectedArticlesData.length + '건의 기사가 데이터정리로 전송되었습니다.');
}

// 데이터정리에서 기사작성으로
function goToArticleWriting() {
  if (state.selectedArticlesData.length === 0) {
    showToast('info', '먼저 자료수집에서 기사를 선택하고 보내주세요.');
    return;
  }
  // 기사작성 페이지에 참조 기사 로드
  renderWriteSources();
  goPage(2);
}

// 기사작성 페이지에 참조 기사 목록 렌더링
function renderWriteSources() {
  const articles = state.selectedArticlesData;
  if (!articles || articles.length === 0) return;
  const panel = document.getElementById('write-sources-panel');
  const list = document.getElementById('write-sources-list');
  const countBadge = document.getElementById('write-sources-count');
  if (!panel || !list) return;
  panel.style.display = 'block';
  countBadge.textContent = articles.length + '건 참조 기사';
  list.innerHTML = '';
  articles.forEach((a, i) => {
    const item = document.createElement('div');
    item.style.cssText = 'background:var(--bg4); border-radius:8px; padding:12px 14px; border-left:3px solid var(--teal); display:flex; flex-direction:column; gap:4px;';
    const hasUrl = a.url && a.url !== '#';
    const urlLink = hasUrl ? '<a href="' + a.url + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;font-family:var(--font-mono);font-size:10px;color:var(--teal);text-decoration:none;margin-top:4px;padding:3px 8px;background:var(--teal-dim);border:1px solid var(--border-teal);border-radius:4px;" onclick="event.stopPropagation()">🔗 원본 기사</a>' : '';
    const charCount = (a.fullContent || '').length;
    item.innerHTML =
      '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">' +
      '<span style="font-family:var(--font-mono);font-size:9px;background:var(--bg3);padding:2px 7px;border-radius:4px;color:var(--teal);">#' + (i + 1) + '</span>' +
      '<span style="font-size:11px;font-weight:700;color:var(--text2);">' + (a.source || '') + '</span>' +
      '<span class="card-badge">' + (a.date || '') + '</span>' +
      (charCount > 0 ? '<span class="card-badge" style="background:rgba(46,213,115,0.12);border-color:rgba(46,213,115,0.3);color:#2ed573;">📄 ' + charCount.toLocaleString() + '자</span>' : '') +
      '</div>' +
      '<div style="font-size:13px;font-weight:700;color:var(--text);line-height:1.5;">' + (a.title || '') + '</div>' +
      (a.summary ? '<div style="font-size:11px;color:var(--text3);line-height:1.6;">' + a.summary.slice(0, 150) + (a.summary.length > 150 ? '...' : '') + '</div>' : '') +
      urlLink;
    list.appendChild(item);
  });
}


// ============================================================
// 다각도 분석 엔진 (Data Analysis Engine)
// ============================================================

function setAnalysisProgress(pct, label) {
  document.getElementById('analysis-progress-bar').style.width = pct + '%';
  document.getElementById('analysis-progress-pct').textContent = pct + '%';
  document.getElementById('analysis-progress-text').textContent = label;
}

function addAnalysisLog(type, msg) {
  const box = document.getElementById('analysis-log-box');
  const time = new Date().toTimeString().slice(0, 8);
  const line = document.createElement('div');
  line.className = 'log-line';
  const typeMap = { ok: '✓', warn: '⚠', err: '✗', info: '→' };
  const clsMap = { ok: 'log-ok', warn: 'log-warn', err: 'log-err', info: 'log-info' };
  line.innerHTML = '<span class="log-time">[' + time + ']</span><span class="' + (clsMap[type] || 'log-info') + '">' + (typeMap[type] || '·') + '</span><span class="log-msg">' + msg + '</span>';
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

// 하이브리드 데이터: fullContent 우선, 없으면 snippet(summary) 사용
function getArticleContent(article, maxLen) {
  maxLen = maxLen || 3000;
  if (article.fullContent && article.fullContent.length > 100) {
    return article.fullContent.slice(0, maxLen);
  }
  return article.summary || article.title || '';
}

// 메인 분석 오케스트레이터
async function runDataAnalysis() {
  if (state.selectedArticlesData.length === 0) {
    showToast('info', '먼저 자료수집에서 기사를 선택하고 보내주세요.');
    return;
  }

  const btn = document.getElementById('analyze-btn');
  btn.innerHTML = '<span><div class="spinner"></div> 분석 중...</span>';
  btn.disabled = true;
  updateApiStatus('working');

  // 분석 UI 초기화
  document.getElementById('analysis-progress-panel').style.display = 'block';
  document.getElementById('analysis-log-box').innerHTML = '';
  ['analysis-summary-panel', 'analysis-facts-panel', 'analysis-perspectives-panel', 'analysis-storyline-panel', 'analysis-factcheck-panel'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });

  const articles = state.selectedArticlesData;
  const regionCfg = REGION_CONFIG[state.region];

  // 하이브리드 소스 준비
  const sourcesText = articles.map((a, i) => {
    const content = getArticleContent(a);
    const mode = (a.fullContent && a.fullContent.length > 100) ? 'FULL' : 'SNIPPET';
    return '[기사 ' + (i + 1) + '] (' + mode + ') ' + a.source + ' (' + a.date + ')\n제목: ' + a.title + '\n내용:\n' + content;
  }).join('\n\n---\n\n');

  addAnalysisLog('info', '📊 다각도 분석 엔진 시작');
  addAnalysisLog('info', '선택된 기사 ' + articles.length + '건 / 하이브리드 데이터 모드');
  articles.forEach((a, i) => {
    const mode = (a.fullContent && a.fullContent.length > 100) ? '전문(' + a.fullContent.length + '자)' : '요약본';
    addAnalysisLog('info', '  #' + (i + 1) + ' ' + a.source + ' → ' + mode);
  });

  try {
    // STEP 1: organizeData — 통합 요약 + 팩트 분류 + 관점/시사점
    setAnalysisProgress(10, 'Step 1/3: 통합 분석 중...');
    addAnalysisLog('info', '🧠 Step 1: organizeData — 통합 요약 & 팩트 분류 시작');
    const organizeResult = await organizeData(sourcesText, regionCfg);
    setAnalysisProgress(40, 'Step 1 완료');
    addAnalysisLog('ok', '✅ 통합 요약, 팩트 분류, 관점/시사점 분석 완료');

    // STEP 2: createStoryline — 스토리라인 & 논조 설정
    setAnalysisProgress(50, 'Step 2/3: 스토리라인 설정 중...');
    addAnalysisLog('info', '📐 Step 2: createStoryline — 스토리라인 & 논조 설정');
    addAnalysisLog('info', '⏳ API 안정화 대기 (3초)...');
    await sleep(3000);
    const storylineResult = await createStoryline(sourcesText, organizeResult, regionCfg);
    setAnalysisProgress(75, 'Step 2 완료');
    addAnalysisLog('ok', '✅ 스토리라인 & 논조 설정 완료');

    // STEP 3: performFactCheck — 교차 검증
    setAnalysisProgress(80, 'Step 3/3: 교차 검증 중...');
    addAnalysisLog('info', '✅ Step 3: performFactCheck — 교차 검증');
    addAnalysisLog('info', '⏳ API 안정화 대기 (3초)...');
    await sleep(3000);
    const factCheckResult = await performFactCheck(sourcesText, storylineResult, regionCfg);
    setAnalysisProgress(100, '분석 완료!');
    addAnalysisLog('ok', '✅ 교차 검증 완료 — 신뢰도: ' + factCheckResult.confidence);

    // 분석 결과를 state에 저장 (기사 작성 시 활용)
    state.analysisResult = {
      summary: organizeResult.summary,
      facts: organizeResult.facts,
      perspectives: organizeResult.perspectives,
      tone: storylineResult.tone,
      arc: storylineResult.arc,
      storyline: storylineResult.storyline,
      factcheck: factCheckResult,
    };

    showToast('success', '🧠 다각도 분석 완료! 결과를 확인하세요.');
    markStepComplete(1);
  } catch (err) {
    addAnalysisLog('err', '분석 실패: ' + err.message);
    setAnalysisProgress(0, '오류 발생');
    showToast('error', '❌ 분석 실패: ' + err.message);
  } finally {
    btn.innerHTML = '<span>🧠 AI 다각도 분석 시작</span>';
    btn.disabled = false;
    updateApiStatus('connected');
  }
}

// STEP 1: organizeData — 통합 요약 + 팩트 분류 + 관점/시사점
async function organizeData(sourcesText, regionCfg) {
  const prompt = `You are an expert data analyst and journalist. Analyze the following ${state.selectedArticlesData.length} news articles about "${state.topic || state.category}" from ${regionCfg.name}.

ARTICLES:
${sourcesText}

Perform a comprehensive multi-angle analysis and return a JSON object with these fields:

1. "summary" (string): A comprehensive integrated summary (200-300 words in Korean) that synthesizes ALL articles' key points into one coherent narrative. Identify the overarching theme.

2. "facts" (array of objects): Categorize extracted facts into logical groups. Each object has:
   - "category" (string): Category name like "사건 개요", "시장 반응", "전문가 견해", "수치 데이터", "정책 동향", "향후 전망" etc.
   - "icon" (string): A single emoji for the category
   - "items" (array of strings): 3-5 specific factual items extracted from the articles

3. "perspectives" (string): Analysis of implications and future outlook (150-200 words in Korean). What do these articles collectively suggest? What are the key takeaways and future implications?

Return ONLY valid JSON. No markdown, no code blocks.
${state.lang === 'ko' ? '모든 텍스트는 한국어로 작성하세요.' : 'Write all text in English.'}`;

  const raw = await callGemini(prompt, 'gemini-2.0-flash');
  let result = { summary: '', facts: [], perspectives: '' };

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) result = JSON.parse(jsonMatch[0]);
  } catch {
    result.summary = raw.slice(0, 500);
    result.perspectives = raw.slice(500, 800);
  }

  // UI 렌더링: 통합 요약
  document.getElementById('analysis-summary').innerHTML = result.summary || '분석 결과 없음';
  document.getElementById('analysis-summary-panel').style.display = 'block';

  // UI 렌더링: 카테고리별 팩트
  const factsEl = document.getElementById('analysis-facts');
  factsEl.innerHTML = '';
  if (result.facts && result.facts.length > 0) {
    result.facts.forEach(cat => {
      const div = document.createElement('div');
      div.style.cssText = 'background:var(--bg4); border-radius:8px; padding:14px;';
      const items = (cat.items || []).map(item => '<li style="margin-bottom:4px;">' + item + '</li>').join('');
      div.innerHTML = '<div style="font-size:14px; font-weight:700; color:var(--text); margin-bottom:8px;">' +
        (cat.icon || '📌') + ' ' + (cat.category || '기타') +
        '</div><ul style="margin:0; padding-left:20px; font-size:12px; color:var(--text2); line-height:1.7;">' + items + '</ul>';
      factsEl.appendChild(div);
    });
  }
  document.getElementById('analysis-facts-panel').style.display = 'block';

  // UI 렌더링: 관점/시사점
  document.getElementById('analysis-perspectives').innerHTML = result.perspectives || '분석 결과 없음';
  document.getElementById('analysis-perspectives-panel').style.display = 'block';

  return result;
}

// STEP 2: createStoryline — 스토리라인 & 논조 설정
async function createStoryline(sourcesText, organizeResult, regionCfg) {
  const prompt = `You are a senior editorial strategist. Based on the analyzed data below, create a storyline and editorial tone.

TOPIC: "${state.topic || state.category}"
REGION: ${regionCfg.name}
INTEGRATED SUMMARY:
${organizeResult.summary}

KEY PERSPECTIVES:
${organizeResult.perspectives}

Return a JSON object:
{
  "tone": "논조를 한 단어로 (예: 비판적, 낙관적, 경고적, 정보전달, 분석적, 탐사적, 성찰적, 중립적)",
  "toneReason": "이 논조를 선택한 이유 (1-2문장, 한국어)",
  "arc": "내러티브 구조 (예: 문제제기→분석→전망, 사건→반응→영향, 배경→전개→결론)",
  "storyline": "기사 전체의 스토리라인을 3-4단계로 서술 (200자 내외, 한국어). 어떤 순서로 이야기를 풀어갈지, 각 단계에서 어떤 정보를 배치할지 구체적으로."
}

Return ONLY valid JSON.
${state.lang === 'ko' ? '한국어로 작성하세요.' : 'Write in English.'}`;

  const raw = await callGemini(prompt, 'gemini-2.0-flash');
  let result = { tone: '정보전달', toneReason: '', arc: '배경→전개→결론', storyline: '' };

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) result = JSON.parse(jsonMatch[0]);
  } catch {
    result.storyline = raw.slice(0, 300);
  }

  // UI 렌더링
  document.getElementById('analysis-tone').textContent = result.tone || '정보전달';
  document.getElementById('analysis-arc').textContent = result.arc || '—';
  const storylineHtml = '<strong>논조 선택 이유:</strong> ' + (result.toneReason || '') +
    '<br><br><strong>스토리라인:</strong><br>' + (result.storyline || '');
  document.getElementById('analysis-storyline').innerHTML = storylineHtml;
  document.getElementById('analysis-storyline-panel').style.display = 'block';

  return result;
}

// STEP 3: performFactCheck — 교차 검증
async function performFactCheck(sourcesText, storylineResult, regionCfg) {
  const prompt = `You are a fact-checking editor. Cross-validate the proposed storyline against the original source articles.

PROPOSED STORYLINE:
Tone: ${storylineResult.tone}
Arc: ${storylineResult.arc}
Story: ${storylineResult.storyline}

ORIGINAL SOURCE ARTICLES:
${sourcesText}

Verify:
1. Are all facts in the storyline supported by the source articles?
2. Is the proposed tone appropriate for the content?
3. Are there any potential inaccuracies or unsupported claims?

Return a JSON object:
{
  "confidence": "A percentage score 0-100 indicating fact alignment",
  "status": "검증 완료 상태 요약 (1문장, 한국어)",
  "verified": ["검증된 팩트 1", "검증된 팩트 2", ...],
  "warnings": ["주의사항 1", ...],
  "recommendation": "기사 작성 시 권장 사항 (2-3문장, 한국어)"
}

Return ONLY valid JSON.
${state.lang === 'ko' ? '한국어로 작성하세요.' : 'Write in English.'}`;

  const raw = await callGemini(prompt, 'gemini-2.0-flash');
  let result = { confidence: '85', status: '검증 완료', verified: [], warnings: [], recommendation: '' };

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) result = JSON.parse(jsonMatch[0]);
  } catch {
    result.recommendation = raw.slice(0, 300);
  }

  // UI 렌더링
  const score = parseInt(result.confidence) || 0;
  const scoreEl = document.getElementById('factcheck-score');
  scoreEl.textContent = score + '%';
  scoreEl.style.color = score >= 80 ? 'var(--green)' : score >= 60 ? 'var(--yellow)' : 'var(--red)';

  document.getElementById('factcheck-status').innerHTML = '<strong>' + (result.status || '검증 완료') + '</strong>';

  let checkHtml = '';
  if (result.verified && result.verified.length > 0) {
    checkHtml += '<div style="margin-bottom:10px;"><strong style="color:var(--green);">✓ 검증된 팩트:</strong><ul style="margin:4px 0 0 20px;">';
    result.verified.forEach(v => { checkHtml += '<li>' + v + '</li>'; });
    checkHtml += '</ul></div>';
  }
  if (result.warnings && result.warnings.length > 0) {
    checkHtml += '<div style="margin-bottom:10px;"><strong style="color:var(--yellow);">⚠ 주의사항:</strong><ul style="margin:4px 0 0 20px;">';
    result.warnings.forEach(w => { checkHtml += '<li>' + w + '</li>'; });
    checkHtml += '</ul></div>';
  }
  if (result.recommendation) {
    checkHtml += '<div><strong style="color:var(--teal);">💡 권장사항:</strong> ' + result.recommendation + '</div>';
  }
  document.getElementById('analysis-factcheck').innerHTML = checkHtml;
  document.getElementById('analysis-factcheck-panel').style.display = 'block';

  return result;
}

// ARTICLE GENERATION
async function generateArticle() {
  if (!state.apiKey) { openModal(); return; }
  const btn = document.getElementById('generate-btn');
  btn.innerHTML = '<span><div class="spinner"></div> 생성 중...</span>'; btn.disabled = true;
  updateApiStatus('working');
  const selected = state.selectedArticlesData.length > 0 ? state.selectedArticlesData : state.articles.slice(0, 3);
  const regionCfg = REGION_CONFIG[state.region];
  const sourceSummary = selected.map((a, i) => {
    const content = a.fullContent ? a.fullContent.slice(0, 3000) : a.summary;
    return `[출처 ${i + 1}] ${a.source} (${a.date})${a.author ? ' | 기자: ' + a.author : ''}\n제목: ${a.title}\n기사 전문:\n${content}`;
  }).join('\n\n---\n\n');
  const langInstr = state.lang === 'ko' ? '반드시 한국어로 작성하세요.' : 'Write in English.';
  const styleMap = { '객관적 보도': 'objective news reporting style', '심층 분석': 'in-depth analytical style', '오피니언': 'opinion/editorial style', '브리핑': 'concise briefing format' };

  // 분석 결과가 있으면 프롬프트에 반영
  let analysisContext = '';
  if (state.analysisResult) {
    const ar = state.analysisResult;
    analysisContext = `\n\n=== DATA ANALYSIS RESULTS (Use these to structure your article) ===
INTEGRATED SUMMARY: ${ar.summary || ''}
SUGGESTED TONE: ${ar.tone || state.articleStyle} (${ar.arc || ''})
STORYLINE: ${ar.storyline || ''}
KEY PERSPECTIVES: ${ar.perspectives || ''}
FACT-CHECK CONFIDENCE: ${ar.factcheck?.confidence || 'N/A'}%
RECOMMENDATIONS: ${ar.factcheck?.recommendation || ''}
=== END ANALYSIS ===`;
  }

  const prompt = `You are a professional journalist working for a ${regionCfg.name} news outlet.\n${langInstr}\nStyle: ${styleMap[state.articleStyle] || 'objective news'}\nTopic: "${state.topic || state.category}"\nCategory: ${state.category}\nRegion: ${regionCfg.name}\n\nBelow are FULL ARTICLE TEXTS from ${regionCfg.name} news sources that you must use as reference:\n\n${sourceSummary}${analysisContext}\n\nBased on the FULL content of these source articles${state.analysisResult ? ' and the data analysis results above' : ''}, write a comprehensive news article with:\n1. A compelling headline (bold, starts with "# ")\n2. Byline and date line\n3. Lead paragraph (most important info first)\n4. 4-5 detailed body paragraphs incorporating facts, data, and quotes from the source articles\n5. Expert quotes (use actual quotes from the source articles when available)\n6. Closing paragraph with future outlook\n${state.analysisResult ? '\nFOLLOW the suggested TONE (' + state.analysisResult.tone + ') and STORYLINE structure from the analysis.\n' : ''}\nIMPORTANT: Use specific facts, numbers, and details from the source articles. Do not generalize.\n${state.lang === 'ko' ? '한국어로 전문적인 기사를 작성하세요.' : 'Write professional journalism in English.'}`;
  try {
    const result = await callGemini(prompt, 'gemini-2.0-flash');
    state.generatedArticle = result;
    document.getElementById('article-textarea').value = result;
    updateWordCount(); markStepComplete(2);
    showToast('success', '✅ 기사 생성 완료!');
    // 기사 완료 마닉 배너 표시 + 이미지생성 버튼 활성화
    const banner = document.getElementById('article-done-banner');
    if (banner) { banner.style.display = 'flex'; banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    const gotoImgBtn = document.getElementById('goto-image-btn');
    if (gotoImgBtn) { gotoImgBtn.disabled = false; gotoImgBtn.style.opacity = '1'; gotoImgBtn.style.cursor = 'pointer'; }
    await autoGenPrompt();
  } catch (err) { showToast('error', '❌ 기사 생성 실패: ' + err.message); }
  finally { btn.innerHTML = '<span>✍️ 기사 생성</span>'; btn.disabled = false; updateApiStatus('connected'); }
}

// 기사작성에서 이미지생성으로 이동 (기사 내용 시흰 후)
function goToImageGen() {
  // 이미지 생성 페이지에 기사 정보 표시
  const article = state.generatedArticle || document.getElementById('article-textarea').value || '';
  const infoPanel = document.getElementById('img-article-info');
  const preview = document.getElementById('img-article-preview');
  const tagsEl = document.getElementById('img-source-tags');

  if (infoPanel && preview && article) {
    // 기사 첫 문단 표시 (널 제목 제외, 내용만)
    const cleanText = article.replace(/^#.+$/gm, '').replace(/\*\*/g, '').trim().slice(0, 300);
    preview.innerHTML = cleanText + (article.length > 300 ? '<span style="color:var(--teal);"> ...(+ ' + (article.length - 300).toLocaleString() + '자)</span>' : '');
    infoPanel.style.display = 'block';
  }
  if (tagsEl && state.selectedArticlesData.length > 0) {
    tagsEl.innerHTML = state.selectedArticlesData.map((a, i) =>
      '<span class="card-badge" style="font-size:11px;padding:4px 10px;">#' + (i + 1) + ' ' + (a.source || '') + '</span>'
    ).join('');
  }
  goPage(3);
  showToast('info', '🎨 이미지 프롬프트를 자동 생성 중...');
  setTimeout(() => autoGenPrompt(), 300);
}

// 이미지생성에서 미리보기로 이동
function goToPreview() {
  goPage(4);
  setTimeout(() => updatePreview(), 100);
}

function updateWordCount() {
  const text = document.getElementById('article-textarea').value;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  document.getElementById('word-count').textContent = words + ' 단어';
}
document.getElementById('article-textarea').addEventListener('input', updateWordCount);

function copyArticle() {
  const text = document.getElementById('article-textarea').value;
  if (!text) { showToast('info', '복사할 내용이 없습니다.'); return; }
  navigator.clipboard.writeText(text).then(() => showToast('success', '📋 클립보드에 복사됨!'));
}

function downloadArticle() {
  const text = document.getElementById('article-textarea').value;
  if (!text) { showToast('info', '다운로드할 내용이 없습니다.'); return; }
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `article_${Date.now()}.txt`; a.click();
}

// IMAGE GENERATION
async function autoGenPrompt() {
  if (!state.generatedArticle && !state.topic) return;
  try {
    const snippet = (state.generatedArticle || state.topic).slice(0, 500);
    const prompt = `Based on this article, create a concise image generation prompt in English for ${state.imgStyle} style:\n"${snippet}"\nRequirements: ${state.imgStyle} style, no text/logos/watermarks, professional quality, 1-2 sentences.\nReturn ONLY the prompt.`;
    const result = await callGemini(prompt);
    document.getElementById('img-prompt').value = result.trim();
  } catch { }
}

async function generateImage() {
  if (!state.apiKey) { openModal(); return; }
  const promptText = document.getElementById('img-prompt').value.trim();
  if (!promptText) { showToast('info', '이미지 프롬프트를 먼저 생성하거나 입력하세요.'); await autoGenPrompt(); return; }
  const preview = document.getElementById('image-preview');
  preview.innerHTML = '<div class="loading-state"><div class="spinner big-spinner"></div>AI 이미지 생성 중...</div>';
  updateApiStatus('working');
  try {
    // gemini-2.0-flash-exp-image-generation: 무료 API 키로 사용 가능한 이미지 생성 모델
    const body = {
      contents: [{ parts: [{ text: promptText }] }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
    };
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${state.apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `HTTP ${res.status}`); }
    const data = await res.json();
    // 응답에서 inlineData(base64 이미지) 추출
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
    if (!imgPart) throw new Error('이미지 데이터를 찾을 수 없습니다. 프롬프트를 수정 후 다시 시도하세요.');
    const mimeType = imgPart.inlineData.mimeType;
    const b64 = imgPart.inlineData.data;
    const src = `data:${mimeType};base64,${b64}`;
    state.generatedImage = src;
    preview.innerHTML = `<img src="${src}" alt="Generated" />`;
    document.getElementById('save-img-btn').disabled = false;
    markStepComplete(3); showToast('success', '🎨 이미지 생성 완료!');
    // 이미지 완료 후 미리보기 배너 표시
    const banner = document.getElementById('image-done-banner');
    if (banner) { banner.style.display = 'flex'; banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  } catch (err) {
    preview.innerHTML = `<div style="width:100%;height:100%;background:linear-gradient(135deg,#0d2847,#003a3a,#001a1a);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;"><div style="font-size:11px;font-family:var(--font-mono);color:var(--teal);letter-spacing:0.2em;">IMAGE GEN</div><div style="font-size:32px;font-weight:700;color:var(--text);font-family:var(--font-display);letter-spacing:0.1em;">${state.topic || state.category}</div><div style="font-size:11px;color:var(--text3);">${state.region} · ${state.category}</div><div style="font-size:10px;color:var(--red);margin-top:10px;">⚠ ${err.message}</div></div>`;
    showToast('error', '❌ 이미지 생성 실패: ' + err.message);
    updateApiStatus('error');
  } finally { updateApiStatus('connected'); }
}

function saveImage() {
  if (!state.generatedImage) return;
  const a = document.createElement('a'); a.href = state.generatedImage; a.download = `news_image_${Date.now()}.png`; a.click();
}

// ============================================================
// TTS — Web Speech API (브라우저 내장, API 키 불필요)
// ============================================================

// 음성 목록 초기화 (페이지 로드 시 호출)
function initTTSVoices() {
  const sel = document.getElementById('tts-voice-select');
  if (!sel) return;
  const populate = () => {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;
    sel.innerHTML = '';
    // 한국어 우선, 그 다음 영어, 나머지
    const kr = voices.filter(v => v.lang.startsWith('ko'));
    const en = voices.filter(v => v.lang.startsWith('en'));
    const rest = voices.filter(v => !v.lang.startsWith('ko') && !v.lang.startsWith('en'));
    const addGroup = (label, list) => {
      if (!list.length) return;
      const grp = document.createElement('optgroup'); grp.label = label;
      list.forEach(v => {
        const o = document.createElement('option');
        o.value = v.name; o.textContent = v.name + ' (' + v.lang + ')';
        if (v.default) o.selected = true;
        grp.appendChild(o);
      });
      sel.appendChild(grp);
    };
    addGroup('🇰🇷 한국어', kr);
    addGroup('🇺🇸 영어', en);
    addGroup('기타', rest);
    // 한국어 음성이 있으면 첫 번째 선택
    if (kr.length) sel.value = kr[0].name;
  };
  populate();
  window.speechSynthesis.onvoiceschanged = populate;
}

// TTS 상태 변수
const ttsState = { utterance: null, isPlaying: false, totalChars: 0, spokenChars: 0, text: '' };

function ttsSetStatus(icon, text, sub, color) {
  const ic = document.getElementById('tts-status-icon');
  const tx = document.getElementById('tts-status-text');
  const sb = document.getElementById('tts-status-sub');
  if (ic) ic.textContent = icon;
  if (tx) { tx.textContent = text; tx.style.color = color || 'var(--text)'; }
  if (sb && sub !== null) sb.textContent = sub;
}

function ttsSetProgress(pct, label) {
  const wrap = document.getElementById('tts-progress-wrap');
  const bar = document.getElementById('tts-progress-bar');
  const pctEl = document.getElementById('tts-progress-pct');
  const lblEl = document.getElementById('tts-progress-label');
  if (wrap) wrap.style.display = pct >= 0 ? 'block' : 'none';
  if (bar) bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
  if (pctEl) pctEl.textContent = Math.round(pct) + '%';
  if (lblEl && label) lblEl.textContent = label;
}

async function generateTTS() {
  const article = state.generatedArticle || document.getElementById('article-textarea').value;
  if (!article || !article.trim()) { showToast('info', '먼저 기사를 작성하세요.'); return; }

  // 이미 재생 중이면 정지 후 재시작
  window.speechSynthesis.cancel();
  ttsState.isPlaying = false;

  const cleanText = article.replace(/[#*`_~\[\]]/g, '').replace(/\n{2,}/g, '\n').trim().slice(0, 5000);
  ttsState.text = cleanText;
  ttsState.totalChars = cleanText.length;
  ttsState.spokenChars = 0;

  // 기사 미리보기
  const preview = document.getElementById('tts-text-preview');
  if (preview) { preview.style.display = 'block'; preview.textContent = cleanText.slice(0, 300) + (cleanText.length > 300 ? '...' : ''); }

  const voiceName = document.getElementById('tts-voice-select')?.value;
  const rate = parseFloat(document.getElementById('tts-rate')?.value || 1);
  const voices = window.speechSynthesis.getVoices();
  const selectedVoice = voices.find(v => v.name === voiceName) || voices.find(v => v.lang.startsWith('ko')) || voices[0];

  const utter = new SpeechSynthesisUtterance(cleanText);
  if (selectedVoice) utter.voice = selectedVoice;
  utter.lang = selectedVoice?.lang || 'ko-KR';
  utter.rate = rate;
  utter.pitch = 1;
  utter.volume = 1;
  ttsState.utterance = utter;

  // 이벤트 핸들러
  utter.onstart = () => {
    ttsState.isPlaying = true;
    ttsSetStatus('🔊', '낭독 중...', (selectedVoice?.name || '기본 음성') + ' · ' + rate + 'x 속도', 'var(--teal)');
    ttsSetProgress(0, '시작...');
    document.getElementById('tts-stop-btn').disabled = false;
    document.getElementById('tts-gen-btn').querySelector('span').textContent = '🔄 재시작';
  };

  utter.onboundary = (e) => {
    // 단어 경계마다 진행도 업데이트
    if (e.name === 'word' && e.charIndex !== undefined) {
      ttsState.spokenChars = e.charIndex;
      const pct = (e.charIndex / ttsState.totalChars) * 100;
      const remaining = Math.max(0, ttsState.totalChars - e.charIndex);
      const estSec = Math.round(remaining / (rate * 6)); // 평균 글자/초 추정
      const mm = Math.floor(estSec / 60);
      const ss = estSec % 60;
      ttsSetProgress(pct, '읽는 중... (남은 시간 약 ' + mm + ':' + String(ss).padStart(2, '0') + ')');
      document.getElementById('tts-time-display').textContent = Math.round(pct) + '%';
    }
  };

  utter.onend = () => {
    ttsState.isPlaying = false;
    ttsSetStatus('✅', '낭독 완료!', '전체 재생 완료 · 아래 저장 버튼으로 스크립트를 저장할 수 있습니다.', 'var(--green)');
    ttsSetProgress(100, '완료!');
    document.getElementById('tts-stop-btn').disabled = true;
    document.getElementById('tts-save-btn').disabled = false;
    document.getElementById('tts-time-display').textContent = '완료';
    markStepComplete(3);
    showToast('success', '🎙️ TTS 낭독 완료!');
    // 미리보기 배너 표시
    const banner = document.getElementById('image-done-banner');
    if (banner && banner.style.display === 'none') {
      banner.style.display = 'flex'; banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  utter.onerror = (e) => {
    if (e.error === 'interrupted' || e.error === 'canceled') return;
    ttsState.isPlaying = false;
    ttsSetStatus('❌', 'TTS 오류: ' + e.error, '다시 시도하거나 다른 음성을 선택하세요.', 'var(--red)');
    ttsSetProgress(-1, '');
    document.getElementById('tts-stop-btn').disabled = true;
    showToast('error', '❌ TTS 실패: ' + e.error);
  };

  window.speechSynthesis.speak(utter);
  showToast('info', '🎙️ 기사 낭독 시작! 음성: ' + (selectedVoice?.name || '기본'));
}

function ttsStop() {
  window.speechSynthesis.cancel();
  ttsState.isPlaying = false;
  ttsSetStatus('⏹', '낭독 정지됨', '다시 생성하려면 TTS 생성 버튼을 누르세요.', 'var(--text2)');
  ttsSetProgress(-1, '');
  document.getElementById('tts-stop-btn').disabled = true;
  document.getElementById('tts-gen-btn').querySelector('span').textContent = '🎙️ TTS 생성 · 재생';
}

// 텍스트 스크립트를 .txt로 저장 (브라우저 TTS는 오디오 파일 저장 불가 — 스크립트 저장)
function ttsSaveMp3() {
  const text = ttsState.text || (state.generatedArticle || '').replace(/[#*`_~\[\]]/g, '');
  if (!text) { showToast('info', '저장할 내용이 없습니다.'); return; }
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tts_script_' + Date.now() + '.txt';
  a.click();
  showToast('success', '📄 TTS 스크립트 저장 완료!');
}

// 구 saveTTSAudio 호환용 (미리보기 저장 버튼)
function saveTTSAudio() { ttsSaveMp3(); }
function togglePlay() { if (ttsState.isPlaying) ttsStop(); else generateTTS(); }


// PREVIEW — 신문지 레이아웃 업데이트
function updatePreview() {
  const article = state.generatedArticle || document.getElementById('article-textarea').value || '';
  const regionNames = { KR: 'KOREA EDITION', US: 'UNITED STATES EDITION', GB: 'UNITED KINGDOM EDITION' };
  const catNames = { '경제': 'ECONOMY', '정치': 'POLITICS', '사회': 'SOCIETY', 'IT/과학': 'TECH & SCIENCE', '생활/문화': 'LIFESTYLE', '세계': 'WORLD', '연예/예술': 'ENTERTAINMENT', '스포츠': 'SPORTS' };

  document.getElementById('np-region').textContent = regionNames[state.region] || state.region;
  document.getElementById('np-date').textContent = getTodayStr();
  document.getElementById('np-cat').textContent = catNames[state.category] || state.category.toUpperCase();

  const titleMatch = article.match(/^#\s+(.+)/m);
  const title = titleMatch ? titleMatch[1] : (state.topic || state.category + ' 뉴스');
  document.getElementById('np-headline').textContent = title;

  const subMatch = article.match(/^##\s+(.+)/m);
  const subEl = document.getElementById('np-subhead');
  if (subMatch) { subEl.textContent = subMatch[1]; subEl.style.display = 'block'; }
  else { subEl.style.display = 'none'; }

  const bylineMatch = article.match(/^(?:\*\*)?(.+기자|by\s+.+|AI NEWS ROOM.+)(?:\*\*)?$/im);
  document.getElementById('np-byline').textContent = bylineMatch ? bylineMatch[1] : `AI NEWS ROOM · ${getTodayStr()} · Professional Edition`;

  if (state.generatedImage) {
    const frame = document.getElementById('np-image-frame');
    frame.style.display = 'block';
    document.getElementById('np-image').src = state.generatedImage;
    document.getElementById('np-caption').textContent = `AI Generated · ${state.imgStyle} · ${state.category}`;
  }

  const bodyText = article.replace(/^#.+$/gm, '').replace(/^##.+$/gm, '').replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '').trim();
  const paragraphs = bodyText.split(/\n\n+/).filter(p => p.trim().length > 10);
  const bodyEl = document.getElementById('np-body');
  if (paragraphs.length > 0) {
    bodyEl.innerHTML = paragraphs.map(p => `<p>${p.trim()}</p>`).join('');
  } else {
    bodyEl.innerHTML = '<p>기사 내용이 없습니다.</p>';
  }

  const words = bodyText.trim() ? bodyText.trim().split(/\s+/).length : 0;
  document.getElementById('meta-words').textContent = words;
  document.getElementById('meta-sources').textContent = state.selectedArticlesData.length || state.articles.length;
  document.getElementById('meta-has-image').textContent = state.generatedImage ? '✓' : '—';

  // 출처 기사 목록 렌더링
  const sourcesPanel = document.getElementById('preview-sources-panel');
  const sourcesList = document.getElementById('preview-sources-list');
  const sourcesCount = document.getElementById('preview-sources-count');
  const sourcesData = state.selectedArticlesData.length > 0 ? state.selectedArticlesData : [];
  if (sourcesPanel && sourcesList && sourcesData.length > 0) {
    sourcesPanel.style.display = 'block';
    sourcesCount.textContent = sourcesData.length + '건';
    sourcesList.innerHTML = '';
    sourcesData.forEach((a, i) => {
      const item = document.createElement('div');
      item.style.cssText = 'background:var(--bg4); border-radius:8px; padding:11px 14px; border-left:3px solid var(--teal); display:flex; align-items:flex-start; gap:12px;';
      const hasUrl = a.url && a.url !== '#';
      const urlHtml = hasUrl ? '<a href="' + a.url + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;font-family:var(--font-mono);font-size:10px;color:var(--teal);text-decoration:none;margin-top:5px;padding:3px 8px;background:var(--teal-dim);border:1px solid var(--border-teal);border-radius:4px;" onclick="event.stopPropagation()">🔗 원본</a>' : '';
      item.innerHTML =
        '<span style="font-family:var(--font-mono);font-size:9px;background:var(--bg3);padding:2px 7px;border-radius:4px;color:var(--teal);white-space:nowrap;margin-top:2px;">#' + (i + 1) + '</span>' +
        '<div style="flex:1;min-width:0;">' +
        '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px;">' +
        '<span style="font-size:11px;font-weight:700;color:var(--text2);">' + (a.source || '') + '</span>' +
        '<span class="card-badge">' + (a.date || '') + '</span>' +
        (a.author ? '<span class="card-badge">' + a.author + '</span>' : '') +
        '</div>' +
        '<div style="font-size:12px;font-weight:700;color:var(--text);line-height:1.5;margin-bottom:2px;">' + (a.title || '') + '</div>' +
        urlHtml +
        '</div>';
      sourcesList.appendChild(item);
    });
  } else if (sourcesPanel) {
    sourcesPanel.style.display = 'none';
  }
}

// 기사 HTML 저장 (신문지 레이아웃 포함)
function exportArticle() {
  const article = state.generatedArticle || document.getElementById('article-textarea').value;
  if (!article) { showToast('info', '먼저 기사를 작성하세요.'); return; }

  const titleMatch = article.match(/^#\s+(.+)/m);
  const title = titleMatch ? titleMatch[1] : (state.topic || state.category);
  const bodyText = article.replace(/^#.+$/gm, '').replace(/^##.+$/gm, '').replace(/\*\*/g, '').replace(/`/g, '').trim();
  const paragraphs = bodyText.split(/\n\n+/).filter(p => p.trim().length > 10);

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${title} — AI NEWS ROOM</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Noto+Sans+KR:wght@300;400;700;900&family=Space+Mono&display=swap');
body { margin:0; padding:40px; background:#f4e8c1; background-image:radial-gradient(ellipse at 20% 50%,rgba(139,119,80,0.15) 0%,transparent 50%),radial-gradient(ellipse at 80% 20%,rgba(139,119,80,0.1) 0%,transparent 50%); min-height:100vh; }
.newspaper { max-width:800px; margin:0 auto; padding:40px 48px; position:relative; color:#2a2218; }
.newspaper::after { content:''; position:absolute; inset:8px; border:1px solid rgba(139,119,80,0.25); pointer-events:none; }
.np-header { text-align:center; border-bottom:3px double #2a2218; padding-bottom:12px; margin-bottom:16px; }
.np-masthead { font-family:'Bebas Neue',serif; font-size:52px; letter-spacing:0.12em; color:#1a1510; text-transform:uppercase; }
.np-dateline { font-family:'Space Mono',monospace; font-size:10px; letter-spacing:0.3em; color:#6b5d4f; margin-top:6px; display:flex; justify-content:space-between; text-transform:uppercase; }
.np-rule { height:3px; background:#2a2218; margin:0 0 16px; }
h1 { font-family:'Noto Sans KR',serif; font-size:28px; font-weight:900; color:#1a1510; line-height:1.25; text-align:center; margin-bottom:14px; }
.byline { font-family:'Space Mono',monospace; font-size:9px; letter-spacing:0.15em; color:#8b7750; text-align:center; text-transform:uppercase; margin-bottom:14px; }
.np-img { border:1px solid #b8a88a; padding:4px; margin-bottom:12px; background:#ede2c8; }
.np-img img { width:100%; display:block; filter:sepia(0.2) contrast(1.05); }
.np-caption { font-family:'Space Mono',monospace; font-size:9px; color:#8b7750; text-align:center; margin-top:4px; font-style:italic; }
.body-text { column-count:2; column-gap:28px; column-rule:1px solid #c4b496; font-family:'Noto Sans KR',serif; font-size:13px; line-height:1.85; color:#2a2218; text-align:justify; }
.body-text p { margin-bottom:12px; text-indent:1.2em; }
.body-text p:first-child { text-indent:0; }
.body-text p:first-child::first-letter { font-size:42px; float:left; line-height:1; margin:2px 8px 0 0; font-weight:900; font-family:Georgia,serif; }
.footer { border-top:2px solid #2a2218; margin-top:20px; padding-top:10px; font-family:'Space Mono',monospace; font-size:8px; color:#8b7750; letter-spacing:0.2em; text-align:center; text-transform:uppercase; }
</style>
</head>
<body>
<div class="newspaper">
  <div class="np-header">
    <div class="np-masthead">AI NEWS ROOM</div>
    <div class="np-dateline"><span>${state.region} EDITION</span><span>${getTodayStr()}</span><span>${state.category}</span></div>
  </div>
  <div class="np-rule"></div>
  <h1>${title}</h1>
  <div class="byline">AI NEWS ROOM · ${getTodayStr()} · Professional Edition</div>
  ${state.generatedImage ? `<div class="np-img"><img src="${state.generatedImage}" alt="${title}"/><div class="np-caption">AI Generated Image</div></div>` : ''}
  <div class="body-text">${paragraphs.map(p => `<p>${p.trim()}</p>`).join('')}</div>
  <div class="footer">AI NEWS ROOM — Professional Intelligence Edition — Powered by Gemini</div>
</div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `newspaper_${Date.now()}.html`; a.click();
  showToast('success', '📰 신문지 레이아웃 HTML 저장 완료!');
}

// TTS 오디오를 WAV 파일로 저장
function saveTTSAudio() {
  if (!state.audioBuffer) { showToast('info', '먼저 TTS 오디오를 생성하세요.'); return; }
  const buffer = state.audioBuffer;
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const wavBuffer = new ArrayBuffer(44 + length * numChannels * 2);
  const view = new DataView(wavBuffer);
  function writeString(offset, str) { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); }
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length * numChannels * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length * numChannels * 2, true);
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }
  const blob = new Blob([wavBuffer], { type: 'audio/wav' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `tts_audio_${Date.now()}.wav`; a.click();
  showToast('success', '🎙️ TTS 오디오 WAV 저장 완료!');
}

// 전체 결과물 일괄 저장
function saveAllBundle() {
  let saved = 0;
  const article = state.generatedArticle || document.getElementById('article-textarea').value;
  if (article) { exportArticle(); saved++; }
  if (state.generatedImage) { setTimeout(() => { saveImage(); saved++; }, 300); }
  if (state.audioBuffer) { setTimeout(() => { saveTTSAudio(); saved++; }, 600); }
  if (article) { setTimeout(() => { downloadArticle(); saved++; }, 900); }
  if (saved === 0) { showToast('info', '저장할 컨텐츠가 없습니다. 먼저 기사를 작성하세요.'); }
  else { setTimeout(() => showToast('success', `📦 ${saved}개 파일 일괄 저장 시작!`), 200); }
}

// STEP COMPLETION
function markStepComplete(step) {
  state.completedSteps.add(step);
  const nav = document.getElementById('nav-' + step);
  const badge = document.getElementById('badge-' + step);
  if (nav) nav.classList.add('completed');
  if (badge) { badge.textContent = '✓'; badge.style.background = 'var(--green)'; badge.style.color = '#000'; }
}

// RESET
function resetAll() {
  if (!confirm('모든 데이터를 초기화하시겠습니까?')) return;
  state.articles = []; state.selectedArticles.clear(); state.selectedArticlesData = [];
  state.generatedArticle = ''; state.generatedImage = null; state.audioBuffer = null; state.completedSteps.clear();
  state.analysisResult = null;
  document.getElementById('article-textarea').value = '';
  document.getElementById('collected-articles-grid').innerHTML = '';
  document.getElementById('collected-results-panel').style.display = 'none';
  document.getElementById('research-progress-panel').style.display = 'none';
  document.getElementById('selected-articles-detail').innerHTML = '';
  document.getElementById('log-box').innerHTML = '';
  document.getElementById('image-preview').innerHTML = '<div class="image-placeholder"><div class="big-icon">🖼️</div><p>이미지를 생성하면 여기에 표시됩니다</p></div>';
  document.getElementById('sb-count').textContent = '0';
  // 새 UI 패널 초기화
  const articleBanner = document.getElementById('article-done-banner');
  if (articleBanner) articleBanner.style.display = 'none';
  const imgBanner = document.getElementById('image-done-banner');
  if (imgBanner) imgBanner.style.display = 'none';
  const writePanel = document.getElementById('write-sources-panel');
  if (writePanel) { writePanel.style.display = 'none'; document.getElementById('write-sources-list').innerHTML = ''; }
  const imgInfo = document.getElementById('img-article-info');
  if (imgInfo) imgInfo.style.display = 'none';
  const previewPanel = document.getElementById('preview-sources-panel');
  if (previewPanel) previewPanel.style.display = 'none';
  const gotoImgBtn = document.getElementById('goto-image-btn');
  if (gotoImgBtn) { gotoImgBtn.disabled = true; gotoImgBtn.style.opacity = '0.4'; gotoImgBtn.style.cursor = 'not-allowed'; }
  // 분석 결과 패널 초기화
  ['analysis-progress-panel', 'analysis-summary-panel', 'analysis-facts-panel', 'analysis-perspectives-panel', 'analysis-storyline-panel', 'analysis-factcheck-panel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  for (let i = 0; i < 5; i++) { document.getElementById('nav-' + i)?.classList.remove('completed'); const badge = document.getElementById('badge-' + i); if (badge) { badge.textContent = i + 1; badge.style.background = ''; badge.style.color = ''; } }
  goPage(0); showToast('info', '🔄 초기화 완료');
}

// TOAST
let toastTimer;
function showToast(type, msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg; toast.className = 'show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = ''; }, 3500);
}

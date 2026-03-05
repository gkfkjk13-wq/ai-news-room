// STATE
const state = {
  apiKey: localStorage.getItem('gemini_api_key') || '',
  region: 'KR',
  topic: '',
  maxArticles: 5,
  articleStyle: '객관적 보도',
  lang: 'ko',
  imgStyle: 'Photorealistic',
  aspectRatio: '16:9',
  articles: [],
  selectedArticles: new Set(),
  selectedArticlesData: [],
  generatedArticle: '',
  analysisResult: null,
  generatedImage: null,
  audioBuffer: null,
  audioSource: null,
  isPlaying: false,
  currentPage: 0,
  articleSources: '',
  completedSteps: new Set(),
  archive: JSON.parse(localStorage.getItem('news_archive') || '[]'),
  ttsGender: 'female',
};


// Global Utility: Robust JSON Parsing
const parseJson = (text) => {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    try {
      return JSON.parse(text.substring(start, end + 1));
    } catch (e) {
      console.error('JSON Parse error:', e, 'Raw text:', text);
      return null;
    }
  }
  return null;
};

const WHITELIST = {
  KR: ['chosun.com', 'joins.com', 'donga.com', 'hani.co.kr', 'mk.co.kr', 'hankyung.com', 'yonhapnews.co.kr', 'yna.co.kr', 'news1.kr', 'newsis.com'],
  US: ['nytimes.com', 'washingtonpost.com', 'reuters.com', 'apnews.com', 'wsj.com', 'bloomberg.com', 'cnbc.com', 'cnn.com', 'bbc.com', 'theguardian.com'],
  GB: ['bbc.co.uk', 'theguardian.com', 'telegraph.co.uk', 'thetimes.co.uk', 'ft.com', 'independent.co.uk', 'sky.com', 'mirror.co.uk'],
};

// 핵심 블랙리스트 (검색 엔진 쿼리에 직접 포함 - 확실한 비뉴스 사이트만)
const CORE_BLACKLIST = [
  'namu.wiki', 'youtube.com', 'x.com', 'twitter.com', 'facebook.com', 'instagram.com', 'tiktok.com',
  'dcinside.com', 'fmkorea.com', 'clien.net', 'ruliweb.com', 'slrclub.com', 'theqoo.net', 'instiz.net',
  'wikipedia.org', 'fandom.com', 'wikitree.co.kr', 'play.google.com', 'google.com/store'
];

// 확장 블랙리스트 (수집된 결과에서 자바스크립트로 정밀 필터링 - 범위를 넓게 잡아도 검색 결과에 영향을 주지 않음)
const EXTENDED_BLACKLIST = [
  'alphasquare.co.kr', 'stock.naver.com', 'finance.naver.com', 'finance.daum.net', 'investing.com',
  'tradingview.com', 'paxnet.co.kr', 'fnguide.com', 'infomax.co.kr', 'vneconomy.vn', 'vneconomy.com.vn',
  'github.com', 'linkedin.com', 'coupang.com', 'danawa.com', 'auction.co.kr', 'gmarket.co.kr',
  'samsung.com', 'lg.com', 'hyundai.com', 'sk.com', 'mancity.com', 'liverpoolfc.com', 'tottenhamhotspur.com',
  'chelseafc.com', 'realmadrid.com', 'fcbarcelona.com', 'manutd.com', 'arsenal.com', 'goal.com',
  'ticketmaster.com', 'viagogo.com', 'safetickets.net', 'about-us', 'company', 'official', 'newsroom', 'shop.', 'store.'
];

// 검색 쿼리는 가볍게 유지 (검색 실패 방지)
const BLACKLIST_QUERY = CORE_BLACKLIST.map(site => `-site:${site}`).join(' ') + ' -inurl:blog -inurl:cafe';



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
  if (n === 5) renderArchive();
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


function selectStyle(el, s) {
  const panel = el.closest('.panel');
  panel.querySelectorAll('.style-choice-btn, .region-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  state.articleStyle = s;
}

function selectLang(el, l) {
  el.closest('.panel').querySelectorAll('.region-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  state.lang = l;
}

function selectImgStyle(el, s) {
  const panel = el.closest('.panel');
  panel.querySelectorAll('.style-choice-btn, .style-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  state.imgStyle = s;

  // 스타일 선택 시 프롬프트를 자동으로 다시 설계하도록 호출 (원활한 UX를 위해)
  const articleArea = document.getElementById('article-textarea');
  const content = (articleArea ? articleArea.value : '') || state.generatedArticle || state.topic;
  if (content && content.trim().length > 10) {
    autoGenPrompt();
  }
}

function selectAspectRatio(el, r) {
  el.parentElement.querySelectorAll('.region-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  state.aspectRatio = r;
}

function updateMaxArticles(val) {
  state.maxArticles = parseInt(val);
  document.getElementById('max-articles-display').textContent = val + '건';
  // Update the side label text
  const sliderContainer = document.getElementById('max-articles-slider').parentElement;
  sliderContainer.querySelector('span').textContent = val + '건';
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

// REGION CONFIG (대한민국 전용)
const REGION_CONFIG = {
  KR: {
    name: '대한민국',
    language: 'Korean',
    searchLang: 'ko',
    siteFilter: 'site:yna.co.kr OR site:news1.kr OR site:newsis.com OR site:kbs.co.kr OR site:ytn.co.kr OR site:mk.co.kr OR site:hankyung.com OR site:sbs.co.kr OR site:mbc.co.kr OR site:chosun.com OR site:joongang.co.kr OR site:donga.com OR site:hani.co.kr OR site:seoul.co.kr OR site:nocutnews.co.kr OR site:naver.com OR site:daum.net',
    instruction: '반드시 대한민국 1티어 언론사(공중파 3사, 종편, 주요 일간지, 통신 3사)의 공식 기사 페이지를 수집하세요.',
    outlets: '연합뉴스, 뉴스1, 뉴시스, KBS, MBC, SBS, YTN, 매일경제, 한국경제, 조선일보, 중앙일보, 동아일보, 한겨레, 서울신문, 노컷뉴스 등',
  }
};

// RESEARCH - Improved 2-Stage Process
async function startResearch() {
  if (!state.apiKey) { openModal(); return; }

  state.topic = document.getElementById('topic-input').value.trim();
  if (!state.topic) {
    showToast('warn', '⚠️ 검색할 키워드를 입력해주세요.');
    return;
  }

  const regionCfg = REGION_CONFIG[state.region];
  try {
    document.getElementById('research-progress-panel').style.display = 'block';
    document.getElementById('collected-results-panel').style.display = 'none';
    document.getElementById('log-box').innerHTML = '';
    updateApiStatus('working');

    const today = new Date();
    const todayISO = today.toISOString().split('T')[0];

    addLog('info', `📡 [${regionCfg.name}] 뉴스 엔진 가동 — 주제: ${state.topic}`);
    setProgress(10, '구글 뉴스 실시간 탐색 중...');

    // 오늘부터 3일 전 날짜 계산
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const dateLimit = threeDaysAgo.toISOString().split('T')[0];

    addLog('info', `🔎 [날짜 필터] ${dateLimit} 이후의 최신 기사 탐색 중...`);
    setProgress(30, '기사 수집 중...');

    // 블랙리스트 통합 (프롬프트에도 삽입)
    const ALL_BLACKLIST = [...CORE_BLACKLIST, ...EXTENDED_BLACKLIST];
    const blockListText = 'youtube.com, x.com, twitter.com, facebook.com, instagram.com, tiktok.com, play.google.com, namu.wiki, wikipedia.org, manutd.com, realmadrid.com, fcbarcelona.com, mancity.com, chelseafc.com, liverpoolfc.com, arsenal.com, goal.com, fandom.com';

    const listPrompt = `
      [검색어]: "${state.topic}" 
      [언어]: 한국어 (Korean)
      [검색 방법]: 반드시 Google 검색의 "뉴스" 탭에서 한국어 기사를 검색하라.
      
      너는 전문 뉴스 크롤러 'ATLAS'다.
      
      [미션]:
      "${state.topic}" 를 구글 뉴스 탭(Google News Tab)에서 검색했을 때 나오는 
      **한국 언론사의 최신 뉴스 기사** 상위 7건을 가져와라.
      
      [절대 금지 목록 - 아래 사이트의 URL은 절대 포함하지 마라]:
      ${blockListText}
      그 외에도 공식 홈페이지, 앱스토어, 쇼핑몰, SNS, 위키, 블로그, 카페는 절대 금지.
      
      [허용 대상]:
      오직 전문 뉴스 언론사(예: 연합뉴스, KBS, MBC, SBS, YTN, 조선일보, 중앙일보, 동아일보, 
      한겨레, 매일경제, 한국경제, 스포츠경향, 스포츠조선, 네이트 뉴스, 다음 뉴스 등)의 
      개별 기사 상세 페이지만 허용한다.
      
      [반환 형식]: 반드시 JSON으로만 답변하라. 다른 텍스트 없이 JSON만.
      {"news": [{"title": "기사제목", "source": "언론사", "url": "기사URL", "date": "날짜", "snippet": "요약"}]}
    `;

    let searchResults = [];
    let attempt = 0;
    const maxAttempts = 3;

    while (searchResults.length < 3 && attempt < maxAttempts) {
      attempt++;
      try {
        addLog('info', `🔍 [시도 ${attempt}/${maxAttempts}] 구글 뉴스 탭 검색 중... (현재 ${searchResults.length}건 확보)`);
        let rawList = await callGeminiWithSearch(listPrompt);
        let parsed = parseJson(rawList);
        if (parsed && Array.isArray(parsed.news)) {
          // ===== 강화된 3중 필터링 =====
          // 비뉴스 소스명 차단 (Gemini redirect URL이라 URL 체크가 안 되므로 소스명으로 차단)
          const NON_NEWS_SOURCES = [
            '위키백과', '위키피디아', 'wikipedia', 'wiki', '나무위키', 'namuwiki', 'namu',
            '유튜브', 'youtube', '페이스북', 'facebook', '인스타그램', 'instagram',
            '트위터', 'twitter', 'x.com', '틱톡', 'tiktok',
            '구글 플레이', 'google play', 'play store', 'app store',
            '맨시티', 'mancity', 'manchester city fc', 'mcfc 소개',
            '맨유', 'manutd', 'manchester united',
            '첼시', 'chelseafc', '리버풀', 'liverpoolfc', '아스널', 'arsenal',
            '레알마드리드', 'real madrid', '바르셀로나', 'fc barcelona',
            '삼성전자', 'samsung.com', 'lg전자', 'lg.com',
            '현대자동차', 'hyundai.com', 'sk', '네이버 블로그', '다음 카페',
            'github', 'linkedin', '쿠팡', 'coupang'
          ];

          // 비뉴스 제목 패턴 (소개 페이지, 위키, 공식 사이트 등)
          const NON_NEWS_TITLE_PATTERNS = [
            /위키백과/i, /위키피디아/i, /나무위키/i,
            /소개\s*[-–—]/i, /^소개/i, /공식\s*(홈페이지|사이트|웹)/i,
            /^.{0,5}FC$/i, /히스토리/i, /연혁/i, /about\s*us/i,
            /프로필/i, /선수단\s*(소개|명단)/i
          ];

          const filtered = parsed.news.filter(art => {
            if (!art.url) return false;
            const urlLower = art.url.toLowerCase();
            const sourceLower = (art.source || '').toLowerCase();
            const titleLower = (art.title || '').toLowerCase();

            // 1차: 소스명 차단 (가장 핵심!)
            const sourceBlocked = NON_NEWS_SOURCES.some(s => sourceLower.includes(s.toLowerCase()));
            if (sourceBlocked) {
              addLog('warn', `  🚫 비뉴스 소스 차단: [${art.source}] ${art.title?.slice(0, 30)}...`);
              return false;
            }

            // 2차: 제목 패턴 차단
            const titleBlocked = NON_NEWS_TITLE_PATTERNS.some(p => p.test(art.title || ''));
            if (titleBlocked) {
              addLog('warn', `  🚫 비뉴스 제목 차단: [${art.source}] ${art.title?.slice(0, 30)}...`);
              return false;
            }

            // 3차: URL 차단 (실제 URL이 보이는 경우 대비)
            const urlBlocked = ALL_BLACKLIST.some(keyword => urlLower.includes(keyword));
            if (urlBlocked) {
              addLog('warn', `  🚫 URL 차단: ${art.url.substring(0, 50)}...`);
              return false;
            }

            return true;
          });
          // 중복 제거하며 추가
          filtered.forEach(art => {
            if (!searchResults.some(existing => existing.url === art.url)) {
              searchResults.push(art);
            }
          });
          addLog('ok', `✅ ${filtered.length}건의 유효 기사 확보 (차단: ${parsed.news.length - filtered.length}건)`);
        }
      } catch (err) {
        console.error(`Search attempt ${attempt} failed:`, err);
        addLog('warn', `⚠️ 검색 시도 ${attempt} 실패, 재시도...`);
      }
    }

    if (searchResults.length === 0) {
      addLog('err', '❌ 유효한 뉴스 기사를 찾지 못했습니다. 키워드를 변경해보세요.');
      setProgress(100, '탐색 결과 없음');
      updateApiStatus('error');
      return;
    }

    // [중복 기사 제거] 제목 유사도 비교
    const normalize = (t) => t.replace(/[\s""''…·\-_,.'"\[\](){}!?:;]/g, '').toLowerCase();
    const similarity = (a, b) => {
      const na = normalize(a), nb = normalize(b);
      if (!na || !nb) return 0;
      // 하나가 다른 하나를 포함하면 중복
      if (na.includes(nb) || nb.includes(na)) return 1;
      // 공통 글자 비율 계산
      const longer = na.length > nb.length ? na : nb;
      const shorter = na.length > nb.length ? nb : na;
      let matches = 0;
      for (const ch of shorter) { if (longer.includes(ch)) matches++; }
      return matches / longer.length;
    };

    const uniqueArticles = [];
    searchResults.forEach(art => {
      const isDuplicate = uniqueArticles.some(existing => similarity(existing.title, art.title) > 0.6);
      if (isDuplicate) {
        addLog('warn', `  🔄 중복 제거: ${art.title.slice(0, 30)}... (${art.source})`);
      } else {
        uniqueArticles.push(art);
      }
    });
    searchResults = uniqueArticles;
    addLog('ok', `📋 중복 제거 후 ${searchResults.length}건의 고유 기사 확보`);

    // 최대 5건으로 제한
    if (searchResults.length > 5) {
      searchResults = searchResults.slice(0, 5);
      addLog('info', `📌 최대 5건으로 제한하여 처리합니다.`);
    }

    // [정밀 필터링 로직 - URL 구조 검사]
    const CATEGORY_KEYWORDS = ['/section', '/category', '/politics', '/economy', '/society', '/culture', '/world', '/entertainment', '/sports', '/index', '/home'];

    searchResults = searchResults.filter(art => {
      if (!art.url || !art.title) return false;

      // 유효한 뉴스 기사 검증 (제목과 소스 기반)
      const titleLow = (art.title || '').toLowerCase();
      const sourceLow = (art.source || '').toLowerCase();

      // 제목이 너무 짧으면 제외 (보통 뉴스 제목은 10자 이상)
      if (art.title.length < 8) {
        addLog('warn', `  ❌ 제목 너무 짧음: "${art.title}"`);
        return false;
      }

      // 비뉴스 콘텐츠 제목 패턴 최종 검사
      const badTitlePatterns = [
        /위키백과/i, /wikipedia/i, /나무위키/i, /namuwiki/i,
        /공식\s*(홈|사이트|웹)/i, /소개\s*[-–—:]/i, /^.{0,3}소개$/i,
        /about\s*us/i, /회사\s*소개/i, /연혁/i, /히스토리/i,
        /구단\s*소개/i, /선수단\s*명단/i, /^프로필/i,
        /구독/i, /앱\s*다운/i, /play\s*store/i, /app\s*store/i
      ];

      if (badTitlePatterns.some(p => p.test(art.title))) {
        addLog('warn', `  ❌ 비뉴스 콘텐츠 제거: "${art.title.slice(0, 30)}..."`);
        return false;
      }

      return true;
    });

    if (searchResults.length === 0) {
      addLog('err', '❌ 모든 경로에서 기사를 찾지 못했습니다. 키워드를 더 단순하게 입력해보세요.');
      setProgress(100, '수집 실패');
      updateApiStatus('connected');
      return;
    }

    addLog('ok', `후보 ${searchResults.length}건 발견. 내용 분석 시작...`);
    const processedArticles = [];

    for (let i = 0; i < searchResults.length; i++) {
      if (processedArticles.length >= 5) break;
      const art = searchResults[i];
      setProgress(40 + Math.round((i / searchResults.length) * 50), `분석 중: ${art.title.slice(0, 15)}...`);

      try {
        const readPrompt = `
          [기사 전문 추출 미션]:
          대상 기사: "${art.title}" (출처: ${art.source})
          URL: ${art.url}

          너는 인터넷의 모든 뉴스 데이터를 읽을 수 있는 AI 엔진이다. 
          제공된 URL이나 기사 제목을 통해 실시간 검색을 수행하여 해당 기사의 **'전문(Full Text)'**을 찾아내라.
          
          [필수 요구 사항]:
          1. **절대로 요약하지 마라.** 기사 원문에 적힌 모든 문장을 그대로 가져와라.
          2. 기사 본문의 시작부터 끝까지 누락 없이 추출하라.
          3. 기자의 이름이 있다면 포함하라.
          4. 만약 해당 URL 접근이 불가능하다면, 제목과 snippet 정보를 기반으로 기사의 상세 내용을 최대한 복원하라.

          [반환 형식 (JSON)]:
          {"relevant": true, "fullContent": "기사 전문 전체 내용...", "summary": "기사 요약(3문장)", "author": "기자명"}
        `;

        const rawContent = await callGeminiWithSearch(readPrompt);
        let obj = parseJson(rawContent);

        if (!obj || obj.relevant === false || !obj.fullContent || obj.fullContent === "FAIL") {
          addLog('warn', `  ℹ [필터링 통과] 원본 접근은 제한되나 검색 정보를 활용합니다: ${art.source}`);
          obj = {
            relevant: true,
            fullContent: art.snippet || art.title,
            summary: art.snippet || art.title,
            author: art.source || 'News Desk'
          };
        }

        processedArticles.push({
          id: processedArticles.length,
          title: art.title,
          source: art.source,
          url: art.url,
          date: art.date || todayISO,
          fullContent: obj.fullContent,
          summary: obj.summary,
          author: obj.author,
          relevance: 10
        });
        addLog('ok', `  ✓ [수집 완료] ${art.title.slice(0, 25)}...`);

      } catch (e) {
        processedArticles.push({
          id: processedArticles.length,
          title: art.title,
          source: art.source,
          url: art.url,
          date: art.date || todayISO,
          fullContent: art.snippet || art.title,
          summary: art.snippet || art.title,
          author: art.source,
          relevance: 10
        });
        addLog('warn', `  ! 검색 요약 데이터를 활용합니다: ${art.source}`);
      }
      await sleep(300);
    }

    state.articles = processedArticles;
    document.getElementById('sb-count').textContent = processedArticles.length;

    if (processedArticles.length > 0) {
      setProgress(100, `최종 ${processedArticles.length}건 확보`);
      renderCollectedArticles(processedArticles);
      markStepComplete(0);
      showToast('success', '✅ 리서치가 완료되었습니다!');
    } else {
      addLog('err', '❌ 기사 내용을 분석하는 데 실패했습니다.');
      setProgress(100, '분석 실패');
    }
    updateApiStatus('connected');
  } catch (err) {
    addLog('err', `치명적 오류: ${err.message}`);
    updateApiStatus('error');
  }
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
    const urlHtml = hasUrl ? '<div style="margin-top:12px; display:flex; flex-direction:column; gap:6px;">' +
      '<a href="' + a.url + '" target="_blank" rel="noopener" style="display:inline-flex; width:fit-content; align-items:center; gap:5px; font-family:var(--font-mono); font-size:10px; color:white; background:var(--teal); padding:5px 12px; border-radius:var(--radius-full); text-decoration:none; transition:all 0.2s;" onclick="event.stopPropagation();">🔗 원본 기사 보기</a>' +
      '<span style="font-family:var(--font-mono); font-size:9px; color:var(--text3); word-break:break-all; line-height:1.4; opacity:0.6;">Source: ' + a.url + '</span>' +
      '</div>' : '';

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
    const urlLink = hasUrl ? '<a href="' + a.url + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;font-family:var(--font-mono);font-size:10px;color:var(--teal);text-decoration:none;margin-top:8px;padding:4px 10px;background:var(--teal-dim);border:1px solid var(--border-teal);border-radius:var(--radius-sm);">🔗 원본 기사</a>' : '';
    panel.innerHTML =
      '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">' +
      '<div>' +
      '<div class="card-source" style="margin-bottom:4px;">' + a.source + '<span class="card-badge">' + a.date + '</span>' + (a.author ? '<span class="card-badge">' + a.author + '</span>' : '') + '</div>' +
      '<div style="font-size:15px; font-weight:700; color:var(--text);">' + a.title + '</div>' +
      urlLink +
      '</div>' +
      '<span class="tag">#' + (i + 1) + '</span>' +
      '</div>' +
      '<div style="font-size:12px; color:var(--text2); line-height:1.7; background:var(--bg4); border-radius:var(--radius-sm); padding:14px; max-height:200px; overflow-y:auto;">' + preview + (preview.length < (a.fullContent?.length || 0) ? '<span style="color:var(--teal);">... (전문 ' + a.fullContent.length.toLocaleString() + '자)</span>' : '') + '</div>';
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
    item.style.cssText = 'background:var(--bg4); border-radius:var(--radius-sm); padding:12px 14px; border-left:3px solid var(--teal); display:flex; flex-direction:column; gap:4px;';
    const hasUrl = a.url && a.url !== '#';
    const urlLink = hasUrl ? '<a href="' + a.url + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;font-family:var(--font-mono);font-size:10px;color:var(--teal);text-decoration:none;margin-top:4px;padding:3px 8px;background:var(--teal-dim);border:1px solid var(--border-teal);border-radius:4px;" onclick="event.stopPropagation()">🔗 원본 기사</a>' : '';
    const charCount = (a.fullContent || '').length;
    item.innerHTML =
      '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">' +
      '<span style="font-family:var(--font-mono);font-size:9px;background:var(--bg3);padding:2px 7px;border-radius:6px;color:var(--teal);">#' + (i + 1) + '</span>' +
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
  ['analysis-summary-panel', 'analysis-facts-panel', 'analysis-perspectives-panel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
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
    setAnalysisProgress(50, 'Step 1/1: 분석 중...');
    addAnalysisLog('info', '🧠 데이터 분석 시작...');
    const organizeResult = await organizeData(sourcesText, regionCfg);
    setAnalysisProgress(100, '분석 완료!');
    addAnalysisLog('ok', '✅ 통합 요약, 팩트 분류, 관점/시사점 분석 완료');

    // 분석 결과를 state에 저장 (기사 작성 시 활용)
    state.analysisResult = {
      summary: organizeResult.summary,
      facts: organizeResult.facts,
      perspectives: organizeResult.perspectives,
    };

    showToast('success', '🧠 데이터 분석 완료! 결과를 확인하세요.');
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
  const prompt = `You are an expert data analyst and journalist.Analyze the following ${state.selectedArticlesData.length} news articles about "${state.topic || state.category}" from ${regionCfg.name}.

    ARTICLES:
${sourcesText}

Perform a comprehensive multi - angle analysis and return a JSON object with these fields:

    1. "summary"(string): A comprehensive integrated summary(200 - 300 words in Korean) that synthesizes ALL articles' key points into one coherent narrative. Identify the overarching theme.

    2. "facts"(array of objects): Categorize extracted facts into logical groups.Each object has:
    - "category"(string): Category name like "사건 개요", "시장 반응", "전문가 견해", "수치 데이터", "정책 동향", "향후 전망" etc.
   - "icon"(string): A single emoji for the category
      - "items"(array of strings): 3 - 5 specific factual items extracted from the articles

    3. "perspectives"(string): Analysis of implications and future outlook(150 - 200 words in Korean).What do these articles collectively suggest ? What are the key takeaways and future implications ?

      Return ONLY valid JSON.No markdown, no code blocks.
        ${state.lang === 'ko' ? '모든 텍스트는 한국어로 작성하세요.' : 'Write all text in English.'} `;

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
      div.style.cssText = 'background:var(--bg4); border-radius:var(--radius-sm); padding:14px;';
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
    return `[출처 ${i + 1}] ${a.source} (${a.date})${a.author ? ' | 기자: ' + a.author : ''} \n제목: ${a.title} \n기사 전문: \n${content} `;
  }).join('\n\n---\n\n');

  const langInstrMap = {
    'ko': '반드시 한국어로 작성하세요.',
    'en-us': 'Write the article in American English (US). Additionally, you MUST provide a full Korean translation below the English text, separated by a horizontal line (---).'
  };
  const langInstr = langInstrMap[state.lang] || '반드시 한국어로 작성하세요.';
  const styleMap = {
    '객관적 보도': `
    [Objective News Reporting Style]
    - Core Strategy: Focus exclusively on facts using the 5W1H principle.
      - Structure: Use an 'Inverted Pyramid'(most important information at the beginning).
      - Language / Tone: Use clear, dry, and neutral language. (In Korean, use endings like "-했다", "-밝혀졌다").
      - Constraint: Strictly exclude AI's opinions or emotional adjectives. Focus on accuracy and neutrality.
      `,
    '심층 분석': `
    [In - depth Analytical Style]
    - Core Strategy: Go beyond simple facts to explore the 'Context' and 'Behind-the-scenes'.
      - Narrative: Compare data from multiple sources and find the trend.
      - Logical Phrases: Use phrases like "The cause of this phenomenon is...", "When compared to past cases...".
      - Evidence: Actively incorporate expert quotes and statistical figures.
      - Outlook: Provide a multi - faceted perspective on future ripple effects.
    `,
    '오피니언': `
    [Opinion / Editorial Style]
    - Core Strategy: Provide a clear 'Perspective' and 'Voice'(critical or optimistic).
      - Narrative: Include AI's own evaluation and suggestions (e.g., "We must focus on...", "Concerns are being raised regarding...").
      - Structure: Begin with an issue and build a strong logical argument.
      - Conclusion: End with a reflective and insightful thought - provoking closing.
    `,
    '브리핑': `
    [Concise Briefing Format]
    - Core Strategy: 'High-efficiency key summary' for busy readers.
      - Layout: Do NOT use long paragraphs.Use Bullet Points(•) and short, punchy sentences.
      - Content: Distill everything into 3 - 5 core keywords or sentences.
      - Goal: Ensure the entire content can be understood in under 30 seconds.
    `,
    'SNS 스타일': `
    [SNS / Social Media Style - HIGH ENGAGEMENT]
    - Core Strategy: Write as if a trend - savvy SNS influencer or community manager is sharing breaking news.
      - Tone: Extremely casual, friendly, and 'trendy'(Korean: '인싸 말투', '커뮤니티 말투').
      - Language:
    - Use casual endings: "~해요", "~하네요!", "~인 듯?", "~함!", "~각!"
      - Use trendy slang naturally: "폼 미쳤다", "ㄹㅇ", "실화냐", "대박", "갓...", "레전드", "ㄷㄷ", "ㅠㅠ"(only if context allows).
    - Visuals: Use lots of emojis(🔥, 🚀, ✅, �, ✨, �) at the start/end of sentences.
      - Structure:
        - Catchy Hook: Start with a punchy headline using emojis.
        - Short & Punchy: Use short paragraphs or bullet points to improve readability on mobile.
        - Personal Touch: Add a brief reaction/comment (e.g., "이건 진짜 대박 소식이네요!").
      - Engagement: Ask a direct question to the audience (e.g., "여러분의 생각은 어떤가요? 댓글로 고고! 👇").
      - Hashtags: Include 5+ relevant and trendy hashtags at the very bottom.
    `
  };

  // 분석 결과가 있으면 프롬프트에 반영
  let analysisContext = '';
  if (state.analysisResult) {
    const ar = state.analysisResult;
    analysisContext = `\n\n=== DATA ANALYSIS RESULTS (Use these to structure your article) ===
INTEGRATED SUMMARY: ${ar.summary || ''}
KEY PERSPECTIVES: ${ar.perspectives || ''}
=== END ANALYSIS ===`;
  }

  const todayStr = getTodayStr();
  const prompt = `You are an elite investigative journalist for a ${regionCfg.name} news agency.
Today is ${todayStr}. All news must be written with today's perspective.

[Ground Truth - EXCLUSIVE SOURCES]:
${sourceSummary}
${analysisContext}

[ARTICLE STYLE GUIDE]:
${styleMap[state.articleStyle] || 'objective news'}

[STRICT INSTRUCTIONS]:
1. SOURCE ADHERENCE: Use ONLY the provided sources. Do not use training data about past events unless mentioned in sources.
2. MAIN TOPIC: Focus on the primary headlines from the sources.
3. DATE LINE: Use today's date (${todayStr}).
4. ${state.articleStyle === '브리핑' ? 'STRUCTURE: Use a Bulleted List format as specified in the Style Guide.' : 'STRUCTURE: Use a professional news article structure with a Headline, Byline, Lead, Body, and Outlook.'}

[FORMATTING]:
- # [Headline]
- Byline: [Name] | ${todayStr}
${state.articleStyle === '브리핑' ? '- [Key Summary Points in Bullet Points]' : '- [Article Content in Paragraphs]'}

${langInstr}
IMPORTANT: If the style is '객관적 보도', ensure the tone is strictly neutral. If '심층 분석' or '오피니언', ensure the analytical depth or perspective is prominent.`;
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
  if (article) state.generatedArticle = article;

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
// IMAGE GENERATION - 자동 프롬프트 생성 (수정본)
async function autoGenPrompt() {
  const articleArea = document.getElementById('article-textarea');
  const promptArea = document.getElementById('img-prompt');
  const koArea = document.getElementById('img-prompt-ko');

  // 소스 데이터 확보 (에디터 내용 우선)
  const content = (articleArea ? articleArea.value : '') || state.generatedArticle || state.topic;
  if (!content || content.trim().length < 10) return;

  try {
    promptArea.value = "🤖 인텔리전스 엔진이 기사 맥락을 분석하여 시각화 프롬프트를 설계 중입니다...";
    if (koArea) koArea.style.display = 'none';

    // 기사 전문을 최대한 활용 (3000자까지 분석)
    const fullText = content.replace(/[#*]/g, '').slice(0, 3000);

    const IMAGE_STYLE_GUIDE = {
      'Photorealistic': `ultra-realistic photography, cinematic natural lighting, captured on high-end mirrorless camera with 35mm f/1.4 lens, razor-sharp textures, 8k resolution, authentic colors, hyper-detailed environments, natural bokeh, professional color grading.`,
      'Cinematic': `epic anamorphic movie shot, dramatic high-contrast lighting (chiaroscuro), volumetric rays, cinematic widescreen composition, mood-driven atmosphere, intense storytelling visual, deep shadows, professional Hollywood grade cinematography.`,
      'Editorial': `high-fashion / luxury news magazine spread style, sophisticated studio perfection, minimalist high-end aesthetic, soft key lighting, balanced composition, elegant color palette, professional editorial retouching, crisp and clean details.`,
      'Infographic': `modern professional data visualization, high-quality vector art, 3D isomorphic icons, clean topology, organized information architecture, bold accent colors, tech-driven design language, sharp lines, minimalist flat-style UI elements.`,
      'Documentary': `Pulitzer Prize winning photojournalism style, raw handheld authenticity, natural grain, candid impactful moment, gritty field photography, highly emotional street-photography, real-world grit, harsh natural light, authentic texture.`,
      'Minimalist': `extreme photographic simplicity, zen aesthetic, vast negative space, single striking subject, monochromatic or limited palette, clean geometry, calm and focused mood, pure architectural lines, no clutter.`
    };

    const styleInstruction = IMAGE_STYLE_GUIDE[state.imgStyle] || 'High resolution photography.';

    const prompt = `[Deep Article Analysis & Visual Prompt Engine v2.0]

너는 뉴스 기사를 세밀하게 분석하여 최고 수준의 이미지 프롬프트를 설계하는 비주얼 디렉터다.

====== STEP 1: 기사 전문 정밀 분석 ======
아래 기사 전문을 처음부터 끝까지 꼼꼼히 읽고, 다음 요소들을 분석하라:

[기사 전문]:
"${fullText}"

[A. 기사 흐름(Flow) 분석] — 가장 중요!
- **도입부 분위기**: 기사가 어떤 톤으로 시작하는가? (긴급속보, 담담한 전달, 충격적 사실 폭로 등)
- **전개부 전환점**: 중간에 분위기가 어떻게 바뀌는가? (악화→심화, 갈등→해소, 위기→반전 등)
- **결론부 정서**: 기사가 어떤 느낌으로 마무리되는가? (불안한 전망, 희망적 결론, 여운 있는 마무리 등)
- **전체 감정 곡선**: 위 흐름을 한 문장으로 요약 (예: "초반 충격 → 중반 분석 → 후반 불안한 전망")

[B. 핵심 요소 추출]
- **인물/주체**: 기사에 등장하는 구체적인 인물, 팀, 기관
- **장소/배경**: 사건이 벌어지는 구체적 장소
- **결정적 행동**: 기사에서 가장 극적이거나 핵심적인 순간
- **시각적 오브젝트**: 기사를 상징할 수 있는 구체적 물건/장면
- **시간대/날씨**: 기사가 암시하는 시간적 배경

====== STEP 2: 분위기 기반 프롬프트 설계 ======
위 분석에서 파악한 **기사의 전체 흐름과 분위기**를 이미지 한 장에 압축하라.
단순히 "어떤 사건이 일어났다"를 보여주는 것이 아니라, 
**그 사건이 주는 느낌, 긴장감, 감정의 무게**가 이미지에서 느껴져야 한다.

[선택된 스타일 - ${state.imgStyle}]: 
${styleInstruction}

[분위기 반영 규칙]:
1. **감정 곡선 → 색감**: 
   - 긴장/위기 → 차가운 블루톤, 낮은 채도, 강한 그림자
   - 희망/성장 → 따뜻한 골드톤, 새벽빛, 부드러운 하이라이트
   - 분노/충돌 → 강렬한 레드/오렌지 악센트, 높은 컨트라스트
   - 슬픔/아쉬움 → 탈색된 톤, 흐린 빛, 고독한 구도
   - 혼란/불확실 → 안개, 흐릿한 배경, 다중 노출 효과

2. **기사 흐름 → 구도**:
   - 갈등 심화 → 대각선 구도, 기울어진 앵글, 불안정한 프레임
   - 결론 확정 → 정면 대칭, 안정적 수평선, 명확한 초점
   - 미해결/전망 → 열린 구도, 소실점을 향한 시선 유도

3. **구체적 장면 묘사**: 
   "축구 선수"가 아닌 → "야간 조명 아래 빗줄기가 내리는 경기장에서 골라인 앞 슬라이딩하는 선수의 실루엣, 관중석의 붉은 조명이 젖은 잔디에 반사되며, 공이 골네트를 흔드는 결정적 순간"

4. **환경 디테일 필수**: 날씨, 관중, 조명 반사, 질감, 먼지/물방울/연기 같은 미세 입자까지 포함

5. **카메라**: 앵글, 렌즈(mm), 초점심도, 셔터스피드 느낌까지 명시

[절대 금지]:
- 텍스트, 글자, 로고, 숫자 포함 금지
- 추상적이고 모호한 묘사 금지 (예: "스포츠 관련 이미지" → ❌)
- 실존 인물의 얼굴 묘사 금지 (뒷모습, 실루엣, 부분만 허용)

[출력 형식 (JSON만)]:
{
  "news_category": "구체적 기사 분류",
  "flow_analysis": "도입부→전개부→결론부의 감정 흐름을 한 문장으로 요약",
  "scene_analysis": "기사의 흐름과 분위기를 가장 잘 대변하는 결정적 장면 설명 (2-3문장)",
  "visual_concept": "이미지의 핵심 컨셉 (1문장)",
  "english": "[최소 80단어의 매우 구체적이고 상세한 영어 프롬프트. 기사의 감정 흐름이 색감/조명/구도에 녹아있어야 함. 인물/배경/날씨/조명/카메라앵글/렌즈/오브젝트/미세입자/감정 모두 포함], ${state.imgStyle} style, 8k, highly detailed, no text, no letters, no logos",
  "korean": "[기사 흐름 분석] - [선택한 장면과 분위기의 한국어 설명]"
}`;


    // Use 2.0-flash for better instruction following
    const result = await callGemini(prompt, 'gemini-2.0-flash');
    const data = parseJson(result);

    if (data && data.english) {
      // Clear previous value and set only English to the textarea for clean editing
      promptArea.value = data.english.trim();

      if (data.korean && koArea) {
        koArea.textContent = '🇰🇷 ' + data.korean;
        koArea.style.display = 'block';
      } else {
        koArea.style.display = 'none';
      }
      showToast('success', '🎨 프롬프트 설계 완료! (수정 가능)');
    } else {
      // JSON Fail Fallback: Try to find anything that looks like English/Korean
      const lines = result.split('\n').map(l => l.trim()).filter(l => l);
      const engIdx = lines.findIndex(l => l.toLowerCase().includes('english') || /^[A-Za-z]/.test(l));
      if (engIdx !== -1) {
        promptArea.value = lines[engIdx].replace(/english|[:"']/gi, '').trim();
        koArea.textContent = '🇰🇷 ' + (lines[engIdx + 1] || '프롬프트 설계됨');
        koArea.style.display = 'block';
      } else {
        promptArea.value = result.replace(/[`]|json|{|}|\"english\":|\"korean\":/g, '').trim();
      }
    }
  } catch (err) {
    console.error('Prompt gen error:', err);
    promptArea.value = "";
    showToast('error', `프롬프트 생성 오류: ${err.message}`);
  }
}

async function generateImage() {
  if (!state.apiKey) { openModal(); return; }
  const promptArea = document.getElementById('img-prompt');
  const promptText = promptArea ? promptArea.value.trim() : "";
  if (!promptText || promptText.includes("생성 중")) {
    showToast('info', '이미지 프롬프트를 먼저 생성하거나 입력하세요.');
    await autoGenPrompt();
    return;
  }

  const preview = document.getElementById('image-preview');
  preview.innerHTML = '<div class="loading-state"><div class="spinner big-spinner"></div>AI 이미지 생성 중...</div>';
  updateApiStatus('working');

  try {
    // gemini-2.0-flash-exp-image-generation: 무료 API 키로 사용 가능한 이미지 생성 모델
    const body = {
      contents: [{ parts: [{ text: `${promptText} (aspect ratio ${state.aspectRatio || '1:1'})` }] }],
      generationConfig: {
        responseModalities: ['IMAGE', 'TEXT']
      }
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
    document.getElementById('np-image').src = src;
    document.getElementById('save-img-btn').disabled = false;
    const saveImgBtn2 = document.getElementById('save-img-btn2');
    if (saveImgBtn2) saveImgBtn2.disabled = false;

    markStepComplete(3);
    showToast('success', '🎨 이미지 생성 완료!');

    // 이미지 완료 후 미리보기 배너 표시
    const banner = document.getElementById('image-done-banner');
    if (banner) {
      banner.style.display = 'flex';
      banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  } catch (err) {
    console.error('Image gen error:', err);
    preview.innerHTML = `<div style="width:100%;height:100%;background:linear-gradient(135deg,#0d2847,#003a3a,#001a1a);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;"><div style="font-size:11px;font-family:var(--font-mono);color:var(--teal);letter-spacing:0.2em;">IMAGE GEN</div><div style="font-size:32px;font-weight:700;color:var(--text);font-family:var(--font-display);letter-spacing:0.1em;">${state.topic || state.category}</div><div style="font-size:11px;color:var(--text3);">${state.region} · ${state.category}</div><div style="font-size:10px;color:var(--red);margin-top:10px;">⚠ ${err.message}</div></div>`;
    showToast('error', '❌ 이미지 생성 실패: ' + err.message);
    updateApiStatus('error');
  } finally {
    updateApiStatus('connected');
  }
}

function saveImage() {
  if (!state.generatedImage) return;
  const a = document.createElement('a');
  a.href = state.generatedImage;
  a.download = `news_image_${Date.now()}.png`;
  a.click();
}

// ============================================================
// TTS — Web Speech API (브라우저 내장, API 키 불필요)
// ============================================================

// 음성 목록 초기화 (페이지 로드 시 호출)
function selectTTSGender(g) {
  state.ttsGender = g;
  const f = document.getElementById('tts-voice-female');
  const m = document.getElementById('tts-voice-male');
  if (f) f.classList.toggle('active', g === 'female');
  if (m) m.classList.toggle('active', g === 'male');
  addLog('info', `🔊 목소리 설정 변경: ${g === 'female' ? '여성' : '남성'}`);
}

// 음성 초기화 로직 (없앰 - 고정 성별 사용)
function initTTSVoices() { }

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
  const bar = document.getElementById('tts-progress-bar');
  const pctEl = document.getElementById('tts-progress-pct');
  const lblEl = document.getElementById('tts-progress-label');

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

  const rate = parseFloat(document.getElementById('tts-rate')?.value || 1);
  const voices = window.speechSynthesis.getVoices();
  const krVoices = voices.filter(v => v.lang.startsWith('ko'));
  let selectedVoice = null;
  let artificialPitch = 1.0;

  if (state.ttsGender === 'female') {
    // 여성 보이스 우선 순위
    const fTerms = ['Heami', 'Google', 'Narae', 'Yumi', 'Sun-Hi', 'Hana', 'Female'];
    selectedVoice = krVoices.find(v => fTerms.some(term => v.name.includes(term))) || krVoices[0];
    artificialPitch = 1.05; // 여성은 살짝 높게
  } else {
    // 남성 보이스 우선 순위
    const mTerms = ['Sang-bum', 'Minsu', 'Hoon', 'In-joon', 'In-jun', 'Se-yoon', 'Hee-jun', 'Kwang', 'Man', 'Male'];
    selectedVoice = krVoices.find(v => mTerms.some(term => v.name.includes(term)));

    // 만약 전용 남성 음성이 없다면, 기본 음성을 쓰고 피치를 확 낮춥니다 (남성처럼 들리게)
    if (!selectedVoice) {
      selectedVoice = krVoices[0];
      artificialPitch = 0.55; // 전용 남성 음성 없을 때 피치를 낮춰 남성 목소리 재현
    } else {
      artificialPitch = 0.95; // 이미 남성 음성이면 자연스러운 톤 유지
    }
  }

  const utter = new SpeechSynthesisUtterance(cleanText);
  if (selectedVoice) utter.voice = selectedVoice;
  utter.lang = selectedVoice?.lang || 'ko-KR';
  utter.rate = rate;
  utter.pitch = artificialPitch;
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

  document.getElementById('np-region').textContent = regionNames[state.region] || state.region;
  document.getElementById('np-date').textContent = getTodayStr();

  // 카테고리 자동 감지 (기사 내용 또는 키워드 기반)
  const topicLower = (state.topic || '').toLowerCase();
  let detectedCat = 'NEWS';
  if (/경제|주식|금리|환율|GDP|무역/.test(article) || /경제|주식|금리/.test(topicLower)) detectedCat = 'ECONOMY';
  else if (/정치|국회|의원|대통령|정부|외교/.test(article) || /정치|대통령/.test(topicLower)) detectedCat = 'POLITICS';
  else if (/사회|복지|교육|범죄|사건/.test(article) || /사회/.test(topicLower)) detectedCat = 'SOCIETY';
  else if (/IT|AI|반도체|기술|소프트웨어|스타트업/.test(article) || /IT|AI|테크/.test(topicLower)) detectedCat = 'IT & TECH';
  else if (/스포츠|축구|야구|농구|올림픽|경기|감독|선수|리그|골|승/.test(article) || /축구|야구|스포츠/.test(topicLower)) detectedCat = 'SPORTS';
  document.getElementById('np-cat').textContent = detectedCat;

  // 제목 추출: 마크다운 헤딩 → 첫 줄 → 키워드로 폴백
  const titleMatch = article.match(/^#\s+(.+)/m);
  let title = '';
  if (titleMatch) {
    title = titleMatch[1];
  } else if (article.trim().length > 0) {
    // 마크다운 헤딩이 없으면 첫 번째 줄을 제목으로 사용
    const firstLine = article.trim().split('\n')[0].replace(/[#*`]/g, '').trim();
    title = firstLine.length > 5 ? firstLine.slice(0, 60) : (state.topic || '뉴스 기사');
  } else {
    title = state.topic || '뉴스 기사';
  }
  document.getElementById('np-headline').textContent = title;

  const subMatch = article.match(/^##\s+(.+)/m);
  const subEl = document.getElementById('np-subhead');
  if (subMatch) { subEl.textContent = subMatch[1]; subEl.style.display = 'block'; }
  else { subEl.style.display = 'none'; }

  const bylineMatch = article.match(/^(?:\*\*)?(.+기자|by\s+.+|AI NEWS ROOM.+)(?:\*\*)?$/im);
  document.getElementById('np-byline').textContent = bylineMatch ? bylineMatch[1] : `AI NEWS ROOM · ${getTodayStr()} · Professional Edition`;

  const previewWrap = document.getElementById('newspaper-preview');
  // 신문 배경은 기사 가독성을 위해 850px로 고정 (비율은 이미지에만 적용되도록 함)
  previewWrap.style.maxWidth = '850px';
  previewWrap.style.width = '100%';

  if (state.generatedImage) {
    const frame = document.getElementById('np-image-frame');
    const contentArea = document.getElementById('np-content-area');
    frame.style.display = 'block';

    // 이미지 비율에 따라 본문 내 배치 결정 (Float 기반)
    if (state.aspectRatio === '16:9') {
      // 가로 와이드: 2단을 가로지르는 전체 상단 배너 스타일
      frame.style.width = '100%';
      frame.style.float = 'none';
      frame.style.columnSpan = 'all';
      frame.style.margin = '0 0 20px 0';
    } else if (state.aspectRatio === '9:16') {
      // 세로 고정: 오른쪽 배치 후 텍스트 감싸기 (35% 너비)
      frame.style.width = '38%';
      frame.style.float = 'right';
      frame.style.columnSpan = 'none';
      frame.style.marginLeft = '18px';
    } else if (state.aspectRatio === '1:1') {
      // 정사각: 오른쪽 배치 후 텍스트 감싸기 (45% 너비)
      frame.style.width = '45%';
      frame.style.float = 'right';
      frame.style.columnSpan = 'none';
      frame.style.marginLeft = '20px';
    } else {
      // 4:3 표준: 오른쪽 배치 후 텍스트 감싸기 (50% 너비)
      frame.style.width = '50%';
      frame.style.float = 'right';
      frame.style.columnSpan = 'none';
      frame.style.marginLeft = '20px';
    }

    document.getElementById('np-image').src = state.generatedImage;
    // 워터마크(캡션) 제거 요청으로 인해 텍스트를 비움
    document.getElementById('np-caption').textContent = '';
    document.getElementById('np-caption').style.display = 'none';

    // 이미지 클릭 시 다운로드 가능하도록 스타일 및 이벤트 추가
    const npImg = document.getElementById('np-image');
    npImg.style.cursor = 'pointer';
    npImg.title = '클릭하여 이미지 다운로드';
    npImg.onclick = saveImage;
  } else {
    document.getElementById('np-image-frame').style.display = 'none';
  }

  const bodyText = article.replace(/^#.+$/gm, '').replace(/^##.+$/gm, '').replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '').trim();
  const paragraphs = bodyText.split(/\n\n+/).filter(p => p.trim().length > 10);
  const bodyEl = document.getElementById('np-body');
  const frame = document.getElementById('np-image-frame');

  // 본문 업데이트 (기사 텍스트를 먼저 채우고, 이미지 프레임을 첫머리에 삽입하여 감싸기 효과 극대화)
  if (paragraphs.length > 0) {
    bodyEl.innerHTML = paragraphs.map(p => `<p>${p.trim()}</p>`).join('');
  } else {
    bodyEl.innerHTML = '<p>기사 내용이 없습니다.</p>';
  }

  // 생성된 이미지가 있다면 본문 최상단에 Prepend (플로팅 효과)
  if (state.generatedImage && frame) {
    bodyEl.prepend(frame);
  }

  // 출처 업데이트
  const sourceText = document.getElementById('article-source-input').value.trim();
  const sourceArea = document.getElementById('np-source-area');
  const sourceDisplay = document.getElementById('np-source-text');
  if (sourceText) {
    if (sourceArea) sourceArea.style.display = 'block';
    if (sourceDisplay) sourceDisplay.textContent = sourceText;
    state.articleSources = sourceText;
  } else {
    if (sourceArea) sourceArea.style.display = 'none';
    state.articleSources = '';
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
      item.style.cssText = 'background:var(--bg4); border-radius:var(--radius-sm); padding:11px 14px; border-left:3px solid var(--teal); display:flex; align-items:flex-start; gap:12px;';
      const hasUrl = a.url && a.url !== '#';
      const urlHtml = hasUrl ? '<a href="' + a.url + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;font-family:var(--font-mono);font-size:10px;color:var(--teal);text-decoration:none;margin-top:5px;padding:3px 8px;background:var(--teal-dim);border:1px solid var(--border-teal);border-radius:6px;" onclick="event.stopPropagation()">🔗 원본</a>' : '';
      item.innerHTML =
        '<span style="font-family:var(--font-mono);font-size:9px;background:var(--bg3);padding:2px 7px;border-radius:6px;color:var(--teal);white-space:nowrap;margin-top:2px;">#' + (i + 1) + '</span>' +
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

// ============================================================
// ARCHIVE (보관함) LOGIC
// ============================================================

function updatePreviewSources() {
  const sourceText = document.getElementById('article-source-input').value.trim();
  const sourceArea = document.getElementById('np-source-area');
  const sourceDisplay = document.getElementById('np-source-text');

  state.articleSources = sourceText;

  if (sourceText) {
    if (sourceArea) sourceArea.style.display = 'block';
    if (sourceDisplay) sourceDisplay.textContent = sourceText;
  } else {
    if (sourceArea) sourceArea.style.display = 'none';
  }
}

function saveToArchive() {
  const article = state.generatedArticle || document.getElementById('article-textarea').value || '';
  const sources = document.getElementById('article-source-input').value.trim();
  if (!article.trim()) {
    showToast('warn', '⚠️ 보관할 기사가 없습니다.');
    return;
  }

  const titleMatch = article.match(/^#\s+(.+)/m);
  const title = titleMatch ? titleMatch[1] : (state.topic || '제목 없음');

  const archiveItem = {
    id: Date.now(),
    title: title,
    content: article,
    image: state.generatedImage,
    date: getTodayStr(),
    category: state.category,
    region: state.region,
    sources: sources,
    selectedArticlesData: [...state.selectedArticlesData]
  };

  state.archive.unshift(archiveItem);
  localStorage.setItem('news_archive', JSON.stringify(state.archive));

  showToast('success', '📦 보관함에 저장되었습니다.');
  markStepComplete(4);
}

function renderArchive(filter = '') {
  const grid = document.getElementById('archive-list-grid');
  const empty = document.getElementById('archive-empty-state');
  if (!grid) return;

  const filtered = state.archive.filter(item =>
    item.title.toLowerCase().includes(filter.toLowerCase())
  );

  grid.innerHTML = '';

  if (filtered.length === 0) {
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = 'article-card';
    card.style.cursor = 'pointer';

    card.innerHTML = `
      <div style="flex:1; min-width:0;">
        <div class="card-source">
          ${item.region} · ${item.category || '기타'}
          <span class="card-badge">${item.date}</span>
        </div>
        <div class="card-title">${item.title}</div>
        <div class="card-desc" style="font-size:11px; color:var(--text3); opacity:0.8;">
          ${item.content.replace(/[#*`]/g, '').slice(0, 150)}...
        </div>
      </div>
      <div style="display:flex; flex-direction:column; gap:8px; justify-content:center;">
        <button class="toolbar-btn" style="background:var(--teal); color:white; border:none;" onclick="loadArchivedArticle(${item.id}, event)">불러오기</button>
        <button class="toolbar-btn" style="border-color:var(--red); color:var(--red);" onclick="deleteFromArchive(${item.id}, event)">삭제</button>
      </div>
    `;

    card.onclick = () => loadArchivedArticle(item.id);
    grid.appendChild(card);
  });
}

function searchArchive() {
  const query = document.getElementById('archive-search-input').value;
  renderArchive(query);
}

function loadArchivedArticle(id, event) {
  if (event) event.stopPropagation();
  const item = state.archive.find(a => a.id === id);
  if (!item) return;

  state.generatedArticle = item.content;
  state.generatedImage = item.image;
  state.category = item.category || '';
  state.region = item.region || 'KR';
  state.articleSources = item.sources || '';
  state.selectedArticlesData = item.selectedArticlesData || [];

  document.getElementById('article-textarea').value = item.content;
  document.getElementById('article-source-input').value = item.sources || '';

  goPage(4);
  showToast('success', '📂 보관된 기사를 불러왔습니다.');
}

function deleteFromArchive(id, event) {
  if (event) event.stopPropagation();
  if (!confirm('정말 이 기사를 보관함에서 삭제하시겠습니까?')) return;

  state.archive = state.archive.filter(a => a.id !== id);
  localStorage.setItem('news_archive', JSON.stringify(state.archive));
  renderArchive(document.getElementById('archive-search-input').value);
  showToast('info', '🗑️ 보관함에서 삭제되었습니다.');
}

// 기사 HTML 저장 (신문지 레이아웃 포함)
function exportArticle() {
  const article = state.generatedArticle || document.getElementById('article-textarea').value;
  if (!article) { showToast('info', '먼저 기사를 작성하세요.'); return; }

  const titleMatch = article.match(/^#\s+(.+)/m);
  const title = titleMatch ? titleMatch[1] : (state.topic || state.category);
  const bodyText = article.replace(/^#.+$/gm, '').replace(/^##.+$/gm, '').replace(/\*\*/g, '').replace(/`/g, '').trim();
  const paragraphs = bodyText.split(/\n\n+/).filter(p => p.trim().length > 10);

  // 기사 비율은 이미지에만 적용하고, 신문 배경 너비는 유동적이되 850px를 표준으로 함
  let maxWidth = '850px';
  let imgWidth = '45%';
  let imgFloat = 'right';
  let imgMargin = '20px';
  let imgBottom = '10px';

  if (state.aspectRatio === '16:9') {
    imgWidth = '100%';
    imgFloat = 'none';
    imgMargin = '0';
    imgBottom = '20px';
  } else if (state.aspectRatio === '9:16') {
    imgWidth = '42%';
    imgFloat = 'right';
    imgMargin = '20px';
  } else if (state.aspectRatio === '4:3') {
    imgWidth = '50%';
    imgFloat = 'right';
    imgMargin = '20px';
  }

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${title} — AI NEWS ROOM</title>
<style>
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css');
body { margin:0; padding:40px; background:#f4e8c1; background-image:radial-gradient(ellipse at 20% 50%,rgba(139,119,80,0.15) 0%,transparent 50%),radial-gradient(ellipse at 80% 20%,rgba(139,119,80,0.1) 0%,transparent 50%); min-height:100vh; font-family: 'Pretendard', sans-serif; }
.newspaper { max-width:${maxWidth}; margin:0 auto; padding:40px 48px; position:relative; color:#2a2218; box-shadow: inset 0 0 80px rgba(139, 119, 80, 0.2), 0 4px 30px rgba(0, 0, 0, 0.5); border-radius: 4px; }
.newspaper::after { content:''; position:absolute; inset:8px; border:1px solid rgba(139, 119, 80, 0.25); pointer-events:none; }
.np-header { text-align:center; border-bottom:3px double #2a2218; padding-bottom:12px; margin-bottom:16px; }
.np-masthead { font-family:'Pretendard', sans-serif; font-weight: 900; font-size:52px; letter-spacing:0.12em; color:#1a1510; text-transform:uppercase; }
.np-dateline { font-family:'Pretendard', sans-serif; font-weight: 500; font-size:10px; letter-spacing:0.3em; color:#6b5d4f; margin-top:6px; display:flex; justify-content:space-between; text-transform:uppercase; }
.np-rule { height:3px; background:#2a2218; margin:0 0 16px; }
h1 { font-family:'Pretendard', sans-serif; font-size:28px; font-weight:900; color:#1a1510; line-height:1.25; text-align:center; margin-bottom:14px; }
.byline { font-family:'Pretendard', sans-serif; font-weight: 600; font-size:9px; letter-spacing:0.15em; color:#8b7750; text-align:center; text-transform:uppercase; margin-bottom:14px; }
.np-img { border:1px solid #b8a88a; padding:4px; margin-bottom:${imgBottom}; background:#ede2c8; width:${imgWidth}; float:${imgFloat}; margin-left:${imgMargin}; }
.np-img img { width:100%; display:block; filter:sepia(0.2) contrast(1.05); }
.np-caption { font-family:'Pretendard', sans-serif; font-weight: 500; font-size:9px; color:#8b7750; text-align:center; margin-top:4px; font-style:italic; }
.body-text { column-count:2; column-gap:28px; column-rule:1px solid #c4b496; font-family:'Pretendard', sans-serif; font-size:13px; line-height:1.85; color:#2a2218; text-align:justify; }
.body-text p { margin-bottom:12px; text-indent:1.2em; }
.body-text p:first-child { text-indent:0; }
.body-text p:first-child::first-letter { font-size:42px; float:left; line-height:1; margin:2px 8px 0 0; font-weight:900; }
.footer { border-top:2px solid #2a2218; margin-top:20px; padding-top:10px; font-family:'Pretendard', sans-serif; font-weight: 500; font-size:8px; color:#8b7750; letter-spacing:0.2em; text-align:center; text-transform:uppercase; }
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

// 미리보기 화면을 이미지(PNG)로 저장하는 기능 추가
async function savePreviewAsImage() {
  const element = document.getElementById('newspaper-preview');
  if (!element) return;

  showToast('info', '📸 신문 이미지 생성 중...');

  try {
    // html2canvas 옵션 설정: 고화질을 위해 scale 높임, 폰트 렌더링을 위해 배경색 명시
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#f4e8c1',
      logging: false
    });

    const imgData = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = imgData;
    a.download = `atlas_news_${Date.now()}.png`;
    a.click();
    showToast('success', '📸 신문 이미지 저장 완료!');
    return true;
  } catch (err) {
    console.error('Image capture error:', err);
    showToast('error', '❌ 이미지 저장 실패');
    return false;
  }
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

// 전체 결과물 일괄 저장 (이미지 파일 포함)
async function saveAllBundle() {
  let saved = 0;
  const article = state.generatedArticle || document.getElementById('article-textarea').value;

  // 1. 신문 미리보기를 이미지로 저장
  if (article) {
    await savePreviewAsImage();
    saved++;
  }

  // 2. AI 생성 원본 이미지 저장
  if (state.generatedImage) {
    setTimeout(() => { saveImage(); saved++; }, 500);
  }

  // 3. TTS 오디오 저장
  if (state.audioBuffer) {
    setTimeout(() => { saveTTSAudio(); saved++; }, 1000);
  }

  // 4. 기사 텍스트(.txt) 저장
  if (article) {
    setTimeout(() => { downloadArticle(); saved++; }, 1500);
  }

  if (saved === 0) {
    showToast('info', '저장할 컨텐츠가 없습니다. 먼저 기사를 작성하세요.');
  } else {
    setTimeout(() => showToast('success', `📦 ${saved}개 항목 일괄 저장 완료!`), 2000);
  }
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
  document.getElementById('save-img-btn').disabled = true;
  const saveImgBtn2 = document.getElementById('save-img-btn2');
  if (saveImgBtn2) saveImgBtn2.disabled = true;
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

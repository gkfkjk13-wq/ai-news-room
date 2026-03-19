// STATE
const state = {
  topic: '',
  apiKey: localStorage.getItem('gemini_api_key') || '',
  region: 'KR',
  maxArticles: 5,

  // 뉴스 수집용 바구니
  latestNews: [],      // 리서치에서 찾은 최신 뉴스
  chronicleArticles: [],   // 크로니클에서 찾은 6개월 전 뉴스
  googleApiKey: localStorage.getItem('google_api_key') || '',
  googleCx: localStorage.getItem('google_cx') || '',

  // 기존 호환용
  articles: [],
  selectedArticles: new Set(),
  selectedArticlesData: [],

  articleStyle: '객관적 보도',
  lang: 'ko',
  imgStyle: 'Photorealistic',
  aspectRatio: '16:9',
  generatedArticle: '',
  analysisResult: null,
  generatedImage: null,
  audioBuffer: null,
  audioSource: null,
  isPlaying: false,
  currentPage: 0,
  completedSteps: new Set(),
  ttsVoice: 'female',
  chronicleArticles: [],
  selectedChronicleArticles: new Set(),
  artPrompt: '', // 이미지 생성을 위한 설계된 프롬프트 저장
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

/**
 * 1. 기사 데이터를 날짜순으로 정렬하는 핵심 함수
 * @param {Array} articles - 검색된 기사 배열
 * @returns {Array} - 과거부터 현재순으로 정렬된 배열
 */
const sortNewsByDate = (articles) => {
  if (!articles) return [];
  return [...articles].sort((a, b) => {
    // 날짜 데이터가 없을 경우를 대비해 예외 처리
    const dateA = new Date(a.publishedDate || a.date || 0);
    const dateB = new Date(b.publishedDate || b.date || 0);

    // 과거 기사가 위로(작은 값), 최신 기사가 아래로(큰 값) 가도록 정렬
    return dateA - dateB;
  });
};

const WHITELIST = {
  KR: ['yna.co.kr', 'news1.kr', 'newsis.com', 'kbs.co.kr', 'ytn.co.kr', 'mk.co.kr', 'hankyung.com', 'sbs.co.kr', 'imbc.com', 'joongang.co.kr', 'chosun.com', 'donga.com', 'hani.co.kr', 'seoul.co.kr', 'nocutnews.co.kr', 'naver.com', 'daum.net'],
  US: ['nytimes.com', 'washingtonpost.com', 'reuters.com', 'apnews.com', 'wsj.com', 'bloomberg.com', 'cnbc.com', 'cnn.com', 'bbc.com', 'theguardian.com'],
  GB: ['bbc.co.uk', 'theguardian.com', 'telegraph.co.uk', 'thetimes.co.uk', 'ft.com', 'independent.co.uk', 'sky.com', 'mirror.co.uk'],
};

// 핵심 블랙리스트 (검색 엔진 쿼리에 직접 포함 - 확실한 비뉴스 사이트만)
const CORE_BLACKLIST = [
  'namu.wiki', 'youtube.com', 'x.com', 'twitter.com', 'facebook.com', 'instagram.com', 'tiktok.com',
  'dcinside.com', 'fmkorea.com', 'clien.net', 'ruliweb.com', 'slrclub.com', 'theqoo.net', 'instiz.net',
  'wikipedia.org', 'fandom.com', 'wikitree.co.kr'
];

// 확장 블랙리스트 (수집된 결과에서 자바스크립트로 정밀 필터링 - 범위를 넓게 잡아도 검색 결과에 영향을 주지 않음)
const EXTENDED_BLACKLIST = [
  'alphasquare.co.kr', 'stock.naver.com', 'finance.naver.com', 'finance.daum.net', 'investing.com',
  'tradingview.com', 'paxnet.co.kr', 'fnguide.com', 'infomax.co.kr', 'vneconomy.vn', 'vneconomy.com.vn',
  'github.com', 'linkedin.com', 'coupang.com', 'danawa.com', 'auction.co.kr', 'gmarket.co.kr',
  'samsung.com', 'lg.com', 'hyundai.com', 'sk.com', 'mancity.com', 'liverpoolfc.com', 'tottenhamhotspur.com',
  'chelseafc.com', 'realmadrid.com', 'fcbarcelona.com', 'goal.com',
  'ticketmaster.com', 'viagogo.com', 'safetickets.net', 'about-us', 'company', 'official', 'newsroom'
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



// NAVIGATION
function goPage(n) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));

  const targetPage = document.getElementById('page-' + n);
  const targetNav = document.getElementById('nav-' + n);

  if (targetPage) targetPage.classList.add('active');
  if (targetNav) targetNav.classList.add('active');

  state.currentPage = n;

  // 페이지별 데이터 로드 로직
  if (n === 1) populateChroniclePage();
  if (n === 2) renderIntegratedList(); // 💡 정리 페이지로 가면 최신+과거 데이터를 합쳐서 그림
  if (n === 5) updatePreview();
  if (n === 6) renderArchive();
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

function setTTSVoice(type) {
  state.ttsVoice = type;
  const femaleBtn = document.getElementById('voice-female-btn');
  const maleBtn = document.getElementById('voice-male-btn');

  if (femaleBtn && maleBtn) {
    if (type === 'female') {
      femaleBtn.style.background = 'var(--teal)';
      femaleBtn.style.color = 'white';
      femaleBtn.style.borderColor = 'var(--teal)';
      maleBtn.style.background = 'var(--bg3)';
      maleBtn.style.color = 'var(--text)';
      maleBtn.style.borderColor = 'var(--border)';
    } else {
      maleBtn.style.background = 'var(--teal)';
      maleBtn.style.color = 'white';
      maleBtn.style.borderColor = 'var(--teal)';
      femaleBtn.style.background = 'var(--bg3)';
      femaleBtn.style.color = 'var(--text)';
      femaleBtn.style.borderColor = 'var(--border)';
    }
  }
}

// API KEY
function openModal() {
  document.getElementById('api-key-input').value = localStorage.getItem('gemini_api_key') || '';
  document.getElementById('jina-api-key-input').value = localStorage.getItem('jina_api_key') || '';
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal() { document.getElementById('modal-overlay').classList.remove('open'); }

async function testJinaSearch() {
  const jinaKey = document.getElementById('jina-api-key-input').value.trim();

  if (!jinaKey) {
    showToast('error', '⚠️ 테스트를 위해 Jina API Key를 입력해주세요.');
    return;
  }

  showToast('info', '📡 Jina AI 서버와 통신 중...');
  try {
    const url = `https://s.jina.ai/test`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jinaKey}`,
        'Accept': 'application/json'
      }
    });

    if (response.ok) {
      alert('✅ 연결 성공! Jina AI 엔진이 활성화되었습니다.');
    } else {
      const data = await response.json().catch(() => ({}));
      const msg = data.message || '인증 실패';
      alert(`❌ 연결 실패\n\n[오류 메시지]\n${msg}\n\n💡 해결 제안:\nJina AI 홈페이지에서 키가 유효한지 확인하세요.`);
    }
  } catch (err) {
    alert(`❌ 통신 실패: ${err.message}`);
  }
}

function saveApiKey() {
  const geminiKey = document.getElementById('api-key-input').value.trim();
  const jinaKey = document.getElementById('jina-api-key-input').value.trim();

  if (!geminiKey) {
    showToast('error', '❌ Gemini API 키를 입력해주세요.');
    return;
  }

  state.apiKey = geminiKey;
  localStorage.setItem('gemini_api_key', geminiKey);

  if (jinaKey) localStorage.setItem('jina_api_key', jinaKey);

  updateApiStatus('connected');
  closeModal();
  showToast('success', '✅ API 설정이 저장되었습니다.');
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
  else { dot.style.background = 'var(--text3)'; dot.style.boxShadow = 'none'; txt.textContent = 'API 대기 중'; }
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
  if (!box) return; // UI 삭제 대응
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
  const bar = document.getElementById('progress-bar');
  const pctText = document.getElementById('progress-pct');
  const txt = document.getElementById('progress-text');
  
  if (bar) bar.style.width = pct + '%';
  if (pctText) pctText.textContent = pct + '%';
  if (txt) txt.textContent = label;
  
  const sb = document.getElementById('sb-status');
  if (sb) sb.textContent = label;
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
    siteFilter: 'site:chosun.com OR site:joongang.co.kr OR site:joins.com OR site:donga.com OR site:hani.co.kr OR site:khan.co.kr OR site:mk.co.kr OR site:hankyung.com OR site:yna.co.kr OR site:news1.kr OR site:newsis.com OR site:ytn.co.kr OR site:mbn.co.kr OR site:ichannela.com OR site:tvchosun.com OR site:jtbc.co.kr OR site:seoul.co.kr OR site:segye.com OR site:kmib.co.kr OR site:mt.co.kr OR site:edaily.co.kr OR site:asiae.co.kr OR site:heraldcorp.com OR site:etnews.com OR site:sbs.co.kr OR site:kbs.co.kr OR site:mbc.co.kr OR site:nocutnews.co.kr',
    instruction: '반드시 대한민국 전문 언론사(공중파, 종합일간지, 경제지, 뉴스통신사) 및 포털 뉴스 섹션의 기사만 수집하세요.',
    outlets: 'KBS, MBC, SBS, JTBC, YTN, 연합뉴스, 뉴스1, 조선, 중앙, 동아, 경향, 네이버 뉴스 등',
  }
};

async function startResearch() {
  state.topic = document.getElementById('topic-input').value.trim();
  if (!state.topic) {
    showToast('warn', '⚠️ 검색어를 입력해주세요.');
    return;
  }

  // 이전 검색 데이터 및 UI 완벽 초기화
  state.articles = [];
  state.selectedArticles.clear();
  state.selectedArticlesData = [];
  state.chronicleArticles = [];
  state.selectedChronicleArticles.clear();
  state.latestNews = [];

  const countBadge1 = document.getElementById('selected-count-badge');
  const countBadge2 = document.getElementById('chronicle-selected-count-badge');
  if (countBadge1) countBadge1.textContent = '0건 선택됨';
  if (countBadge2) countBadge2.textContent = '0건 선택됨';

  const progPanel = document.getElementById('research-progress-panel');
  if (progPanel) progPanel.style.display = 'block';
  document.getElementById('collected-results-panel').style.display = 'none';
  const logBox = document.getElementById('log-box');
  if (logBox) logBox.innerHTML = '';

  updateApiStatus('working');
  addLog('info', `📡 [최신 뉴스] 리서치 엔진 가동: ${state.topic}`);
  setProgress(20, '구글 CSE 연결 및 데이터 스크래핑 중...');

  try {
    // 💡 NewsService를 통해 최신 뉴스 5개를 가져옴 (3일 이내로 제한됨)
    const siteFilter = REGION_CONFIG[state.region].siteFilter;
    state.latestNews = await NewsService.fetchLatest(state.topic, siteFilter);
    setProgress(50, '3일 이내 최신 뉴스 수집 및 검증 완료...');

    if (state.latestNews.length > 0) {
      renderCollectedArticles(state.latestNews);
      setProgress(100, '수집 완료. 사용할 기사를 선택해 주세요.');

      // 헤더의 액션 버튼들도 보이게 처리
      const btnLatest = document.getElementById('btn-latest-brief');
      const btnHistory = document.getElementById('btn-history-summary');
      const btnSave = document.getElementById('btn-save-search');
      if (btnLatest) { btnLatest.style.display = 'flex'; btnLatest.disabled = true; }
      if (btnHistory) { btnHistory.style.display = 'flex'; btnHistory.disabled = true; }
      if (btnSave) { btnSave.style.display = 'flex'; }
    } else {
      addLog('warn', '최신 뉴스 검색 결과가 없습니다.');
      setProgress(100, '수집 완료(결과 없음)');
    }

    showToast('success', `✅ 최신 뉴스 수집 완료!`);

  } catch (err) {
    setProgress(100, '오류 발생');
    addLog('err', `❌ 리서치 실패: ${err.message}`);

    if (err.message.includes('access') || err.message.includes('403')) {
      addLog('info', '--- [해결 가이드] ---');
      addLog('info', '1. 구글 클라우드 콘솔에서 <b>Custom Search API</b> 활성화 여부를 재확인하세요.');
      addLog('info', '2. 복사한 API Key가 <b>해당 프로젝트</b>에서 생성된 것이 맞는지 확인하세요.');
      addLog('info', '3. 간혹 구글 서버 반영에 5~10분이 소요될 수 있습니다.');
    }
  } finally {
    updateApiStatus('connected');
  }
}

// ============================================================
// 🗂️ 키워드 검색 보관함 (Keyword Vault)
// ============================================================

/**
 * 현재 검색 결과(키워드 + 기사 목록)를 LocalStorage에 저장
 * 같은 키워드로 검색 시 날짜별로 축적됨
 */
function saveCurrentSearch() {
  if (!state.topic || state.latestNews.length === 0) {
    showToast('warn', '저장할 검색 결과가 없습니다.');
    return;
  }

  const vaultKey = 'atlas_keyword_vault';
  const existing = JSON.parse(localStorage.getItem(vaultKey) || '{}');

  const keyword = state.topic.trim();
  const now = new Date();
  const dateKey = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;
  const timeStr = now.toTimeString().slice(0,5);
  const sessionId = `${dateKey}_${timeStr.replace(':','')}`;

  if (!existing[keyword]) existing[keyword] = {};

  // 같은 날짜에 기존 세션이 있으면 덮어쓰고, 없으면 새 세션 생성
  existing[keyword][sessionId] = {
    date: dateKey,
    time: timeStr,
    articles: state.latestNews.map(a => ({
      title: a.title || '',
      source: a.source || '',
      date: a.date || '',
      summary: a.summary || '',
      url: a.url || '',
      author: a.author || '',
    }))
  };

  localStorage.setItem(vaultKey, JSON.stringify(existing));
  showToast('success', `✅ "${keyword}" 검색 결과가 보관함에 저장되었습니다!`);
  renderKeywordVault();
}

/**
 * LocalStorage에서 보관함 데이터를 읽어 UI에 렌더링
 */
function renderKeywordVault() {
  const list = document.getElementById('keyword-vault-list');
  if (!list) return;

  const vaultKey = 'atlas_keyword_vault';
  const allData = JSON.parse(localStorage.getItem(vaultKey) || '{}');
  const filterText = (document.getElementById('vault-search-input')?.value || '').trim().toLowerCase();

  const keywords = Object.keys(allData).filter(k =>
    !filterText || k.toLowerCase().includes(filterText)
  );

  if (keywords.length === 0) {
    list.innerHTML = '<p style="text-align:center; color:var(--text3); font-size:12px; padding:20px;">저장된 검색 기록이 없습니다. 검색 후 💾 검색 보관 버튼을 눌러 저장하세요.</p>';
    return;
  }

  list.innerHTML = '';

  // 키워드를 알파벳/가나다 순 정렬
  keywords.sort().forEach(keyword => {
    const sessions = allData[keyword];
    const sessionKeys = Object.keys(sessions).sort().reverse(); // 최신 날짜가 위로
    const totalArticles = sessionKeys.reduce((acc, k) => acc + (sessions[k].articles?.length || 0), 0);

    const kwBlock = document.createElement('div');
    kwBlock.style.cssText = 'background:var(--bg3); border:1px solid var(--border); border-radius:var(--radius-lg); overflow:hidden;';

    // 키워드 헤더 (클릭으로 펼치기)
    const kwHeader = document.createElement('div');
    kwHeader.style.cssText = 'padding:14px 20px; display:flex; align-items:center; gap:12px; cursor:pointer; user-select:none; transition:background 0.2s;';
    kwHeader.innerHTML = `
      <span style="font-size:18px;">🔑</span>
      <div style="flex:1;">
        <div style="font-size:15px; font-weight:800; color:var(--text);">${keyword}</div>
        <div style="font-size:11px; color:var(--text3); margin-top:2px;">${sessionKeys.length}회 검색 · 기사 ${totalArticles}건 보관</div>
      </div>
      <div style="display:flex; gap:6px; align-items:center;">
        <button onclick="event.stopPropagation(); deleteKeywordFromVault('${keyword.replace(/'/g, "\\'")}')"
          style="padding:4px 10px; border-radius:6px; border:1px solid var(--red); background:transparent; color:var(--red); font-size:10px; cursor:pointer;">🗑️ 삭제</button>
        <span class="vault-arrow" style="font-size:12px; color:var(--text3); transition:transform 0.2s;">▼</span>
      </div>
    `;

    const kwBody = document.createElement('div');
    kwBody.style.cssText = 'display:none; border-top:1px solid var(--border); padding:12px 16px; display:flex; flex-direction:column; gap:10px;';
    kwBody.style.display = 'none';

    // 날짜별 세션 렌더링
    sessionKeys.forEach(sessionId => {
      const session = sessions[sessionId];
      const sessionEl = document.createElement('div');
      sessionEl.style.cssText = 'background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); overflow:hidden;';

      const sessionHeader = document.createElement('div');
      sessionHeader.style.cssText = 'padding:10px 14px; display:flex; align-items:center; gap:10px; cursor:pointer; background:var(--bg4);';
      sessionHeader.innerHTML = `
        <span style="font-family:var(--font-mono); font-size:11px; font-weight:700; color:var(--teal);">📅 ${session.date}</span>
        <span style="font-family:var(--font-mono); font-size:10px; color:var(--text3);">${session.time}</span>
        <span class="token-badge" style="margin-left:auto;">${session.articles?.length || 0}건</span>
        <button onclick="event.stopPropagation(); loadVaultSession('${keyword.replace(/'/g, "\\'")}', '${sessionId}')"
          style="padding:4px 12px; border-radius:6px; border:1px solid var(--teal); background:var(--teal-dim); color:var(--teal); font-size:10px; cursor:pointer; font-weight:700;">
          ↩️ 불러오기
        </button>
        <button onclick="event.stopPropagation(); deleteVaultSession('${keyword.replace(/'/g, "\\'")}', '${sessionId}')"
          style="padding:4px 8px; border-radius:6px; border:1px solid var(--border); background:transparent; color:var(--text3); font-size:10px; cursor:pointer;">🗑</button>
        <span class="session-arrow" style="font-size:10px; color:var(--text3);">▼</span>
      `;

      const articleList = document.createElement('div');
      articleList.style.cssText = 'display:none; padding:8px 14px 12px; display:flex; flex-direction:column; gap:6px;';
      articleList.style.display = 'none';

      // [UPDATE] 최종 생성 기사가 있을 경우 상단에 표시
      if (session.finalArticle) {
        const finalEl = document.createElement('div');
        finalEl.style.cssText = 'padding:10px; background:var(--bg2); border:1px solid var(--teal); border-radius:8px; margin-bottom:8px; position:relative; overflow:hidden;';
        finalEl.innerHTML = `
          <div style="font-size:9px; font-weight:700; color:var(--teal); margin-bottom:4px; display:flex; align-items:center; gap:4px;">
            <span style="font-size:12px;">📄</span> 최종 작성 기사
          </div>
          <div style="font-size:13px; font-weight:800; color:var(--text); line-height:1.4; margin-bottom:6px;">${session.finalArticle.title}</div>
          <button onclick="event.stopPropagation(); loadVaultArticle('${keyword.replace(/'/g, "\\'")}', '${sessionId}')"
            style="width:100%; padding:6px; border-radius:6px; border:none; background:var(--teal); color:white; font-size:11px; font-weight:700; cursor:pointer; transition:opacity 0.2s;" 
            onmouseover="this.style.opacity=0.9" onmouseout="this.style.opacity=1">
            기사 미리보기 다시보기
          </button>
        `;
        articleList.appendChild(finalEl);
      }

      // 리서치 기사 목록 표시
      if (session.articles && session.articles.length > 0) {
        const researchHeader = document.createElement('div');
        researchHeader.style.cssText = 'font-size:10px; color:var(--text3); font-weight:700; margin:4px 0 2px;';
        researchHeader.textContent = '📚 리서치 데이터';
        articleList.appendChild(researchHeader);

        session.articles.forEach(art => {
          const artEl = document.createElement('div');
          artEl.style.cssText = 'padding:8px 10px; background:var(--bg3); border-radius:8px; border-left:2px solid var(--teal);';
          artEl.innerHTML = `
            <div style="display:flex; gap:8px; align-items:center; margin-bottom:3px;">
              <span style="font-family:var(--font-mono); font-size:9px; color:var(--teal); font-weight:700;">${art.source}</span>
              <span style="font-size:9px; color:var(--text3);">${art.date}</span>
            </div>
            <div style="font-size:12px; font-weight:700; color:var(--text); line-height:1.4;">${art.title}</div>
            ${art.url ? `<a href="${art.url}" target="_blank" style="font-size:10px; color:var(--teal); text-decoration:none; margin-top:4px; display:inline-block;">🔗 원본 보기</a>` : ''}
          `;
          articleList.appendChild(artEl);
        });
      }

      sessionHeader.addEventListener('click', () => {
        const isOpen = articleList.style.display !== 'none';
        articleList.style.display = isOpen ? 'none' : 'flex';
        sessionHeader.querySelector('.session-arrow').textContent = isOpen ? '▼' : '▲';
      });

      sessionEl.appendChild(sessionHeader);
      sessionEl.appendChild(articleList);
      kwBody.appendChild(sessionEl);
    });

    kwHeader.addEventListener('click', () => {
      const isOpen = kwBody.style.display !== 'none';
      kwBody.style.display = isOpen ? 'none' : 'flex';
      kwHeader.querySelector('.vault-arrow').style.transform = isOpen ? '' : 'rotate(180deg)';
    });

    kwBlock.appendChild(kwHeader);
    kwBlock.appendChild(kwBody);
    list.appendChild(kwBlock);
  });
}

/**
 * 보관함의 특정 세션을 현재 검색 상태로 불러옴
 */
function loadVaultSession(keyword, sessionId) {
  const vaultKey = 'atlas_keyword_vault';
  const allData = JSON.parse(localStorage.getItem(vaultKey) || '{}');
  const session = allData[keyword]?.[sessionId];
  if (!session) { showToast('error', '세션을 찾을 수 없습니다.'); return; }

  // 키워드 복원
  state.topic = keyword;
  const topicInput = document.getElementById('topic-input');
  if (topicInput) topicInput.value = keyword;

  // 기사 복원 (latestNews 형식으로 맞춤)
  state.latestNews = (session.articles || []).map((a, i) => ({
    id: `vault_${i}`,
    title: a.title,
    source: a.source,
    date: a.date,
    summary: a.summary,
    url: a.url,
    author: a.author,
    relevance: 8,
    fullContent: '',
  }));

  renderCollectedArticles(state.latestNews);
  document.getElementById('collected-results-panel').style.display = 'block';

  // 버튼 표시
  const btnLatest = document.getElementById('btn-latest-brief');
  const btnHistory = document.getElementById('btn-history-summary');
  const btnSave = document.getElementById('btn-save-search');
  if (btnLatest) { btnLatest.style.display = 'flex'; btnLatest.disabled = true; }
  if (btnHistory) { btnHistory.style.display = 'flex'; btnHistory.disabled = true; }
  if (btnSave) { btnSave.style.display = 'flex'; }

  closeVaultPopup();
  showToast('success', `✅ "${keyword}" [${session.date} ${session.time}] 기사를 불러왔습니다!`);
}

/**
 * 보관함 세션에 저장된 '최종 기사'를 미리보기로 직접 불러옴
 */
function loadVaultArticle(keyword, sessionId) {
  const vaultKey = 'atlas_keyword_vault';
  const allData = JSON.parse(localStorage.getItem(vaultKey) || '{}');
  const session = allData[keyword]?.[sessionId];
  if (!session || !session.finalArticle) { 
    showToast('error', '저장된 기사가 없습니다.'); 
    return; 
  }

  // 상태 복원
  state.topic = keyword;
  state.generatedArticle = session.finalArticle.content;
  state.generatedImage = session.finalArticle.image;
  // 소스 데이터가 있다면 복원 (미리보기 소스 패널용)
  state.selectedArticlesData = session.articles.map(a => ({
    title: a.title,
    source: a.source,
    date: a.date,
    url: a.url
  }));

  goPage(5);
  updatePreview();
  closeVaultPopup();
  showToast('success', `📄 "${session.finalArticle.title}" 기사를 불러왔습니다.`);
}


/**
 * 보관함에서 특정 키워드 전체 삭제
 */
function deleteKeywordFromVault(keyword) {
  if (!confirm(`"${keyword}" 키워드의 모든 검색 기록을 삭제하시겠습니까?`)) return;
  const vaultKey = 'atlas_keyword_vault';
  const allData = JSON.parse(localStorage.getItem(vaultKey) || '{}');
  delete allData[keyword];
  localStorage.setItem(vaultKey, JSON.stringify(allData));
  showToast('success', `🗑️ "${keyword}" 보관함이 삭제되었습니다.`);
  renderKeywordVault();
}

/**
 * 보관함에서 특정 세션 삭제
 */
function deleteVaultSession(keyword, sessionId) {
  const vaultKey = 'atlas_keyword_vault';
  const allData = JSON.parse(localStorage.getItem(vaultKey) || '{}');
  if (allData[keyword]?.[sessionId]) {
    delete allData[keyword][sessionId];
    // 해당 키워드에 세션이 없으면 키워드도 삭제
    if (Object.keys(allData[keyword]).length === 0) delete allData[keyword];
    localStorage.setItem(vaultKey, JSON.stringify(allData));
    showToast('success', '세션이 삭제되었습니다.');
    renderKeywordVault();
  }
}

/**
 * 보관함 전체 삭제
 */
function clearKeywordVault() {
  if (!confirm('보관함 전체를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
  localStorage.removeItem('atlas_keyword_vault');
  showToast('success', '🗑️ 보관함이 초기화되었습니다.');
  renderKeywordVault();
}

/**
 * 팝업 열기 / 닫기
 */
function openVaultPopup() {
  const overlay = document.getElementById('vault-popup-overlay');
  if (!overlay) return;
  renderKeywordVault();
  overlay.style.display = 'block';
  document.addEventListener('keydown', _vaultEscClose);
}

function closeVaultPopup() {
  const overlay = document.getElementById('vault-popup-overlay');
  if (overlay) overlay.style.display = 'none';
  document.removeEventListener('keydown', _vaultEscClose);
}

function _vaultEscClose(e) {
  if (e.key === 'Escape') closeVaultPopup();
}

// 페이지 로드 시 보관함 초기 렌더링
document.addEventListener('DOMContentLoaded', () => {
  renderKeywordVault();
});





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
  const count = state.latestNews ? state.latestNews.length : 0;
  for (let i = 0; i < count; i++) {
    state.selectedArticles.add(i);
    const card = document.getElementById('card-' + i);
    const check = document.getElementById('check-' + i);
    if (card) card.classList.add('selected');
    if (check) { check.textContent = '☑'; check.style.color = 'var(--teal)'; }
  }
  updateSelectedCount();
}

function deselectAllArticles() {
  state.selectedArticles.clear();
  const count = state.latestNews ? state.latestNews.length : 0;
  for (let i = 0; i < count; i++) {
    const card = document.getElementById('card-' + i);
    const check = document.getElementById('check-' + i);
    if (card) card.classList.remove('selected');
    if (check) { check.textContent = '☐'; check.style.color = 'var(--text3)'; }
  }
  updateSelectedCount();
}

// 다음 단계(크로니클)로 기사 전송
// [개선] 최신 뉴스 브리핑 실행 (크로니클 건너뛰고 바로 데이터 정리로)
function runLatestBriefing() {
  if (state.selectedArticles.size === 0) {
    showToast('warn', '최소 1개의 기사를 선택해주세요.');
    return;
  }
  // 최신 뉴스 선택 데이터 저장
  state.selectedArticlesData = Array.from(state.selectedArticles).map(idx => state.latestNews[idx]).filter(Boolean);

  // 분석 모드 설정
  state.analysisMode = 'LATEST';

  markStepComplete(0);
  showToast('success', '⚡ 팩트 체크 비서가 최신 뉴스 브리핑을 준비합니다.');

  goPage(2); // Page 2(데이터 정리)로 바로 이동 (크로니클 패스)
}

// [개선] 뉴스 히스토리 요약을 위해 크로니클 단계로 이동
function goToChronicle() {
  if (state.selectedArticles.size === 0) {
    showToast('warn', '최소 1개의 기사를 선택해주세요.');
    return;
  }
  // 최신 뉴스 선택 데이터 저장
  state.selectedArticlesData = Array.from(state.selectedArticles).map(idx => state.latestNews[idx]).filter(Boolean);

  // 분석 모드 설정
  state.analysisMode = 'HISTORY';

  markStepComplete(0);
  showToast('success', '⏳ 사건 재구성 전문가가 뉴스 히스토리 구성을 시작합니다.');

  // 크로니클 UI 초기화
  const initUi = document.getElementById('chronicle-init-ui');
  if (initUi) initUi.style.display = 'block';
  const progPanel = document.getElementById('chronicle-progress-panel');
  if (progPanel) progPanel.style.display = 'none';
  const resPanel = document.getElementById('chronicle-collected-results-panel');
  if (resPanel) resPanel.style.display = 'none';

  goPage(1); // Page 1(크로니클)로 이동
}

// --- 크로니클 수집 UI 렌더링 헬퍼 함수들 ---
function renderChronicleArticles(articles) {
  const grid = document.getElementById('chronicle-collected-articles-grid');
  grid.innerHTML = '';
  state.selectedChronicleArticles.clear();
  document.getElementById('chronicle-collected-results-panel').style.display = 'block';

  articles.forEach((a, i) => {
    const card = document.createElement('div');
    card.className = 'article-card';
    card.id = 'chronicle-card-' + i;
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
      aBadge + cBadge +
      '</div>' +
      '<div class="card-title">' + a.title + '</div>' +
      '<div class="card-desc">' + a.summary + '</div>' +
      urlHtml +
      '</div>' +
      '<div style="display:flex;flex-direction:column;align-items:center;gap:6px;min-width:44px;">' +
      '<div class="card-checkbox" id="chronicle-check-' + i + '" style="font-size:26px;color:var(--text3);cursor:pointer;transition:all 0.2s;user-select:none;line-height:1;">☐</div>' +
      '<span style="font-size:9px;color:var(--text3);font-family:var(--font-mono);">#' + String(i + 1).padStart(2, '0') + '</span>' +
      '</div>';

    card.addEventListener('click', function () { toggleChronicleArticle(i); });
    grid.appendChild(card);
  });
  updateChronicleSelectedCount();
}

function toggleChronicleArticle(i, e) {
  if (e) e.stopPropagation();
  const card = document.getElementById('chronicle-card-' + i);
  const check = document.getElementById('chronicle-check-' + i);
  if (!card) return;
  if (state.selectedChronicleArticles.has(i)) {
    state.selectedChronicleArticles.delete(i);
    card.classList.remove('selected');
    if (check) { check.textContent = '☐'; check.style.color = 'var(--text3)'; }
  } else {
    state.selectedChronicleArticles.add(i);
    card.classList.add('selected');
    if (check) { check.textContent = '☑'; check.style.color = 'var(--teal)'; }
  }
  updateChronicleSelectedCount();
}

function updateChronicleSelectedCount() {
  const badge = document.getElementById('chronicle-selected-count-badge');
  if (badge) badge.textContent = state.selectedChronicleArticles.size + '건 추가 선택됨';
}

function selectAllChronicleArticles() {
  state.chronicleArticles.forEach((_, i) => {
    if (!state.selectedChronicleArticles.has(i)) toggleChronicleArticle(i);
  });
}

function deselectAllChronicleArticles() {
  [...state.selectedChronicleArticles].forEach(i => toggleChronicleArticle(i));
}

function updateSelectedCount() {
  const cnt = state.selectedArticles.size;
  const badge = document.getElementById('selected-count-badge');
  const btnLatest = document.getElementById('btn-latest-brief');
  const btnHistory = document.getElementById('btn-history-summary');

  if (badge) badge.textContent = cnt + '건 선택됨';
  if (btnLatest) btnLatest.disabled = cnt === 0;
  if (btnHistory) btnHistory.disabled = cnt === 0;
}



// [신규] 크로니클 선택 기사를 데이터정리(page-2)로 최종 병합 전송
function sendChronicleToDataProcessing() {
  const selectedChronicle = [...state.selectedChronicleArticles].map(i => state.chronicleArticles[i]).filter(Boolean);

  // 최신 뉴스(latest) 데이터만 필터링하여 유지하고, 크로니클 데이터를 새로 병합
  // (이미 latest와 chronicle이 섞여있을 수 있으므로 URL 기반으로 정밀 병합)
  const currentItems = state.selectedArticlesData || [];
  const chronicleUrls = new Set(selectedChronicle.map(a => a.url));

  // 기존 데이터 중 chronicle이 아닌 것(최신 뉴스)만 남김
  const latestOnly = currentItems.filter(item => !(item.id && String(item.id).startsWith('chronicle')));

  // 최종 리스트 구성: 최신 뉴스 + 선택된 크로니클
  state.selectedArticlesData = [...latestOnly, ...selectedChronicle];

  // 중복 제거 (혹시 모를 중복 방지)
  state.selectedArticlesData = Array.from(new Map(state.selectedArticlesData.map(a => [a.url, a])).values());

  goPage(2);
  showToast('success', `📂 최신 뉴스와 크로니클(${selectedChronicle.length}건)이 통합되었습니다.`);
}

// 데이터 정리 페이지(page-2) UI 업데이트를 renderIntegratedList로 통일하여 populateDataPage는 제거합니다.
function populateDataPage() {
  renderIntegratedList();
}

// 크로니클 페이지(page-1) 하단에 리서치에서 가져온 기사를 렌더링
function populateChroniclePage() {
  const grid = document.getElementById('chronicle-articles-grid');
  const panel = document.getElementById('chronicle-imported-articles-panel');
  if (!grid || !panel) return;

  if (!state.selectedArticlesData || state.selectedArticlesData.length === 0) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  grid.innerHTML = '';

  state.selectedArticlesData.forEach((a, i) => {
    const card = document.createElement('div');
    card.className = 'article-card selected'; // 항상 선택된 상태의 스타일
    card.style.cursor = 'default';

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
      (a.relevance ? '<span class="card-badge">관련도 ' + a.relevance + '/10</span>' : '') +
      '<span class="card-badge">' + a.date + '</span>' +
      aBadge + cBadge +
      '</div>' +
      '<div class="card-title">' + a.title + '</div>' +
      '<div class="card-desc">' + a.summary + '</div>' +
      urlHtml +
      '</div>' +
      '<div style="display:flex;flex-direction:column;align-items:center;gap:6px;min-width:44px;">' +
      '<div class="card-checkbox" style="font-size:26px;color:var(--teal);line-height:1;">☑</div>' +
      '<span style="font-size:9px;color:var(--text3);font-family:var(--font-mono);">#' + String(i + 1).padStart(2, '0') + '</span>' +
      '</div>';

    grid.appendChild(card);
  });
}


// 데이터정리에서 기사작성으로
function goToArticleWriting() {
  if (state.selectedArticlesData.length === 0) {
    showToast('info', '먼저 자료 수집에서 기사를 선택하고 보내 주세요.');
    return;
  }
  // 기사작성 페이지에 참조 기사 로드
  renderWriteSources();
  goPage(3);
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
  const bar = document.getElementById('analysis-progress-bar');
  if (bar) bar.style.width = pct + '%';
  const pctText = document.getElementById('analysis-progress-pct');
  if (pctText) pctText.textContent = pct + '%';
  const txt = document.getElementById('analysis-progress-text');
  if (txt) txt.textContent = label;
  
  const sb = document.getElementById('sb-status');
  if (sb) sb.textContent = label;
}

function addAnalysisLog(type, msg) {
  const box = document.getElementById('analysis-log-box');
  if (!box) return;
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
    showToast('info', '먼저 자료 수집에서 기사를 선택하고 보내 주세요.');
    return;
  }

  const btn = document.getElementById('analyze-btn');
  btn.innerHTML = '<span><div class="spinner"></div> 분석 중...</span>';
  btn.disabled = true;
  updateApiStatus('working');

  // 분석 UI 초기화
  const analysisProg = document.getElementById('analysis-progress-panel');
  if (analysisProg) analysisProg.style.display = 'block';
  const analysisLog = document.getElementById('analysis-log-box');
  if (analysisLog) analysisLog.innerHTML = '';
  ['analysis-summary-panel', 'analysis-facts-panel', 'analysis-perspectives-panel', 'analysis-timeline-panel', 'analysis-factcheck-panel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  const articles = state.selectedArticlesData;
  const regionCfg = REGION_CONFIG[state.region];

  // 💡 [사용자 요청] 기사들을 날짜순(과거 -> 현재)으로 정렬하여 Gemini에게 전달
  const sortedArticles = sortNewsByDate(state.selectedArticlesData);

  // 하이브리드 소스 준비
  const sourcesText = sortedArticles.map((a, i) => {
    const content = getArticleContent(a);
    const mode = (a.fullContent && a.fullContent.length > 100) ? 'FULL' : 'SNIPPET';
    return '[기사 ' + (i + 1) + '] (' + mode + ') ' + a.source + ' (' + a.date + ')\n제목: ' + a.title + '\n내용:\n' + content;
  }).join('\n\n---\n\n');

  addAnalysisLog('info', '📊 다각도 분석 엔진 시작');
  addAnalysisLog('info', '선택된 기사 ' + articles.length + '건 / 하이브리드 데이터 모드');
  articles.forEach((a, i) => {
    const mode = (a.fullContent && a.fullContent.length > 100) ? '전문(' + a.fullContent.length + '자)' : '요약본';
    addAnalysisLog('info', '  #' + (i + 1) + ' ' + a.source + ' → ' + mode);
  });

  try {
    // STEP 1: organizeData — 통합 요약 + 팩트 분류 + 관점/시사점
    setAnalysisProgress(10, 'Step 1/3: 통합 분석 중...');
    addAnalysisLog('info', '🧠 Step 1: organizeData — 통합 요약 & 팩트 분류 시작');
    const organizeResult = await organizeData(sourcesText, regionCfg);
    setAnalysisProgress(40, 'Step 1 완료');
    addAnalysisLog('ok', '✅ 통합 요약, 팩트 분류, 관점/시사점 분석 완료');

    // STEP 2: performFactCheck — 교차 검증
    setAnalysisProgress(80, 'Step 2/2: 교차 검증 중...');
    addAnalysisLog('info', '✅ Step 2: performFactCheck — 교차 검증');
    addAnalysisLog('info', '⏳ API 안정화 대기 (3초)...');
    await sleep(3000);
    const factCheckResult = await performFactCheck(sourcesText, regionCfg);
    setAnalysisProgress(100, '분석 완료!');
    addAnalysisLog('ok', '✅ 교차 검증 완료 — 신뢰도: ' + factCheckResult.confidence);

    // 분석 결과를 state에 저장 (기사 작성 시 활용) - 이미 organizeData에서 세척됨
    state.analysisResult = {
      summary: organizeResult.summary,
      perspectives: organizeResult.perspectives,
      factcheck: factCheckResult,
    };

    // [신규 통합] 사용자 추가 NewsService: 최신 뉴스와 크로니클의 인과관계 연결 (크로니클 데이터가 있을 때만)
    if (state.chronicleArticles && state.chronicleArticles.length > 0) {
      setAnalysisProgress(90, 'Step 3/3: 크로니클-현재 인과관계 연결 중...');
      addAnalysisLog('info', '✅ Step 3: 크로니클과 현재 기사의 맥락적 서사 연결 (NewsService)');
      const linkResultRaw = await NewsService.linkContexts(state.latestNews, state.chronicleArticles);
      const linkResult = linkResultRaw
        .replace(/^#+\s*/gm, '')
        .replace(/^By\s+.*$/gim, '')
        .trim();
      state.analysisResult.perspectives += '\n\n**[크로니클 서사 연결 분석]**\n' + linkResult;
      addAnalysisLog('ok', '✅ 크로니클 기반 서사 브릿지 문장 생성 완료');
    }

    showToast('success', '🧠 다각도 분석 완료! 결과를 확인해 보세요.');
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
  let systemRole = "";
  let summaryInstruction = "";

  if (state.analysisMode === 'LATEST') {
    systemRole = "너는 '실시간 팩트 체크 비서'야. 가장 최근에 발생한 핵심 사건들만 요점을 집어서 짧고 강렬하게 브리핑해줘.";
    summaryInstruction = `1. "summary"(string): 가장 최근 발생한 핵심 사건들 위주의 요점 브리핑 (200-300자 내외). 불필요한 과거사보다는 지금 당장 알아야 할 팩트와 그 결과에 집중해서 '속보' 스타일로 작성해줘.`;
  } else {
    systemRole = "너는 '사건 재구성 전문가'야. 제공된 기사들을 시간 순서대로 분석해서, 사건의 시작부터 현재의 결말까지 '서사'가 느껴지도록 요약해줘.";
    summaryInstruction = `1. "summary"(string): 과거에서 현재로 이어지는 시간 전개형 연대기 요약 (200-300자 내외). 기사들이 과거순([기사 1]이 가장 옛날)으로 정렬되어 있으므로, "어떻게 시작되었고(과거) -> 어떤 우여곡절을 거쳐 -> 지금 어떻게 되었는지(현재)"를 하나의 서사적 흐름으로 작성해줘. 과거의 패배와 현재의 승리 같은 극적인 대비를 강조하면 더 좋아.`;
  }

  const prompt = `[Role]: ${systemRole}
Analyze the following ${state.selectedArticlesData.length} news articles about "${state.topic}" from ${regionCfg.name}.

    ARTICLES:
${sourcesText}

Perform a comprehensive multi-angle analysis and return a JSON object with these fields. 
IMPORTANT: DO NOT include markdown code blocks (like \` \` \`json) in the response. Return JUST the raw JSON.

    ${summaryInstruction}

    2. "perspectives"(string): 템포럴 트렌드와 역사적 맥락에 기반한 시사점 및 미래 전망 (150-200자 내외). 지금까지의 사건 궤적을 토대로 앞으로 어떤 일이 벌어질지 예측해줘.

    3. "timeline"(array of objects): 제공된 ${state.selectedArticlesData.length}개의 기사 각각에 대응하는 핵심 사건 연표. 
       **반드시 기사 개수와 동일하게 정확히 ${state.selectedArticlesData.length}개의 항목을 생성해.**
       - "date"(string): 기사의 날짜인 "YYYY.MM.DD" 형식.
       - "event"(string): 짧고 임팩트 있는 사건명.
       - "details"(string): 2-3문장 정도의 상세 설명.
       - "link"(string): 이 사건이 현재 상황에 미친 직접적인 영향에 대한 분석.

    Return ONLY valid JSON. ${state.lang === 'ko' ? '모든 텍스트는 한국어로 작성하세요.' : 'Write all text in English.'}`;

  const raw = await callGemini(prompt, 'gemini-2.0-flash');
  let result = { summary: '', perspectives: '', timeline: [] };

  try {
    // 💡 코드 블록 제거 및 JSON 추출
    const cleanRaw = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    const jsonMatch = cleanRaw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('No JSON found');
    }
  } catch (err) {
    console.error('organizeData Parsing Fallback:', err);
    // 폴백: JSON 구조가 깨졌을 경우 텍스트를 적절히 분리 시도
    const sections = raw.split(/summary|perspectives|timeline/i);
    result.summary = sections[1] ? sections[1].replace(/[:"{}]/g, '').trim() : raw.slice(0, 500);
    result.perspectives = sections[2] ? sections[2].replace(/[:"{}]/g, '').trim() : raw.slice(500, 800);
    result.timeline = [];
  }

  // UI 렌더링: 통합 요약 (코드 형식 기호 및 마크다운 헤더 제거)
  const cleanSummary = (result.summary || '')
    .replace(/[`]/g, '')
    .replace(/^#+\s*/gm, '') // 줄 시작의 # 모두 제거
    .replace(/^By\s+.*$/gim, '') // "By ..." 형식 제거
    .trim();
  const summaryEl = document.getElementById('analysis-summary');
  if (summaryEl) {
    summaryEl.innerHTML = cleanSummary || '분석 결과 없음';
    const panel = document.getElementById('analysis-summary-panel');
    if (panel) panel.style.display = 'block';
  }

  // UI 렌더링: 관점/시사점 (코드 형식 기호 및 마크다운 헤더 제거)
  const cleanPerspectives = (result.perspectives || '')
    .replace(/[`]/g, '')
    .replace(/^#+\s*/gm, '') 
    .replace(/^By\s+.*$/gim, '')
    .trim();
  const perspectiveEl = document.getElementById('analysis-perspectives');
  if (perspectiveEl) {
    perspectiveEl.innerHTML = cleanPerspectives || '분석 결과 없음';
    const panel = document.getElementById('analysis-perspectives-panel');
    if (panel) panel.style.display = 'block';
  }

  // UI 렌더링: 자동 타임라인 연표 생성
  const timelineContainer = document.getElementById('analysis-timeline-container');
  if (timelineContainer && result.timeline && result.timeline.length > 0) {
    timelineContainer.innerHTML = '';
    // 날짜순 정렬
    const sortedTimeline = result.timeline.sort((a, b) => new Date(a.date.replace(/\./g, '-')) - new Date(b.date.replace(/\./g, '-')));

    sortedTimeline.forEach(item => {
      const el = document.createElement('div');
      el.className = 'timeline-item';
      const cleanDetails = (item.details || '').replace(/[#*`]/g, '').trim();
      const cleanLink = (item.link || '').replace(/[#*`]/g, '').trim();
      el.innerHTML = `
        <div class="timeline-dot"></div>
        <div class="timeline-content">
          <div class="timeline-date">${item.date}</div>
          <div class="timeline-title">${item.event}</div>
          <div class="timeline-details">${cleanDetails}</div>
          <div class="timeline-link-box">
            <strong>🔗 현재와의 연결고리:</strong> <span>${cleanLink}</span>
          </div>
        </div>`;
      timelineContainer.appendChild(el);
    });
    document.getElementById('analysis-timeline-panel').style.display = 'block';
  }

  // 결과 객체 업데이트 및 반환 (세척된 버전 포함)
  result.summary = cleanSummary;
  result.perspectives = cleanPerspectives;
  return result;
}




// STEP 2: performFactCheck — 교차 검증
async function performFactCheck(sourcesText, regionCfg) {
  const prompt = `You are a fact - checking editor. Validate the facts extracted from the original source articles.

ORIGINAL SOURCE ARTICLES:
${sourcesText}

    Verify:
    1. Are the key facts in the source articles verifiable and consistent?
      2. Are there any potential inaccuracies or unsupported claims?

          Return a JSON object:
    {
      "confidence": "A percentage score 0-100 indicating fact alignment",
        "status": "검증 상태 요약 (1문장, 한국어)",
          "verified": ["검증된 팩트 1", "검증된 팩트 2", ...],
            "warnings": ["주의사항 1", ...],
              "recommendation": "기사 작성 시 권장 사항 (2-3문장, 한국어)"
    }

Return ONLY valid JSON.
      ${state.lang === 'ko' ? '한국어로 작성하세요.' : 'Write in English.'} `;

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
  const selected = state.selectedArticlesData.length > 0 ? state.selectedArticlesData : state.articles.slice(0, 3);
  // 프로페셔널한 진행 메시지로 변경
  const statusMsg = selected.some(a => (a.id && String(a.id).startsWith('chronicle')) || a.sourceTag === '6개월전')
    ? `<span><div class="spinner"></div> ${selected.length}개의 소스를 바탕으로 과거와 현재의 맥락을 통합하는 중...</span>`
    : `<span><div class="spinner"></div> ${selected.length}개의 핵심 기사를 분석하여 전문 기사 작성 중...</span>`;

  btn.innerHTML = statusMsg; btn.disabled = true;
  updateApiStatus('working');
  const regionCfg = REGION_CONFIG[state.region];

  // 💡 [사용자 요청] 기사들을 날짜순(과거 -> 현재)으로 정렬하여 Gemini에게 전달
  const sortedSelected = sortNewsByDate(selected);

  const sourceSummary = sortedSelected.map((a, i) => {
    const content = a.fullContent ? a.fullContent.slice(0, 3000) : a.summary;
    const typeLabel = (a.id && String(a.id).startsWith('chronicle')) || a.sourceTag === '6개월전' ? '[과거 맥락]' : '[최신 뉴스]';
    return `[출처 ${i + 1}] ${typeLabel} ${a.source} (${a.date})${a.author ? ' | 기자: ' + a.author : ''} \n제목: ${a.title} \n기사 내용: \n${content} `;
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
     - Narrative: Compare data from multiple sources (especially merging past chronicle data with current news) and find the trend.
     - Logical Phrases: Use phrases like "The cause of this phenomenon is...", "When compared to past cases...".
     - Evidence: Actively incorporate expert quotes and statistical figures.
     - Outlook: Provide a multi - faceted perspective on future ripple effects.
     `,
    '오피니언': `
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
      - Visuals: Use lots of emojis(🔥, 🚀, ✅, 👀, ✨, 💎) at the start/end of sentences.
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
FACT-CHECK CONFIDENCE: ${ar.factcheck?.confidence || 'N/A'}%
RECOMMENDATIONS: ${ar.factcheck?.recommendation || ''}
=== END ANALYSIS ===`;
  }

  // 기사 분량 및 맥락 통합 지침 생성
  const lengthInstr = {
    '객관적 보도': '분량을 충분히 확보하여 리드문과 3개 이상의 본문 단락으로 구성하세요.',
    '심층 분석': '글이 너무 짧지 않게 유의하세요. 과거와 현재의 데이터를 대조하며 6개 이상의 풍부한 단락으로 심도 있게 작성하세요.',
    '오피니언': '논리적인 흐름을 가지고 4-5개 이상의 단락으로 명확한 주장을 펼치세요.',
    '브리핑': '핵심 내용을 임팩트 있게 전달하세요.',
    'SNS 스타일': '핵심 내용을 임팩트 있게 전달하되, 스토리텔링이 포함된 풍부한 내용을 작성하세요.'
  };

  const todayStr = getTodayStr();
  const userPress = '동아일보';
  const userAuthor = '';

  const prompt = `You are an elite investigative journalist for a ${regionCfg.name} news agency.
Today is ${todayStr}. All news must be written with today's perspective.

[Ground Truth - EXCLUSIVE SOURCES]:
${sourceSummary}
${analysisContext}

[ARTICLE STYLE GUIDE]:
${styleMap[state.articleStyle] || 'objective news'}

[SPECIAL INSTRUCTION]:
- **CHRONOLOGICAL NARRATIVE**: This article MUST follow a temporal flow. Start with the 'past context' (from chronicle sources) to set the background, then seamlessly connect to the 'latest news' to show development, impact, and current status.
- **"PAST vs. PRESENT" BRIDGE**: Use storytelling techniques to explain "how it started (Past)" and "how it progressed to today (Latest)". Ensure a logical causal link between them.
- **LENGTH & DEPTH**: ${lengthInstr[state.articleStyle] || 'Provide a comprehensive article with sufficient length.'}
- **NO HEADERS**: Do NOT use any Markdown symbols like '#' or '##' at the beginning of lines. Strictly use plain text for the title and subtitle.
- **NO BYLINE**: Do NOT include any reporter name, press name, or date lines in the content.

[STRICT INSTRUCTIONS]:
1. SOURCE ADHERENCE: Use ONLY the provided sources. Use 'past context' for background and 'latest news' for recent developments.
2. MAIN TOPIC: Focus on the primary headlines from the sources.
3. DATE LINE: Do NOT include today's date in the content area.
4. ${state.articleStyle === '브리핑' ? 'STRUCTURE: Use a Bulleted List format as specified in the Style Guide.' : "STRUCTURE: Follow a 'History -> Current Issue -> Outlook' transition flow."}

[FORMATTING SYSTEM]:
- [Headline: Directly as the first line]
- [Sub-headline: Directly as the second line]
- [Full Article Content: Merging Past and Present into a single cohesive story]

${langInstr}
IMPORTANT: Make it crystal clear how past events influenced the current situation.`;

  try {
    let result = await callGemini(prompt, 'gemini-2.0-flash');
    
    // ✅ 강력한 후처리: 모든 # 기호 및 구버전 바이라인(By, 바이, 기자명 등) 제거
    result = result
      .replace(/^#+\s*/gm, '') // 줄 시작의 # 모두 제거
      .replace(/^By\s+.*$/gim, '') // "By 김민지 | 2026.03.19" 등 전체 줄 제거 (대소문자 무시, 전역 매칭)
      .replace(/^바이라인:.*$/gm, '') // "바이라인:" 제거
      .replace(/^언론사:.*$/gm, '') // "언론사:" 제거
      .trim();

    state.generatedArticle = result;
    document.getElementById('article-textarea').value = result;
    updateWordCount(); markStepComplete(2);
    showToast('success', '✅ 기사 생성 완료!');
    await autoGenPrompt();

    const htmlBtn = document.querySelector('.save-btn[onclick="exportArticle()"]');
    const txtBtn = document.querySelector('.save-btn[onclick="downloadArticle()"]');
    if (htmlBtn) htmlBtn.disabled = false;
    if (txtBtn) txtBtn.disabled = false;

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

  goPage(4);
  showToast('info', '🎨 이미지 프롬프트를 자동 생성 중...');
  setTimeout(() => autoGenPrompt(), 300);
}

// 이미지생성에서 미리보기로 이동
function goToPreview() {
  goPage(5);
  setTimeout(() => updatePreview(), 100);
}

function updateWordCount() {
  const text = document.getElementById('article-textarea').value;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const wordCountEl = document.getElementById('word-count');
  if (wordCountEl) wordCountEl.textContent = words + ' 단어';
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

  const manualSource = document.getElementById('np-manual-source')?.value.trim() || '';

  // 마크다운 → HTML 변환
  let htmlBody = text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^---+$/gm, '<hr>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  htmlBody = '<p>' + htmlBody + '</p>';

  const sourceHtml = manualSource ? `<div class="source">출처: ${manualSource}</div>` : '';
  const dateStr = new Date().toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric' });

  const fullHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>동아일보 뉴스 기사</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;700;900&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#f4f1ec; font-family:'Noto Serif KR',serif; color:#1a1a1a; padding:40px 20px; }
  .container { max-width:720px; margin:0 auto; background:#fff; border-radius:4px; box-shadow:0 2px 20px rgba(0,0,0,0.08); overflow:hidden; }
  .header { text-align:center; padding:32px 40px 16px; border-bottom:3px double #1a1a1a; }
  .header .brand { font-size:11px; letter-spacing:6px; color:#888; text-transform:uppercase; margin-bottom:8px; }
  .header .date { font-size:12px; color:#999; margin-top:4px; }
  .body { padding:32px 40px 40px; line-height:1.9; font-size:15px; }
  .body h1 { font-size:26px; font-weight:900; line-height:1.4; margin-bottom:20px; border-bottom:2px solid #1a1a1a; padding-bottom:12px; }
  .body h2 { font-size:20px; font-weight:700; margin:28px 0 12px; color:#2d3436; }
  .body h3 { font-size:17px; font-weight:700; margin:22px 0 10px; color:#444; }
  .body p { margin-bottom:14px; text-align:justify; }
  .body strong { font-weight:700; }
  .body em { font-style:italic; color:#555; }
  .body hr { border:none; border-top:1px solid #ddd; margin:24px 0; }
  .source { text-align:right; font-size:12px; color:#888; padding:16px 40px 24px; border-top:1px solid #eee; }
  .footer { text-align:center; padding:16px; font-size:10px; color:#bbb; border-top:1px solid #eee; letter-spacing:2px; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div class="brand">동아일보 INTELLIGENCE NEWS</div>
    <div class="date">${dateStr}</div>
  </div>
  <div class="body">${htmlBody}</div>
  ${sourceHtml}
  <div class="footer">동아일보 AI NEWSROOM — Powered by Intelligence Engine</div>
</div>
</body>
</html>`;

  // MS Word가 HTML을 해석할 수 있도록 MIME 타입을 application/msword로 지정
  // 문서가 깨지지 않도록 UTF-8 BOM(\ufeff) 추가
  const blob = new Blob(['\ufeff', fullHtml], { type: 'application/msword;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `donga_article_${Date.now()}.doc`;
  a.click();
  showToast('success', '📰 기사가 워드 문서(.doc)로 저장되었습니다!');
}



// IMAGE GENERATION
// IMAGE GENERATION - 자동 프롬프트 생성 (수정본)
async function autoGenPrompt() {
  const articleArea = document.getElementById('article-textarea');
  const promptArea = document.getElementById('img-prompt');
  const koArea = document.getElementById('img-prompt-ko');

  const content = (articleArea ? articleArea.value : '') || state.generatedArticle || state.topic;
  if (!content || content.trim().length < 5) {
    if (state.topic) {
      // 본문이 없으면 토픽이라도 사용
    } else {
      return null;
    }
  }

  try {
    promptArea.value = "🤖 인텔리전스 엔진이 시네마틱 프롬프트를 설계 중입니다...";
    promptArea.classList.add('loading-text');
    if (koArea) koArea.style.display = 'none';

    // 개선된 제목 추출: 마크다운 제거 후 첫 줄 사용
    let newsTitle = state.topic;
    if (content) {
      const lines = content.split('\n').filter(l => l.trim().length > 0);
      if (lines.length > 0) {
        newsTitle = lines[0].replace(/[#*`_]/g, '').trim();
      }
    }

    const textQuery = `[Task: Create a 'No-Human' cinematic image prompt]
Keyword: ${state.topic}
News Title: ${newsTitle}

Rules:
1. FOCUS: Focus on objects, stadium, equipment, landscape, or environmental atmosphere strictly related to the news.
2. NO HUMANS: Strictly no people, no faces, no body parts, no silhouettes of humans.
3. STYLE: Cinematic, dramatic lighting, detailed textures, 8k resolution, professional photography.
4. NO TEXT: No letters, no logos, no watermarks.

Return strictly in JSON format:
{
  "english": "detailed cinematic prompt in English",
  "korean": "프롬프트 내용의 한글 요약 (한 문장)"
}`;

    // 최신 gemini-2.0-flash 모델 사용으로 정확성 향상
    const result = await callGemini(textQuery, 'gemini-2.0-flash');

    // 💡 마크다운 블록 제거 후 파싱 시도
    const cleanResult = result.replace(/```json|```/g, '').trim();
    const data = parseJson(cleanResult) || parseJson(result);

    if (data && data.english) {
      promptArea.value = data.english.trim();
      promptArea.classList.remove('loading-text');
      if (data.korean && koArea) {
        koArea.textContent = '🇰🇷 ' + data.korean;
        koArea.style.display = 'block';
      }
      showToast('success', '🎨 시네마틱 프롬프트 설계 완료!');
      return data.english.trim();
    } else {
      // 파싱 실패 시 텍스트에서 따옴표 등 제거하고 직접 사용
      const fallback = cleanResult.replace(/["'{}]/g, '').replace(/english:|korean:/gi, '').trim();
      promptArea.value = fallback.slice(0, 500);
      promptArea.classList.remove('loading-text');
      return promptArea.value;
    }
  } catch (err) {
    console.error('Prompt gen error:', err);
    promptArea.value = "";
    promptArea.classList.remove('loading-text');
    showToast('error', `프롬프트 생성 오류: ${err.message}`);
    return null;
  }
}

async function generateImage() {
  try {
    updateApiStatus('working');
    showToast('info', '🚀 Gemini가 이미지를 생성 중입니다...');

    if (!state.apiKey) {
      openModal();
      return;
    }

    const backupPrompt = `${state.topic || "General News"} cinematic background, high resolution, professional photography, no people`;
    const finalPrompt = state.artPrompt || document.getElementById('img-prompt')?.value || backupPrompt;

    console.log("🎨 이미지 생성 프롬프트:", finalPrompt);

    const body = {
      contents: [{
        parts: [{ text: `Generate an image: ${finalPrompt}` }]
      }],
      generationConfig: {
        responseModalities: ["IMAGE", "TEXT"]
      }
    };

    // ✅ 공식 문서 기준 최신 이미지 생성 모델
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${state.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    );

    if (response.status === 429) {
      throw new Error('429: ⚠️ 요청이 너무 많습니다. 1분만 쉬었다가 다시 눌러주세요!');
    }
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();

    // inlineData 방식으로 이미지 추출
    let base64Data = null;
    const parts = data?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
        base64Data = part.inlineData.data;
        break;
      }
    }

    if (!base64Data) {
      throw new Error('이미지 데이터를 찾을 수 없습니다. (SafeSearch 필터링 또는 API 미지원)');
    }

    const imageUrl = `data:image/png;base64,${base64Data}`;
    state.generatedImage = imageUrl;

    const preview = document.getElementById('image-preview');
    if (preview) {
      preview.innerHTML = `<img src="${imageUrl}" alt="Generated Image" style="width:100%; height:100%; object-fit:cover; border-radius:8px;" />`;
    }

    const npImage = document.getElementById('np-image');
    if (npImage) {
      npImage.src = imageUrl;
      npImage.onload = () => {
        showToast('success', '✨ Gemini 이미지 생성 성공!');
        markStepComplete(3);
        const banner = document.getElementById('image-done-banner');
        if (banner) banner.style.display = 'flex';
        const saveBtn1 = document.getElementById('save-img-btn');
        const saveBtn2 = document.getElementById('save-img-btn2');
        if (saveBtn1) saveBtn1.disabled = false;
        if (saveBtn2) saveBtn2.disabled = false;
      };
    }

  } catch (err) {
    console.error('Gemini Image Error:', err);
    showToast('error', err.message.includes('429') ? err.message : '❌ 이미지 생성 실패: ' + err.message);
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
  if (!article || !article.trim()) { showToast('info', '먼저 기사를 작성해 보세요.'); return; }

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

  // 한국어 음성 필터링
  const koVoices = voices.filter(v => v.lang.startsWith('ko'));
  let selectedVoice = null;

  if (state.ttsVoice === 'male') {
    // 남성 음성 우선 검색 (Injoon, Male, 남성 등 키워드 기반)
    selectedVoice = koVoices.find(v =>
      v.name.toLowerCase().includes('injoon') ||
      v.name.toLowerCase().includes('male') ||
      v.name.includes('남성')
    ) || koVoices[0] || voices[0];
  } else {
    // 여성 음성 우선 검색 (Heami, Female, 여성 등 키워드 기반)
    selectedVoice = koVoices.find(v =>
      v.name.toLowerCase().includes('heami') ||
      v.name.toLowerCase().includes('female') ||
      v.name.includes('여성')
    ) || koVoices[0] || voices[0];
  }

  const utter = new SpeechSynthesisUtterance(cleanText);
  if (selectedVoice) utter.voice = selectedVoice;
  utter.lang = selectedVoice?.lang || 'ko-KR';

  if (state.ttsVoice === 'male') {
    // 음성 이름에 'Injoon'이나 'Male'이 있다면 이미 남성 음성일 확률이 높으나, 톤을 더 남성답게 조정
    utter.pitch = 0.3; // 더 낮은 톤
    utter.rate = rate * 1.05; // 남성 톤은 살짝 빠르게 해야 웅얼거림이 적음
  } else {
    utter.pitch = 1.05; // 여성은 살짝 높은 산뜻한 톤
    utter.rate = rate;
  }

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
      ttsSetProgress(pct, '읽는 중... (남은 시간 약 ' + mm + '분 ' + String(ss).padStart(2, '0') + '초)');
      document.getElementById('tts-time-display').textContent = Math.round(pct) + '%';
    }
  };

  utter.onend = () => {
    ttsState.isPlaying = false;
    ttsSetStatus('✅', '낭독 완료!', '전체 재생 완료 · 아래 저장 버튼으로 스크립트를 저장할 수 있습니다.', 'var(--green)');
    ttsSetProgress(100, '완료!');
    document.getElementById('tts-stop-btn').disabled = true;
    const ttsSaveBtn = document.getElementById('tts-save-btn');
    if (ttsSaveBtn) ttsSaveBtn.disabled = false;
    document.getElementById('tts-time-display').textContent = '완료';
    markStepComplete(3);
    showToast('success', '🎙️ TTS 낭독 완료!');

    const saveTtsBtn = document.getElementById('save-tts-btn');
    if (saveTtsBtn) saveTtsBtn.disabled = false;

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

// TTS 오디오를 실제 .wav 파일로 저장
// 브라우저 TTS 재생 시 MediaRecorder로 시스템 오디오를 캡처하여 저장
function ttsSaveMp3() {
  const text = ttsState.text || (state.generatedArticle || '').replace(/[#*`_~\[\]]/g, '');
  if (!text) { showToast('info', '저장할 내용이 없습니다.'); return; }

  showToast('info', '🎙️ 오디오 녹음을 시작합니다. 잠시 기다려주세요...');

  // 이전 재생 중지
  window.speechSynthesis.cancel();

  const rate = parseFloat(document.getElementById('tts-rate')?.value || 1);
  const voices = window.speechSynthesis.getVoices();
  const koVoices = voices.filter(v => v.lang.startsWith('ko'));
  let selectedVoice;
  if (state.ttsVoice === 'male') {
    selectedVoice = koVoices.find(v => v.name.toLowerCase().includes('injoon') || v.name.toLowerCase().includes('male') || v.name.includes('남성')) || koVoices[0] || voices[0];
  } else {
    selectedVoice = koVoices.find(v => v.name.toLowerCase().includes('heami') || v.name.toLowerCase().includes('female') || v.name.includes('여성')) || koVoices[0] || voices[0];
  }

  // AudioContext + MediaStreamDestination + MediaRecorder 를 활용한 오디오 캡처
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const dest = audioCtx.createMediaStreamDestination();
    // 스피커 출력에 연결 (사용자도 소리 들음)
    const gainNode = audioCtx.createGain();
    gainNode.connect(audioCtx.destination);
    gainNode.connect(dest);

    const recorder = new MediaRecorder(dest.stream, { mimeType: 'audio/webm' });
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

    recorder.onstop = async () => {
      if (chunks.length === 0) {
        showToast('error', '오디오 녹음 데이터가 없습니다.');
        return;
      }
      const webmBlob = new Blob(chunks, { type: 'audio/webm' });

      // webm → wav 변환 (AudioContext decodeAudioData 이용)
      try {
        const arrayBuf = await webmBlob.arrayBuffer();
        const audioBuf = await audioCtx.decodeAudioData(arrayBuf);

        // WAV 인코딩
        const numCh = audioBuf.numberOfChannels;
        const sr = audioBuf.sampleRate;
        const len = audioBuf.length;
        const wavBuf = new ArrayBuffer(44 + len * numCh * 2);
        const dv = new DataView(wavBuf);
        const ws = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
        ws(0,'RIFF'); dv.setUint32(4,36+len*numCh*2,true); ws(8,'WAVE');
        ws(12,'fmt '); dv.setUint32(16,16,true); dv.setUint16(20,1,true);
        dv.setUint16(22,numCh,true); dv.setUint32(24,sr,true);
        dv.setUint32(28,sr*numCh*2,true); dv.setUint16(32,numCh*2,true);
        dv.setUint16(34,16,true); ws(36,'data'); dv.setUint32(40,len*numCh*2,true);
        let off = 44;
        for (let i = 0; i < len; i++) {
          for (let ch = 0; ch < numCh; ch++) {
            const s = Math.max(-1,Math.min(1,audioBuf.getChannelData(ch)[i]));
            dv.setInt16(off, s<0?s*0x8000:s*0x7FFF, true); off+=2;
          }
        }
        const wavBlob = new Blob([wavBuf], { type: 'audio/wav' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(wavBlob);
        a.download = `tts_audio_${Date.now()}.wav`;
        a.click();
        showToast('success', '🎙️ TTS 오디오가 WAV 파일로 저장되었습니다!');
      } catch (decodeErr) {
        // WAV 변환 실패 시 webm으로 직접 저장
        const a = document.createElement('a');
        a.href = URL.createObjectURL(webmBlob);
        a.download = `tts_audio_${Date.now()}.webm`;
        a.click();
        showToast('success', '🎙️ TTS 오디오가 WebM 파일로 저장되었습니다!');
      }
      audioCtx.close();
    };


    // SpeechSynthesis로 음성 생성하여 캡처
    const utter = new SpeechSynthesisUtterance(text.slice(0, 5000));
    if (selectedVoice) utter.voice = selectedVoice;
    utter.lang = selectedVoice?.lang || 'ko-KR';
    utter.pitch = state.ttsVoice === 'male' ? 0.3 : 1.05;
    utter.rate = rate;
    utter.volume = 1;

    utter.onstart = () => {
      recorder.start();
      ttsSetStatus('🔴', '녹음 중...', '오디오 파일 저장을 위해 기사를 낭독하고 있습니다.', 'var(--red)');
    };

    utter.onend = () => {
      setTimeout(() => { recorder.stop(); }, 500);
      ttsSetStatus('✅', '녹음 완료', '파일 변환 중...', 'var(--green)');
    };

    utter.onerror = (e) => {
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      recorder.stop();
      showToast('error', '❌ TTS 녹음 실패: ' + e.error);
    };

    window.speechSynthesis.speak(utter);

  } catch (err) {
    // MediaRecorder 캡처 불가 시 fallback: webm blob 직접 저장 불가이므로, 텍스트 스크립트 저장
    console.warn('Audio capture failed, falling back to text:', err);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tts_script_' + Date.now() + '.txt';
    a.click();
    showToast('info', 'ℹ️ 이 브라우저에서는 오디오 캡처가 지원되지 않아 스크립트를 텍스트로 저장했습니다.');
  }
}

// 구 saveTTSAudio 호환용 (미리보기 저장 버튼)
function saveTTSAudio() { ttsSaveMp3(); }

function togglePlay() { if (ttsState.isPlaying) ttsStop(); else generateTTS(); }


// PREVIEW — 신문지 레이아웃 업데이트
function updatePreview() {
  const article = state.generatedArticle || document.getElementById('article-textarea').value || '';
  const regionNames = { KR: 'KOREA EDITION', US: 'UNITED STATES EDITION', GB: 'UNITED KINGDOM EDITION' };

  if (article && article.trim().length > 0) {
    const today = new Date();
    const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
    document.getElementById('np-date').textContent = dateStr;

    const lines = article.split('\n').filter(l => l.trim().length > 0);
    const title = lines[0] || (state.topic || '');
    document.getElementById('np-headline').textContent = title;

    const subEl = document.getElementById('np-subhead');
    if (lines.length > 2 && !lines[1].includes(':')) { 
      subEl.textContent = lines[1]; 
      subEl.style.display = 'block'; 
    } else { 
      subEl.style.display = 'none'; 
    }

  }


  // ✅ 기사 본문 추출 — 제목/부제/바이라인 제거 후 단락 구성
  const bodyText = article
    .replace(/^#{1,6}\s*.+$/gm, '')           // # 헤딩 전체 제거
    .replace(/^(?:.+ : .+ 기자|언론사:|바이라인:|기자:|Byline:|By\s).+$/gim, '')   // 바이라인 제거
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/`/g, '')
    .replace(/^---+$/gm, '')                   // 구분선 제거
    .trim();

  const paragraphs = bodyText
    .split(/\n{1,}/)
    .map(p => p.trim())
    .filter(p => p.length > 10);              // 너무 짧은 줄 제거

  const bodyEl = document.getElementById('np-body');
  const imageFrame = document.getElementById('np-image-frame');
  const npImage = document.getElementById('np-image');

  // ✅ 이미지 유무 및 비율에 따른 레이아웃 분기
  if (state.generatedImage) {
    imageFrame.style.display = 'block';
    npImage.src = state.generatedImage;

    if (state.aspectRatio === '16:9') {
      // ─── 16:9 가로형 레이아웃 ───
      // 이미지: 상단 전체 너비 고정
      // 기사: 이미지 아래, 3단 컬럼으로 균형있게 채움
      imageFrame.style.cssText = `
        display: block;
        width: 100%;
        aspect-ratio: 16 / 9;
        float: none;
        margin: 0 0 24px 0;
        overflow: hidden;
        border: 1px solid #b8a88a;
        padding: 4px;
        background: #ede2c8;
        box-sizing: border-box;
      `;
      npImage.style.cssText = `
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      `;
      bodyEl.style.cssText = `
        column-count: 3;
        column-gap: 24px;
        column-rule: 1px solid #c4b496;
        column-fill: balance;
        clear: both;
      `;

    } else if (state.aspectRatio === '9:16') {
      // ─── 9:16 세로형 레이아웃 ───
      // 이미지: 우측 고정 float
      // 기사: 이미지 왼쪽에서 아래로 흐름
      imageFrame.style.cssText = `
        display: block;
        width: 38%;
        aspect-ratio: 9 / 16;
        float: right;
        margin: 0 0 16px 22px;
        overflow: hidden;
        border: 1px solid #b8a88a;
        padding: 4px;
        background: #ede2c8;
        box-sizing: border-box;
      `;
      npImage.style.cssText = `
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      `;
      bodyEl.style.cssText = `
        column-count: 1;
        overflow: hidden;
      `;
    }

  } else {
    // 이미지 없을 때
    imageFrame.style.display = 'none';
    bodyEl.style.cssText = `
      column-count: 2;
      column-gap: 24px;
      column-rule: 1px solid #c4b496;
      column-fill: balance;
    `;
  }

  // ✅ 기사 본문 렌더링
  if (paragraphs.length > 0) {
    bodyEl.innerHTML = paragraphs.map((p, i) => `<p style="
      margin-bottom: 10px;
      text-indent: ${i === 0 ? '0' : '1.2em'};
      font-size: 13px;
      line-height: 1.85;
      color: #2a2218;
      text-align: justify;
    ">${p}</p>`).join('');
  } else {
    bodyEl.innerHTML = '<p style="color:#999; font-size:12px;">기사 내용을 불러오는 중...</p>';
  }

  // 메타 정보 업데이트
  const words = bodyText.trim() ? bodyText.trim().split(/\s+/).length : 0;
  const metaWords = document.getElementById('meta-words');
  const metaSources = document.getElementById('meta-sources');
  const metaImage = document.getElementById('meta-has-image');
  if (metaWords) metaWords.textContent = words;
  if (metaSources) metaSources.textContent = state.selectedArticlesData.length || state.articles.length;
  if (metaImage) metaImage.textContent = state.generatedImage ? '✓' : '—';

  // 출처 기사 목록
  const sourcesPanel = document.getElementById('preview-sources-panel');
  const sourcesList = document.getElementById('preview-sources-list');
  const sourcesCount = document.getElementById('preview-sources-count');
  const sourcesData = state.selectedArticlesData.length > 0 ? state.selectedArticlesData : [];

  if (sourcesPanel && sourcesList && sourcesData.length > 0) {
    sourcesPanel.style.display = 'block';
    if (sourcesCount) sourcesCount.textContent = sourcesData.length + '건';
    sourcesList.innerHTML = '';
    sourcesData.forEach((a, i) => {
      const item = document.createElement('div');
      item.style.cssText = 'background:var(--bg4); border-radius:var(--radius-sm); padding:11px 14px; border-left:3px solid var(--teal); display:flex; align-items:flex-start; gap:12px;';
      const hasUrl = a.url && a.url !== '#';
      const urlHtml = hasUrl
        ? `<a href="${a.url}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;font-family:var(--font-mono);font-size:10px;color:var(--teal);text-decoration:none;margin-top:5px;padding:3px 8px;background:var(--teal-dim);border:1px solid var(--border-teal);border-radius:6px;">🔗 원본</a>`
        : '';
      item.innerHTML =
        `<span style="font-family:var(--font-mono);font-size:9px;background:var(--bg3);padding:2px 7px;border-radius:6px;color:var(--teal);white-space:nowrap;margin-top:2px;">#${i + 1}</span>` +
        `<div style="flex:1;min-width:0;">` +
        `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px;">` +
        `<span style="font-size:11px;font-weight:700;color:var(--text2);">${a.source || ''}</span>` +
        (a.author ? `<span class="card-badge">${a.author}</span>` : '') +
        `</div>` +
        `<div style="font-size:12px;font-weight:700;color:var(--text);line-height:1.5;margin-bottom:2px;">${a.title || ''}</div>` +
        urlHtml +
        `</div>`;
      sourcesList.appendChild(item);
    });
  } else if (sourcesPanel) {
    sourcesPanel.style.display = 'none';
  }

  // ✅ [NEW] 뉴스 히스토리 스토리텔링 업데이트
  // 크로니클 기능을 사용했을 때만 (state.chronicleArticles가 있을 때만) 표시
  const historyEl = document.getElementById('np-news-history');
  const hasChronicle = state.chronicleArticles && state.chronicleArticles.length > 0;
  const hasPresent  = state.selectedArticlesData && state.selectedArticlesData.length > 0;

  if (historyEl && hasChronicle && hasPresent) {
    historyEl.style.display = 'block';

    // 크로니클 기사 중 가장 오래된 것 (과거)
    const sortedChronicle = [...state.chronicleArticles].sort(
      (a, b) => new Date(a.date || '1970-01-01') - new Date(b.date || '1970-01-01')
    );
    // 현재 선택 기사 중 가장 최신 것 (현재)
    const sortedPresent = [...state.selectedArticlesData].sort(
      (a, b) => new Date(b.date || '1970-01-01') - new Date(a.date || '1970-01-01')
    );

    const earliest = sortedChronicle[0];
    const latest   = sortedPresent[0];

    historyEl.innerHTML = `
      <div class="np-history-title">⏳ News History: Then &amp; Now</div>
      <div class="np-history-story">
        <div class="np-history-item">
          <div class="np-history-label">PAST</div>
          <div class="np-history-content">
            <div class="np-history-event">${earliest.title}</div>
            <div class="np-history-desc">${earliest.source || ''} — 사건이 시작되거나 주목받기 시작한 초기 맥락입니다.</div>
          </div>
        </div>
        <div class="np-history-item">
          <div class="np-history-label">TODAY</div>
          <div class="np-history-content">
            <div class="np-history-event">${latest.title}</div>
            <div class="np-history-desc">${latest.source || ''} — 과거의 흐름이 이어져 현재 보도되고 있는 핵심 진행 상황입니다.</div>
          </div>
        </div>
      </div>
    `;
  } else if (historyEl) {
    historyEl.style.display = 'none';
  }


  updateManualSourceDisplay();
}

// 수동 출처 입력 필드 업데이트 시 미리보기 반영
function updateManualSourceDisplay() {
  const manualSource = document.getElementById('np-manual-source')?.value.trim();
  const captionEl = document.getElementById('np-caption');
  const footerEl = document.getElementById('np-footer');

  if (manualSource) {
    if (captionEl) {
      captionEl.textContent = `출처 : ${manualSource}`;
      captionEl.style.display = 'block';
    }
    if (footerEl) {
      footerEl.textContent = `출처 : ${manualSource}`;
    }
  } else {
    if (captionEl) {
      captionEl.textContent = '';
      captionEl.style.display = 'none';
    }
    if (footerEl) {
      footerEl.textContent = '';
    }
  }
}

// 기사 HTML 저장 (신문지 레이아웃 포함)
function exportArticle() {
  const article = state.generatedArticle || document.getElementById('article-textarea').value;
  if (!article) { showToast('info', '먼저 기사를 작성해 보세요.'); return; }
  const manualSource = document.getElementById('np-manual-source')?.value.trim() || '';

  const titleMatch = article.match(/^#\s+(.+)/m);
  const title = titleMatch ? titleMatch[1] : (article.split('\n')[0] || state.topic || '뉴스');
  const bodyText = article
    .replace(/^#.+$/gm, '')
    .replace(/^##.+$/gm, '')
    .replace(/^(?:.+ : .+ 기자|언론사:|바이라인:|기자:|Byline:|By\s).+$/gim, '')
    .replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '')
    .trim();
  const paragraphs = bodyText.split(/\n\n+/).filter(p => p.trim().length > 10);

  // 기사 비율은 이미지에만 적용하고, 신문 배경 너비는 유동적이되 850px를 표준으로 함
  let maxWidth = '850px';
  let imgWidth = '45%';
  let imgFloat = 'right';
  let imgMargin = '20px';
  let imgBottom = '10px';

  let colCount = '2';
  if (state.aspectRatio === '16:9') {
    maxWidth = '850px';
    imgWidth = '100%';
    imgFloat = 'none';
    imgMargin = '0 0 20px 0';
    imgBottom = '20px';
    colCount = '2';
  } else if (state.aspectRatio === '9:16') {
    maxWidth = '950px';
    imgWidth = '35%';
    imgFloat = 'right';
    imgMargin = '10px 0 20px 25px';
    imgBottom = '15px';
    colCount = '1';
  } else if (state.aspectRatio === '4:3') {
    maxWidth = '850px';
    imgWidth = '45%';
    imgFloat = 'right';
    imgMargin = '10px 0 20px 20px';
    colCount = '2';
  }

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${title} — AI NEWS ROOM</title>
<style>
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css');
* { font-family: 'Pretendard', sans-serif !important; }
body { margin:0; padding:40px; background:#f4e8c1; background-image:radial-gradient(ellipse at 20% 50%,rgba(139,119,80,0.15) 0%,transparent 50%),radial-gradient(ellipse at 80% 20%,rgba(139,119,80,0.1) 0%,transparent 50%); min-height:100vh; font-family: 'Pretendard', sans-serif !important; }
.newspaper { max-width:${maxWidth}; margin:0 auto; padding:40px 48px 60px; position:relative; color:#2a2218; box-shadow: inset 0 0 80px rgba(139, 119, 80, 0.2), 0 4px 30px rgba(0, 0, 0, 0.5); border-radius: 4px; display: flow-root; }
.newspaper::after { content:''; position:absolute; inset:8px; border:1px solid rgba(139, 119, 80, 0.25); pointer-events:none; }
.np-header { text-align:center; border-bottom:3px double #2a2218; padding-bottom:12px; margin-bottom:16px; }
.np-masthead { font-family:'Pretendard', sans-serif; font-weight: 900; font-size:52px; letter-spacing:0.12em; color:#1a1510; text-transform:uppercase; }
.np-dateline { font-family:'Pretendard', sans-serif; font-weight: 500; font-size:10px; letter-spacing:0.3em; color:#6b5d4f; margin-top:6px; display:flex; justify-content:space-between; text-transform:uppercase; }
.np-rule { height:3px; background:#2a2218; margin:0 0 16px; }
h1 { font-family:'Pretendard', sans-serif; font-size:28px; font-weight:900; color:#1a1510; line-height:1.25; text-align:center; margin-bottom:14px; }
.byline { font-family:'Pretendard', sans-serif; font-weight: 600; font-size:9px; letter-spacing:0.15em; color:#8b7750; text-align:center; text-transform:uppercase; margin-bottom:14px; }
.np-content-area { display: block; width: 100%; position: relative; }
.np-content-area::after { content: ''; display: table; clear: both; }
.np-img { border:1px solid #b8a88a; padding:4px; margin:${imgMargin}; background:#ede2c8; width:${imgWidth}; float:${imgFloat}; }
.np-img img { width:100%; display:block; filter:sepia(0.2) contrast(1.05); }
.np-caption { font-family:'Pretendard', sans-serif; font-weight: 500; font-size:9px; color:#8b7750; text-align:center; margin-top:6px; font-style:italic; }
.body-text { column-count:${colCount}; column-gap:28px; column-rule:1px solid #c4b496; font-family:'Pretendard', sans-serif; font-size:13px; line-height:1.85; color:#2a2218; text-align:justify; }
.body-text p { margin-bottom:12px; text-indent:1.2em; }
.body-text p:first-child { text-indent:0; }
.body-text p:first-child::first-letter { font-size:42px; float:left; line-height:1; margin:2px 8px 0 0; font-weight:900; }
.footer { border-top:2px solid #2a2218; margin-top:20px; padding-top:10px; font-family:'Pretendard', sans-serif; font-weight: 500; font-size:8px; color:#8b7750; letter-spacing:0.2em; text-align:center; text-transform:uppercase; }
</style>
</head>
<body>
<div class="newspaper">
  <div class="np-header">
    <div class="np-masthead">동아일보</div>
    <div class="np-dateline"><span>${state.region} EDITION</span><span></span><span>NEWS</span></div>
  </div>
  <div class="np-rule"></div>
  <h1>${title}</h1>
  <div class="byline" style="text-align:center;">${state.region} EDITION | NEWS</div>
  <div class="np-content-area">
    ${state.generatedImage ? `<div class="np-img"><img src="${state.generatedImage}" alt="${title}"/>${manualSource ? `<div class="np-caption">출처 : ${manualSource}</div>` : ''}</div>` : ''}
    <div class="body-text">${(bodyText.split(/\n+/).filter(p => p.trim().length > 0)).map(p => `<p>${p.trim()}</p>`).join('')}</div>
  </div>
   <div class="footer">${manualSource ? `출처 : ${manualSource}` : ''}</div>
  ${manualSource ? `<div style="margin-top:10px; font-size:9px; color:#8b7750; font-family:'Pretendard', sans-serif;"><strong>참고 출처:</strong> ${manualSource}</div>` : ''}
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
    a.download = `donga_news_${Date.now()}.png`;
    a.click();
    showToast('success', '📸 신문 이미지 저장 완료!');
    return true;
  } catch (err) {
    console.error('Image capture error:', err);
    showToast('error', '❌ 이미지 저장 실패');
    return false;
  }
}


// TTS 오디오를 WAV 파일로 저장 (audioBuffer가 있는 경우에만, 없으면 스크립트 저장)
function saveTTSAudioWav() {
  if (state.audioBuffer) {
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
  } else {
    // 브라우저 내장 TTS는 오디오 스트림 추출이 불가능하므로 스크립트 저장으로 보완
    const article = state.generatedArticle || document.getElementById('article-textarea').value;
    if (!article) { showToast('info', '저장할 기사 내용이 없습니다.'); return; }
    const blob = new Blob([article], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `tts_script_${Date.now()}.txt`; a.click();
    showToast('info', 'ℹ️ 브라우저 음성은 보안상 오디오 직접 저장이 제한되어 스크립트를 .txt로 저장했습니다.');
  }
}

// 전체 결과물 일괄 저장 (이미지 파일 포함)
async function saveAllBundle() {
  let savedItems = [];
  const article = state.generatedArticle || document.getElementById('article-textarea').value;

  // 1. 기사 텍스트 (.txt)
  if (article) savedItems.push({ fn: downloadArticle, delay: 0 });

  // 2. 신문 레이아웃 HTML (.html)
  if (article) savedItems.push({ fn: exportArticle, delay: 600 });

  // 3. 신문 레이아웃 이미지 (.png)
  if (article) savedItems.push({ fn: savePreviewAsImage, delay: 1500 });

  // 4. AI 생성 원본 이미지 (.png)
  if (state.generatedImage) savedItems.push({ fn: saveImage, delay: 2500 });

  // 5. TTS 데이터 (Audio or Script)
  if (article) savedItems.push({ fn: saveTTSAudio, delay: 3500 });

  if (savedItems.length === 0) {
    showToast('info', '저장할 결과물이 아직 없습니다.');
    return;
  }

  showToast('info', `📦 총 ${savedItems.length}개 항목 일괄 저장을 시작합니다...`);

  savedItems.forEach(item => {
    setTimeout(async () => {
      if (item.fn.constructor.name === 'AsyncFunction') {
        await item.fn();
      } else {
        item.fn();
      }
    }, item.delay);
  });
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

  // 헤더 버튼 초기화
  const btnLatest = document.getElementById('btn-latest-brief');
  const btnHistory = document.getElementById('btn-history-summary');
  if (btnLatest) btnLatest.style.display = 'none';
  if (btnHistory) btnHistory.style.display = 'none';

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
  ['analysis-progress-panel', 'analysis-summary-panel', 'analysis-facts-panel', 'analysis-perspectives-panel', 'analysis-factcheck-panel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  for (let i = 0; i < 6; i++) { document.getElementById('nav-' + i)?.classList.remove('completed'); const badge = document.getElementById('badge-' + i); if (badge) { badge.textContent = i + 1; badge.style.background = ''; badge.style.color = ''; } }
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

// ============================================================
// ARCHIVE (보관함) 
// -> 이제 키워드 보관함(Vault)과 통합하여 기사를 저장합니다.
// ============================================================

function saveToArchive() {
  const textareaEl = document.getElementById('article-textarea');
  const article = state.generatedArticle || (textareaEl ? textareaEl.value.trim() : '');
  
  if (!article || article.trim().length < 10) {
    showToast('info', '저장할 기사가 없습니다. 먼저 기사를 작성해 주세요.');
    return;
  }

  const titleMatch = article.match(/^#\s+(.+)/m);
  const title = titleMatch ? titleMatch[1].trim() : (state.topic || '제목 없는 뉴스');

  const vaultKey = 'atlas_keyword_vault';
  const existing = JSON.parse(localStorage.getItem(vaultKey) || '{}');
  const keyword = state.topic.trim();
  const now = new Date();
  const dateKey = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;
  const timeStr = now.toTimeString().slice(0,5);
  // 현재 세션 ID가 있으면 찾고, 없으면 새로 생성 (날짜 그룹화 유지)
  const sessionId = `${dateKey}_${timeStr.replace(':','')}`;

  if (!existing[keyword]) existing[keyword] = {};
  
  // 만약 현재 연구 세션이 이미 저장되어 있다면 해당 세션에 기사를 추가하고,
  // 없다면 새 세션을 만들어 기사를 저장함.
  // (가장 최근 세션을 찾는 로직 추가 가능)
  const lastSessionId = Object.keys(existing[keyword]).sort().reverse()[0];
  const targetId = (lastSessionId && lastSessionId.startsWith(dateKey)) ? lastSessionId : sessionId;

  if (!existing[keyword][targetId]) {
    existing[keyword][targetId] = { date: dateKey, time: timeStr, articles: [] };
  }

  // 최종 기사 저장
  existing[keyword][targetId].finalArticle = {
    title: title,
    content: article,
    image: state.generatedImage,
    date: getTodayStr(),
    timestamp: Date.now()
  };

  localStorage.setItem(vaultKey, JSON.stringify(existing));
  showToast('success', `🗃️ "${title.slice(0, 20)}..." 기사가 키워드 보관함에 저장되었습니다.`);
  
  // 팝업 데이터 갱신
  renderKeywordVault();
}

function renderArchive() {
  // 이전 보관함 페이지 로직은 더 이상 사용하지 않음 (통합됨)
}


// [NEW] 히스토리 타임라인 분석 엔진
async function runHistoryAnalysis() {
  if (!state.selectedArticlesData || state.selectedArticlesData.length === 0) {
    alert('데이터정리에서 분석할 기사를 먼저 선택해 주세요!');
    return;
  }

  const btn = document.getElementById('history-btn');
  btn.innerHTML = '<span>🔍 심층 맥락 분석 중...</span>';
  btn.disabled = true;

  const sourcesText = state.selectedArticlesData.map((a, i) =>
    `[기사 ${i + 1}] 날짜: ${a.date}, 제목: ${a.title}, 본문: ${a.fullContent || a.summary}`
  ).join('\n\n');

  // 💡 프롬프트를 훨씬 더 구체적이고 전문적으로 강화했습니다.
  const prompt = `너는 현대사와 시사 트렌드를 분석하는 전문 아카이브 에디터다. 
    제공된 뉴스 데이터들을 바탕으로 사건의 뿌리를 찾는 '딥 히스토리(Deep History)' 연표를 구성하라.

    [제공된 실시간 뉴스 데이터]
    ${sourcesText}

    [분석 가이드라인]
    1. 단편적인 정보 요약을 금지한다. 각 사건의 전후 맥락을 소설처럼 입체적으로 구성하라.
    2. 각 타임라인 항목은 다음 3요소를 포함해야 한다:
       - 핵심 사건명 (Short & Impactful)
       - 상세 전개 (구체적인 수치, 인물, 결정적인 순간을 3문장 이상 서술)
       - 연결 고리 (이 사건이 현재의 뉴스 상황에 어떤 직접적인 영향을 주었는지 인과관계 분석)
    3. 스포츠의 경우 단순 스코어가 아니라 선수/팀의 서사(부상, 트레이드, 전술 변화 등)에 집중하라.

    [응답 형식]
    {"timeline": [
        {
            "date": "YYYY.MM.DD", 
            "event": "사건명", 
            "details": "상세 전개 과정", 
            "link": "현재 사건과의 인과관계"
        }
    ]}`;

  try {
    const response = await callGemini(prompt, 'gemini-2.0-flash');
    const data = parseJson(response);

    if (data && data.timeline) {
      renderHistoryTimeline(data.timeline);
    } else {
      throw new Error('데이터 추출 실패');
    }
  } catch (err) {
    console.error('분석 오류:', err);
    alert('심층 분석에 실패했습니다. (API 통신 및 형식 오류)');
  } finally {
    btn.innerHTML = '<span>⌛ 과거 맥락 분석 시작</span>';
    btn.disabled = false;
  }
}

// 💡 상세 정보를 모두 보여주도록 렌더링 함수도 수정합니다.
function renderHistoryTimeline(events) {
  const container = document.getElementById('history-timeline-container');
  const statusPanel = document.getElementById('history-status-panel');
  if (statusPanel) statusPanel.style.display = 'none';
  if (!container) return;
  container.innerHTML = '';

  events.sort((a, b) => new Date(a.date.replace(/\./g, '-')) - new Date(b.date.replace(/\./g, '-')));

  events.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'timeline-item';
    el.innerHTML = `
            <div class="timeline-dot"></div>
            <div class="timeline-content">
                <div class="timeline-date">${item.date}</div>
                <div class="timeline-title">${item.event}</div>
                <div class="timeline-details">${item.details}</div>
                <div class="timeline-link-box" style="margin-top:8px; padding:8px 12px; background:rgba(0,168,120,0.15); border-radius:6px; font-size:11.5px; color:#ffffff; border-left:2px solid var(--teal); line-height:1.6;">
                    <strong style="color:var(--teal);">🔗 현재와의 연결고리:</strong> <span style="color:#ffffff;">${item.link}</span>
                </div>
            </div>`;
    container.appendChild(el);
  });
}

// [신규] 6개월치 연대기(크로니클) 데이터를 수집하는 함수
async function startChronicleResearch() {
  const btn = document.querySelector('#chronicle-start-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⌛ 과거 연대기 추적 중...</span>';
  }

  // 키워드 확인 (리서치 단계의 키워드 사용)
  if (!state.topic) {
    state.topic = document.getElementById('topic-input').value.trim();
  }

  document.getElementById('chronicle-progress-panel').style.display = 'block';
  document.getElementById('chronicle-collected-results-panel').style.display = 'none';
  const logBox = document.getElementById('chronicle-log-box');
  logBox.innerHTML = '';

  const addCL = (type, msg) => {
    const d = document.createElement('div');
    d.className = 'log-line';
    const clsMap = { ok: 'log-ok', warn: 'log-warn', err: 'log-err', info: 'log-info' };
    d.innerHTML = `<span class="${clsMap[type] || 'log-info'}">·</span> <span class="log-msg">${msg}</span>`;
    logBox.appendChild(d);
    logBox.scrollTop = logBox.scrollHeight;
  };

  const setCP = (pct, text) => {
    document.getElementById('chronicle-progress-pct').textContent = pct + '%';
    document.getElementById('chronicle-progress-bar').style.width = pct + '%';
    document.getElementById('chronicle-progress-text').textContent = text;
  };

  addCL('info', `📡 [크로니클] 스마트 연대기 추적 시작: ${state.topic}`);
  updateApiStatus('working');
  setCP(10, 'AI가 타겟 기사 맥락 분석 중...');

  try {
    // 💡 [개선] 기사 한 개가 아닌 '선택한 모든 기사'들을 종합하여 맥락 추출 (최대 1500자)
    let combinedContent = "";
    if (state.selectedArticlesData && state.selectedArticlesData.length > 0) {
      combinedContent = state.selectedArticlesData.map((a, i) => `[기사 ${i+1}] ${a.title}: ${a.summary}`).join('\n');
      addCL('info', `🎯 선택된 기사 ${state.selectedArticlesData.length}건을 종합 분석 중...`);
    }

    if (!combinedContent) {
      addCL('warn', '참조할 선택 기사가 없습니다. 검색 키워드로만 추적합니다.');
      // 기존 방식 호환
      state.chronicleArticles = await NewsService.fetchSmartChronicle({ 
        title: state.topic, 
        summary: state.topic, 
        fullContent: state.topic 
      });
    } else {
      // 종합된 컨텍스트를 넘겨서 뉴스 검색 (제목은 첫 기사 제목 활용)
      const mockArticle = {
        title: state.selectedArticlesData[0].title,
        summary: combinedContent.substring(0, 1500),
        fullContent: combinedContent.substring(0, 3000)
      };
      state.chronicleArticles = await NewsService.fetchSmartChronicle(mockArticle);
    }

    setCP(80, '데이터 수집 및 동기화 완료...');

    if (state.chronicleArticles && state.chronicleArticles.length > 0) {
      renderChronicleArticles(state.chronicleArticles); // 화면에 리스트 출력
      showToast('success', `⏳ 과거 연대기 ${state.chronicleArticles.length}건 수집 완료!`);
      addCL('ok', `과거 데이터 ${state.chronicleArticles.length}건 확보 성공.`);
      setCP(100, '수집 완료. 사용할 기사를 추가 선택해 주세요.');
    } else {
      showToast('info', '과거 데이터를 찾지 못했습니다. 최신 뉴스만으로 분석이 가능합니다.');
      addCL('warn', '검색 결과가 없습니다. (수동 이동 가능)');
      setCP(100, '수집 완료(결과 없음)');
    }
  } catch (err) {
    addCL('err', `크로니클 오류: ${err.message}`);
    showToast('error', `❌ 크로니클 오류: ${err.message}`);
    setCP(0, '오류 발생');
  } finally {
    updateApiStatus('connected');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>🔄 다시 재추적 시도</span>';
    }
  }
}

// [데이터 통합] 최신 뉴스 + 과거 뉴스를 합쳐서 '정리' 페이지(page 2)에 출력
function renderIntegratedList() {
  const grid = document.getElementById('selected-articles-detail');
  if (!grid) return;
  grid.innerHTML = '';

  // 날짜 순으로 정렬하여 렌더링 (과거 기사가 상단)
  const articles = [...(state.selectedArticlesData || [])].sort((a, b) => {
    const da = new Date(a.date || '1970-01-01');
    const db = new Date(b.date || '1970-01-01');
    return da - db;
  });

  if (articles.length === 0) {
    grid.innerHTML = '<p style="text-align:center; color:var(--text3); padding:40px;">선택된 데이터가 없습니다.</p>';
    if (document.getElementById('data-article-count')) document.getElementById('data-article-count').textContent = '0';
    return;
  }

  // 요약 정보 업데이트
  if (document.getElementById('data-article-count')) document.getElementById('data-article-count').textContent = articles.length;
  if (document.getElementById('data-total-chars')) {
    const totalChars = articles.reduce((acc, c) => acc + (c.summary || c.fullContent || '').length, 0);
    document.getElementById('data-total-chars').textContent = totalChars.toLocaleString();
  }
  if (document.getElementById('data-sources-count')) {
    document.getElementById('data-sources-count').textContent = new Set(articles.map(a => a.source)).size;
  }

  articles.forEach((item, idx) => {
    const isChronicle = (item.id && String(item.id).startsWith('chronicle')) || item.sourceTag === '6개월전';
    const badgeClass = isChronicle ? 'badge-chronicle' : 'badge-latest';

    const card = document.createElement('div');
    card.className = 'article-card';
    card.style.marginBottom = '12px';

    card.innerHTML = `
      <div style="width:100%; text-align:left;">
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <span class="badge ${badgeClass}" style="padding:4px 10px; border-radius:var(--radius-sm); font-size:10px; font-weight:800; text-transform:uppercase;"></span>
          <div class="card-source" style="margin:0; font-size:10px; color:var(--text3);">${item.source} | ${item.date || ''}</div>
        </div>
        <div class="card-body">
          <h4 style="font-size:16px; font-weight:800; color:var(--text); margin-bottom:8px; line-height:1.4;">${item.title}</h4>
          <p style="font-size:13px; color:var(--text2); line-height:1.6; margin-bottom:12px;">${item.summary || ''}</p>
        </div>
        ${item.url ? `<a href="${item.url}" target="_blank" style="display:inline-flex; align-items:center; gap:6px; font-size:11px; color:var(--teal); text-decoration:none; font-weight:700; border:1px solid var(--border-teal); padding:5px 12px; border-radius:var(--radius-sm); background:var(--teal-dim);">🔗 원본 기사 보기</a>` : ''}
      </div>
    `;
    grid.appendChild(card);
  });
}

// --- 기사 보관함 (Archive) ---
// 데이터 마이그레이션 (이전 보관함 명칭 호환성 유지)
try {
  let oldArchive = JSON.parse(localStorage.getItem('finalArchive'));
  if (oldArchive && oldArchive.length > 0) {
      let newArchive = JSON.parse(localStorage.getItem('newsArchive')) || [];
      if (newArchive.length === 0) {
          localStorage.setItem('newsArchive', JSON.stringify(oldArchive));
      }
  }
} catch(e) {}

// 1. 기사 저장 함수
async function saveToArchive() { // 기존 index.html 연결을 위해 이름 유지
    try {
        const articleText = state.generatedArticle || document.getElementById('article-textarea').value;
        if (!articleText) { showToast('info', '저장할 완성된 기사가 없습니다.'); return; }
        
        const titleMatch = articleText.match(/^#\s+(.+)/m);
        const title = titleMatch ? titleMatch[1] : (state.topic || "제목 없음");
        const manualSource = document.getElementById('np-manual-source')?.value.trim() || '';

        // 저장할 데이터 조립
        const articleToSave = {
            id: Date.now(), // 고유 ID (시간값)
            title: title,
            article: articleText,
            summary: articleText.substring(0, 150),
            image: state.generatedImage || "", // 생성된 이미지 URL 또는 Base64
            date: new Date().toLocaleString('ko-KR'),
            keyword: state.topic || "",
            topic: state.topic,
            region: state.region,
            manualSource: manualSource
        };

        // 기존 보관함 데이터 가져오기 (없으면 빈 배열)
        let archive = JSON.parse(localStorage.getItem('newsArchive')) || [];

        // 중복 저장 방지 (이미 같은 제목이 있으면 저장 안 함 - 선택 사항)
        const isDuplicate = archive.some(item => item.title === articleToSave.title);
        if (isDuplicate) {
            showToast('warning', '이미 보관함에 있는 기사입니다.');
            return;
        }

        // 새 기사 추가 및 저장
        archive.unshift(articleToSave); // 최신글이 위로 오게 추가
        localStorage.setItem('newsArchive', JSON.stringify(archive));

        showToast('success', '📁 보관함에 안전하게 저장되었습니다!');
        
        // 보관함 목록 UI 새로고침
        renderArchive();

    } catch (err) {
        console.error('저장 실패:', err);
        showToast('error', '보관 중 오류가 발생했습니다.');
    }
}

// 2. 보관함 목록을 화면에 그리는 함수
function renderArchive() {
    const archiveList = document.getElementById('archive-list');
    if (!archiveList) return;

    // 검색어 필터 연동
    const q = (document.getElementById('archive-search-input')?.value || '').toLowerCase();
    const archive = JSON.parse(localStorage.getItem('newsArchive')) || [];
    
    const filtered = archive.filter(a => 
      (a.title && a.title.toLowerCase().includes(q)) || 
      (a.keyword && a.keyword.toLowerCase().includes(q)) ||
      (a.topic && a.topic.toLowerCase().includes(q)) ||
      (a.article && a.article.toLowerCase().includes(q))
    );

    if (filtered.length === 0) {
        archiveList.innerHTML = '<p class="empty-msg" style="text-align:center; padding:40px; color:var(--text3); font-size:13px;">보관된 기사가 없거나 검색 결과가 없습니다.</p>';
        return;
    }

    archiveList.innerHTML = filtered.map(item => `
        <div class="archive-item" onclick="loadSavedArticle('${item.id}')" style="background:var(--bg4); border:1px solid var(--border); border-radius:12px; padding:16px; display:flex; gap:16px; cursor:pointer; transition:0.2s;">
            ${item.image ? `<img src="${item.image}" alt="thumb" style="width:100px; height:100px; object-fit:cover; border-radius:8px; min-width:100px;">` : `<div style="width:100px; height:100px; background:var(--bg2); border-radius:8px; display:flex; align-items:center; justify-content:center; color:var(--text3); min-width:100px; font-size:11px;">이미지 없음</div>`}
            <div class="archive-info" style="flex:1; display:flex; flex-direction:column;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <h4 style="font-size:16px; font-weight:700; color:var(--text); margin-bottom:4px; margin-top:0;">${item.title.replace(/[\*\_]/g,'')}</h4>
                    <button onclick="deleteArticle(event, '${item.id}')" class="delete-btn" style="background:none; border:none; color:var(--red); cursor:pointer; font-size:24px; font-weight:bold; line-height:1;" title="삭제">×</button>
                </div>
                <span style="font-size:11px; color:var(--text3); margin-bottom:8px;">${item.dateStr || item.date || ''} | ${item.keyword || item.topic || '주제 없음'}</span>
                <div style="font-size:12px; color:var(--text2); line-height:1.5; flex:1; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${(item.article || item.summary || '').replace(/[#*`~]/g, '')}</div>
                <div style="margin-top:10px; display:flex; gap:8px;">
                  <button style="padding:6px 14px; background:linear-gradient(135deg,rgba(46,213,115,0.2),rgba(0,168,120,0.2)); border:1px solid var(--green); border-radius:6px; color:var(--text); font-size:11px; font-weight:700; cursor:pointer;" onclick="loadSavedArticle('${item.id}'); event.stopPropagation();">이 기사 불러오기</button>
                </div>
            </div>
        </div>
    `).join('');
}

// 3. 삭제 기능
function deleteArticle(event, id) {
    if (event) event.stopPropagation(); // 부모 클릭 이벤트 방지
    let archive = JSON.parse(localStorage.getItem('newsArchive')) || [];
    archive = archive.filter(item => String(item.id) !== String(id));
    localStorage.setItem('newsArchive', JSON.stringify(archive));
    renderArchive();
    showToast('info', '🗑️ 삭제되었습니다.');
}

// 4. 불러오기 기능 (기존 loadFromArchive 통합)
function loadSavedArticle(id) {
    const archive = JSON.parse(localStorage.getItem('newsArchive')) || [];
    const item = archive.find(a => String(a.id) === String(id));
    if (!item) return;

    state.generatedArticle = item.article || item.summary;
    document.getElementById('article-textarea').value = state.generatedArticle || "";
    state.generatedImage = item.image || null;
    state.topic = item.topic || item.keyword;
    state.aspectRatio = item.aspectRatio || '16:9';
    state.region = item.region || 'KR';
    
    const mSourceEl = document.getElementById('np-manual-source');
    if (mSourceEl) {
        mSourceEl.value = item.manualSource || '';
    }

    if (typeof updateWordCount === 'function') updateWordCount();
    goPage(5);
    setTimeout(() => updatePreview(), 100);
    showToast('success', '📂 보관함에서 기사를 불러왔습니다.');
}
/**
 * ATLAS News Service Manager
 * 1. 최신 뉴스 5개 (중복 제거)
 * 2. 6개월 미만 크로니클 수집 및 연결
 */

const CONFIG = {
    get API_KEY() { return localStorage.getItem('jina_api_key') || ''; }
};

const NewsService = {
    // [설정] 공신력 있는 언론사 도메인 (사용자 지정 목록 반영)
    trustedSites: [
        'yna.co.kr', 'kbs.co.kr', 'mbc.co.kr', 'sbs.co.kr', 'ytn.co.kr',
        'chosun.com', 'joongang.co.kr', 'joins.com', 'donga.com', 'hani.co.kr',
        'khan.co.kr', 'mk.co.kr', 'hankyung.com', 'news1.kr', 'newsis.com',
        'mbn.co.kr', 'jtbc.co.kr', 'tvchosun.com', 'ichannela.com',
        'seoul.co.kr', 'segye.com', 'kmib.co.kr', 'mt.co.kr', 'edaily.co.kr',
        'asiae.co.kr', 'heraldcorp.com', 'etnews.com',
        'nocutnews.co.kr', 'munhwa.com', 'kmib.co.kr', 'daum.net'
    ],

    // [설정] 절대 금지 도메인 (SNS, 블로그, 위키 등)
    excludeSites: [
        'youtube.com', 'facebook.com', 'twitter.com', 'instagram.com',
        'blog.naver.com', 'post.naver.com', 'm.post.naver.com', 'pay.naver.com',
        'finance.naver.com', 'stock.naver.com', 'cafe.naver.com', 'kin.naver.com',
        'tistory.com', 'brunch.co.kr', 'namu.wiki', 'wikipedia.org',
        'dcinside.com', 'ruliweb.com', 'theqoo.net', 'post.daum.net',
        'news.kakaocdn.net', 'v.daum.net/v/social', 'v.daum.net/v/stock'
    ],

    // 1. 최신 뉴스 5개 수집 (Jina AI Search API 활용)
    async fetchLatest(topic, siteFilter) {
        const apiKey = CONFIG.API_KEY.trim();
        if (!apiKey) {
            throw new Error('Jina API Key가 없습니다. API 설정에서 키를 입력해주세요.');
        }

        // 1. 공신력 있는 언론사 화이트리스트 쿼리 생성
        let siteQuery = "";
        if (siteFilter) {
            siteQuery = ` (${siteFilter})`;
        } else {
            siteQuery = ` (${this.trustedSites.map(s => `site:${s}`).join(' OR ')})`;
        }

        // 2. 금지 사이트 블랙리스트 쿼리 (쿼리 길이 임계치 방지를 위해 최소화)
        // 핵심 블랙리스트만 쿼리에 포함하고 나머지는 JS 레벨에서 처리
        const coreExclude = ['youtube.com', 'blog.naver.com', 'namu.wiki', 'wikipedia.org'];
        const excludeQuery = ` ${coreExclude.map(s => `-site:${s}`).join(' ')}`;

        // 3. 최신 뉴스 (사용일 기준 최대 3일 이내) 조건
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const query = `${topic} after:${threeDaysAgo}${siteQuery}${excludeQuery}`;

        // Jina Search API
        const url = `https://s.jina.ai/${encodeURIComponent(query)}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json',
                'X-With-Generated-Alt': 'true' // 더 풍부한 데이터 요청
            }
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData?.message || `Jina API 오류 (HTTP ${response.status})`);
        }

        const data = await response.json();
        if (!data.data || data.data.length === 0) return [];

        // [강력 필터] JS 레벨에서 한 번 더 검증 (도메인 + 키워드 매칭)
        const validNews = data.data.filter(item => {
            try {
                const urlObj = new URL(item.url);
                const hostname = urlObj.hostname;
                const isTrusted = this.trustedSites.some(site => hostname.includes(site));
                const isExcluded = this.excludeSites.some(site => hostname.includes(site));

                // 주제 관련성 체크
                const keywords = topic.toLowerCase().split(' ').filter(k => k.length >= 1);
                const titleLower = item.title.toLowerCase();
                const descLower = (item.description || "").toLowerCase();
                const contentLower = (item.content || "").toLowerCase();
                const isRelated = keywords.some(k => titleLower.includes(k) || descLower.includes(k) || contentLower.includes(k));

                // [차단] 비뉴스 섹션 패턴 매칭
                const urlLower = item.url.toLowerCase();
                const nonNewsPatterns = ['blog', 'post', 'finance', 'stock', 'cafe', 'kin', 'view', 'community'];
                const isNonNewsPattern = nonNewsPatterns.some(p => urlLower.includes(p));

                return isTrusted && !isExcluded && !isNonNewsPattern && isRelated;
            } catch (e) { return false; }
        });

        // [중복 제거] URL 기준 유니크한 기사만 필터링
        const uniqueNews = Array.from(new Map(validNews.map(item => [item.url, item])).values());

        if (uniqueNews.length === 0) {
            console.warn('[Filter Warning] 모든 검색 결과가 차단되었거나 없습니다.');
        }

        // ATLAS 포맷으로 변환 (사용자 요청: 최대 3개)
        return uniqueNews.slice(0, 3).map((item, idx) => {
            return {
                id: 'latest_' + idx,
                title: item.title,
                url: item.url,
                source: new URL(item.url).hostname,
                summary: item.description || (item.content ? item.content.substring(0, 200) + '...' : ''),
                fullContent: item.content || '',
                date: this._extractDate(item),
                relevance: 10
            };
        });
    },

    // 기사 날짜 추출 헬퍼 (사용자 요청: 실제 기사 날짜와 일치하도록 정교화)
    _extractDate(item) {
        // 1. API 제공 메타데이터 확인
        if (item.publishedDate) return item.publishedDate.split('T')[0];
        
        const content = (item.title || "") + " " + (item.description || "") + " " + (item.content || "").substring(0, 500);
        
        // 2. YYYY.MM.DD 또는 YYYY-MM-DD 패턴 (기사 본문 내 날짜 탐색)
        const dateMatch = content.match(/(202[0-9])[\.\-\/](0[1-9]|1[0-2]|[1-9])[\.\-\/](0[1-9]|[12][0-9]|3[01]|[1-9])/);
        if (dateMatch) {
            const y = dateMatch[1];
            const m = String(dateMatch[2]).padStart(2, '0');
            const d = String(dateMatch[3]).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }

        // 3. URL에서 날짜 패턴 추출 (뉴스 사이트 관행: /20260116/ 등)
        const urlDateMatch = item.url.match(/\/(202[0-9])\/?(0[1-9]|1[0-2])\/?(0[1-9]|[12][0-9]|3[01])\//);
        if (urlDateMatch) return `${urlDateMatch[1]}-${urlDateMatch[2]}-${urlDateMatch[3]}`;

        return new Date().toISOString().split('T')[0];
    },

    // [추가] AI에게 기사 분석을 통해 키워드 3개 추출 요청
    async getAIKeywords(content) {
        try {
            const response = await fetch('/api/generate-queries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ articleContent: content })
            });
            if (!response.ok) return [];
            const data = await response.json();
            return data.queries || []; // ["과거 부상", "이전 경기", "특정 사건"]
        } catch (e) {
            console.error("AI 키워드 추출 실패:", e);
            return [];
        }
    },

    // 2. 스마트 크로니클 수집 (키워드 3종 기반 6개월 전 추적)
    async fetchSmartChronicle(selectedArticle) {
        const apiKey = CONFIG.API_KEY.trim();
        if (!apiKey) throw new Error('Jina API Key가 없습니다.');

        // 1단계: AI가 기사 내용(앞부분 1200자)으로 키워드 3개 추출
        const contentForAi = (selectedArticle.fullContent || selectedArticle.summary || "").substring(0, 1200);
        const keywords = await this.getAIKeywords(contentForAi);
        console.log("✅ [스마트 크로니클] 추출된 키워드:", keywords);

        // 키워드가 없으면 기존 토픽으로 대체
        const searchTopics = keywords.length > 0 ? keywords : [selectedArticle.title.substring(0, 30)];

        // 2단계: 추출된 3개 키워드로 각각 과거 6개월 뉴스 검색
        const searchPromises = searchTopics.map(keyword => this._fetchChronicleSingle(keyword, apiKey));
        const allResults = await Promise.all(searchPromises);

        // 3단계: 결과 통합 및 중복 제거
        const mergedResults = [].concat(...allResults);
        const uniqueResults = Array.from(new Map(mergedResults.map(item => [item.url, item])).values());
        
        return uniqueResults.sort((a,b) => new Date(b.date) - new Date(a.date));
    },

    // 개별 키워드에 대한 6개월 검색 내부함수
    async _fetchChronicleSingle(keyword, apiKey) {
        const siteQuery = ` (${this.trustedSites.map(s => `site:${s}`).join(' OR ')})`;
        const coreExclude = ['youtube.com', 'blog.naver.com', 'namu.wiki'];
        const excludeQuery = ` ${coreExclude.map(s => `-site:${s}`).join(' ')}`;

        const now = new Date();
        const sixMonthsAgo = new Date(now); sixMonthsAgo.setMonth(now.getMonth() - 6);
        const twoWeeksAgo = new Date(now); twoWeeksAgo.setDate(now.getDate() - 14);

        const beforeDate = twoWeeksAgo.toISOString().split('T')[0];
        const afterDate = sixMonthsAgo.toISOString().split('T')[0];

        const query = `${keyword} after:${afterDate} before:${beforeDate}${siteQuery}${excludeQuery}`;
        const url = `https://s.jina.ai/${encodeURIComponent(query)}`;

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) return [];
            const data = await response.json();
            if (!data.data) return [];

            return data.data.filter(item => {
                try {
                    const hostname = new URL(item.url).hostname;
                    return this.trustedSites.some(site => hostname.includes(site)) && 
                           !this.excludeSites.some(site => hostname.includes(site));
                } catch (e) { return false; }
            }).slice(0, 3).map((item, idx) => ({
                id: 'chronicle_' + Math.random().toString(36).substr(2, 5),
                title: item.title,
                url: item.url,
                source: new URL(item.url).hostname,
                summary: item.description || (item.content ? item.content.substring(0, 200) + '...' : ''),
                fullContent: item.content || '',
                date: this._extractDate(item),
                relevance: 9
            }));
        } catch (e) {
            console.error(`[Search Error] ${keyword}:`, e);
            return [];
        }
    },

    // 3. [핵심] 최신 뉴스와 크로니클의 "인과관계 연결" (Gemini 활용)
    async linkContexts(latest, chronicle) {
        const latestText = latest.map(n => `[현재] ${n.title}`).join('\n');
        const chronicleText = chronicle.map(n => `[과거6개월] ${n.title}`).join('\n');

        const prompt = `
            너는 뉴스 분석 전문가다. 아래 '현재' 기사 5개와 '과거6개월' 기사들을 읽고,
            이들이 어떻게 하나의 서사로 연결되는지 '연결 고리'를 분석하라.
            1. 과거의 어떤 사건이 현재의 이슈를 촉발했는가?
            2. 현재 기사를 작성할 때 반드시 포함해야 할 과거의 핵심 데이터는 무엇인가?
            반드시 한국어로, 기사 작성을 위한 '브릿지 문장' 형태로 답변하라.
        `;

        // 이 결과값이 나중에 '기사 작성' 단계의 핵심 소스가 됩니다.
        return await callGemini(prompt + `\n\n현재:\n${latestText}\n\n과거:\n${chronicleText}`, 'gemini-2.0-flash');
    }
};
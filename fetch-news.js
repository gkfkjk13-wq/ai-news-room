// newsService.js
export async function getNewsData(targetUrl) {
    // ❌ 기존 방식 (삭제): 직접 jina.ai로 요청 (키 노출 위험)
    // const response = await fetch(`https://r.jina.ai/${targetUrl}`, ...);

    // ✅ 변경 방식 (권장): 우리가 만든 서버 API로 요청 (키 숨김)
    // 인코딩을 해줘야 URL 안의 특수문자가 깨지지 않습니다.
    const response = await fetch(`/api/fetch-news?url=${encodeURIComponent(targetUrl)}`);

    if (!response.ok) throw new Error("뉴스 데이터를 가져오는데 실패했습니다.");

    return await response.text();
}
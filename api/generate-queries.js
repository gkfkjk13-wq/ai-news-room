// api/generate-queries.js
export default async function handler(req, res) {
    const { articleContent } = req.body;
    // Vercel에 등록하신 Gemini API 키 이름을 확인해 주세요. (예: GEMINI_API_KEY)
    const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.VITE_API_KEY;

    if (!articleContent) return res.status(400).json({ error: "내용이 없습니다." });

    try {
        // 🤖 Gemini API 호출 (직접 fetch 방식)
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `다음 기사 내용을 분석해서, 이 사건의 배경이 되는 과거 사건을 구글에서 검색하기 위한 핵심 키워드 3개를 뽑아줘. 
            검색어는 구글 검색에 최적화된 짧은 단어 조합이어야 해. 
            응답은 반드시 ["키워드1", "키워드2", "키워드3"] 형식의 JSON 배열로만 해줘.
            
            기사 내용: ${articleContent.substring(0, 1500)}`
                    }]
                }]
            })
        });

        const data = await response.json();
        const aiText = data.candidates[0].content.parts[0].text;

        // JSON 형식만 추출해서 파싱
        const queries = JSON.parse(aiText.match(/\[.*\]/s)[0]);
        res.status(200).json({ queries });
    } catch (error) {
        console.error("AI 분석 에러:", error);
        res.status(500).json({ error: "키워드 추출 실패" });
    }
}
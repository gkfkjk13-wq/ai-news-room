
async function checkAvailableModels() {
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
        console.error("API Key not found in localStorage");
        return;
    }

    console.log("--- 이미지 생성 가능 모델 리서치 시작 ---");
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();
        
        if (data.models) {
            const imageModels = data.models.filter(m => 
                m.name.includes('imagen') || 
                m.supportedGenerationMethods.includes('generateImages') ||
                m.supportedGenerationMethods.includes('predict')
            );
            
            console.log("💡 현재 API 키로 사용 가능한 전체 모델 수:", data.models.length);
            console.table(imageModels.map(m => ({
                Name: m.name,
                Methods: m.supportedGenerationMethods.join(', '),
                Description: m.description
            })));
            
            if (imageModels.length === 0) {
                console.warn("⚠ 주의: 이미지 생성이 명시된 모델을 찾을 수 없습니다.");
            }
        } else {
            console.error("모델 목록을 불러오지 못했습니다:", data);
        }
    } catch (error) {
        console.error("API 호출 중 오류 발생:", error);
    }
    console.log("--- 리서치 종료 ---");
}

checkAvailableModels();

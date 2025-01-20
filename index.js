document.addEventListener('submit', (e) => {
    e.preventDefault()
    progressConversation()
})

const convHistory = []

async function progressConversation() {
    const userInput = document.getElementById('user-input')
    const chatbotConversation = document.getElementById('chatbot-conversation-container')
    const question = userInput.value
    userInput.value = ''

    // add human message
    const newHumanSpeechBubble = document.createElement('div')
    newHumanSpeechBubble.classList.add('speech', 'speech-human')
    chatbotConversation.appendChild(newHumanSpeechBubble)
    newHumanSpeechBubble.textContent = question
    chatbotConversation.scrollTop = chatbotConversation.scrollHeight

    try {
        const response = await fetch('https://personal-assistant-worker.noamguterman.workers.dev/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                question: question,
                convHistory: convHistory
            })
        });

        if (!response.ok) {
            throw new Error('Failed to get response');
        }

        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }

        const aiResponse = data.response;
        convHistory.push(question);
        convHistory.push(aiResponse);

        // add AI message
        const newAiSpeechBubble = document.createElement('div')
        newAiSpeechBubble.classList.add('speech', 'speech-ai')
        chatbotConversation.appendChild(newAiSpeechBubble)
        newAiSpeechBubble.textContent = aiResponse
        chatbotConversation.scrollTop = chatbotConversation.scrollHeight

    } catch (error) {
        // add error message
        const errorBubble = document.createElement('div')
        errorBubble.classList.add('speech', 'speech-ai', 'error')
        errorBubble.textContent = 'Sorry, I encountered an error. Please try again.'
        chatbotConversation.appendChild(errorBubble)
        chatbotConversation.scrollTop = chatbotConversation.scrollHeight
        console.error('Error:', error)
    }
}
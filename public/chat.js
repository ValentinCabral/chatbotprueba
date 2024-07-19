const chatDiv = document.getElementById('chat');
const userInput = document.getElementById('user-input');
const fileUpload = document.getElementById('file-upload');
const filePreview = document.getElementById('file-preview');
const sendButton = document.getElementById('send-button');

let selectedFiles = [];

fileUpload.addEventListener('change', (event) => {
    const files = event.target.files;
    selectedFiles = Array.from(files);
    updateFilePreview();
});

function updateFilePreview() {
    filePreview.innerHTML = '';
    selectedFiles.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        
        if (file.type.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            img.onload = () => URL.revokeObjectURL(img.src);
            fileItem.appendChild(img);
        }
        
        const fileName = document.createElement('span');
        fileName.textContent = file.name;
        fileItem.appendChild(fileName);
        
        const removeButton = document.createElement('button');
        removeButton.textContent = '×';
        removeButton.onclick = () => removeFile(index);
        fileItem.appendChild(removeButton);
        
        filePreview.appendChild(fileItem);
    });
}

function removeFile(index) {
    selectedFiles.splice(index, 1);
    updateFilePreview();
}

async function sendMessage() {
    const message = userInput.value.trim();
    if (!message && selectedFiles.length === 0) return;

    const formData = new FormData();
    formData.append('message', message);
    selectedFiles.forEach(file => {
        formData.append('files', file);
    });

    let displayMessage = message;
    let filePreviewHTML = '';
    if (selectedFiles.length > 0) {
        const fileNames = selectedFiles.map(f => f.name).join(', ');
        displayMessage += ` (Archivos adjuntos: ${fileNames})`;
        filePreviewHTML = '<div class="message-files">';
        selectedFiles.forEach(file => {
            if (file.type.startsWith('image/')) {
                filePreviewHTML += `<img src="${URL.createObjectURL(file)}" class="message-file" alt="${file.name}">`;
            } else {
                filePreviewHTML += `<span class="message-file">${file.name}</span>`;
            }
        });
        filePreviewHTML += '</div>';
    }
    addMessage(displayMessage, 'user', filePreviewHTML);

    userInput.value = '';
    selectedFiles = [];
    updateFilePreview();

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        addMessage(data.message, 'bot');
    } catch (error) {
        console.error('Error:', error);
        addMessage('Lo siento, hubo un error al procesar tu solicitud.', 'bot');
    }
}

userInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
});

sendButton.addEventListener('click', sendMessage);

function addMessage(message, sender, filePreviewHTML = '') {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', sender);
    if (sender === 'bot') {
        msgDiv.innerHTML = marked.parse(message);
        msgDiv.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });
    } else {
        msgDiv.textContent = message;
        if (filePreviewHTML) {
            msgDiv.innerHTML += filePreviewHTML;
        }
    }
    chatDiv.appendChild(msgDiv);
    chatDiv.scrollTop = chatDiv.scrollHeight;
}

// Ajustar automáticamente la altura del textarea
userInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});
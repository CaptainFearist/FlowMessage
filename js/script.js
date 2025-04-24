let currentUserId;
let currentChatId;
let socket;
let isAnimating = false;

function resetFilePreview() {
    console.log('resetFilePreview: isAnimating:', isAnimating);
    if (isAnimating) return;

    isAnimating = true;
    const preview = document.getElementById('file-preview-space');
    preview.style.animation = 'gentleDisappear 0.5s forwards';

    setTimeout(() => {
        const fileInput = document.getElementById('file-input');
        if (fileInput) fileInput.value = '';
        preview.style.display = 'none';
        preview.style.opacity = '';
        preview.style.animation = '';
        document.querySelector('footer').style.minHeight = '100px';
        isAnimating = false;
        console.log('resetFilePreview setTimeout: isAnimating:', isAnimating);
    }, 500);
}

document.addEventListener('DOMContentLoaded', () => {
    socket = io('http://localhost:3000');

    const urlParams = new URLSearchParams(window.location.search);
    currentUserId = urlParams.get('userId');
    const searchInput = document.getElementById('search-users');
    const sendButton = document.querySelector('.send--button');
    const messageInput = document.querySelector('footer input[type="text"]');
    const messageListContainer = document.querySelector('.message-list');
    const chatTitleElement = document.getElementById('chat-title');

    document.getElementById('attach-button').addEventListener('click', () => {
        document.getElementById('file-input').click();
    });
    
    document.getElementById('file-input').addEventListener('change', (e) => {
        const preview = document.getElementById('file-preview-space');
        const fileNameElement = document.getElementById('file-name');

        if (!e.target.files.length) {
            preview.style.display = 'none';
            document.querySelector('footer').style.minHeight = '100px';
            return;
        }

        const file = e.target.files[0];

        preview.style.display = 'block';
        preview.style.opacity = '0';
        preview.style.animation = 'none';
        void preview.offsetWidth;
        preview.style.animation = 'gentleAppear 0.5s forwards';
        preview.style.opacity = '1'; 

        document.querySelector('footer').style.minHeight = '150px';
        fileNameElement.textContent = file.name;

        console.log('change: isAnimating:', isAnimating);
    });

    document.getElementById('remove-file').addEventListener('click', (e) => {
        e.preventDefault();
        console.log('remove-file: isAnimating:', isAnimating);
        if (isAnimating) return;

        isAnimating = true;
        const preview = document.getElementById('file-preview-space');
        preview.style.animation = 'gentleDisappear 0.5s forwards';

        setTimeout(() => {
            document.getElementById('file-input').value = '';
            preview.style.display = 'none';
            preview.style.opacity = '';
            preview.style.animation = '';
            document.querySelector('footer').style.minHeight = '100px';
            isAnimating = false;
            console.log('remove-file setTimeout: isAnimating:', isAnimating);
        }, 500);
    });

    if (currentUserId) {
        console.log(`ID пользователя, переданный из WPF: ${currentUserId}`);
        socket.emit('userConnected', parseInt(currentUserId));
        loadCurrentUser();
    } else {
        console.log('ID пользователя не передан из WPF.');
    }

    loadUsers()
        .then(() => {
            if (searchInput) {
                searchInput.addEventListener('input', (event) => {
                    const searchText = event.target.value.toLowerCase();
                    const userListItems = document.querySelectorAll('.user-list li');

                    userListItems.forEach(item => {
                        const userNameElement = item.querySelector('.user-name');
                        if (userNameElement) {
                            const userName = userNameElement.textContent.toLowerCase();
                            item.style.display = userName.includes(searchText) ? '' : 'none';
                        }
                    });
                });
            } else {
                console.error('Не удалось найти поле поиска с ID "search-users".');
            }
        })
        .catch(error => {
            console.error('Ошибка при загрузке пользователей:', error);
        });

        if (sendButton) {
            sendButton.addEventListener('click', () => {
                const messageText = messageInput.value.trim();
                const fileInput = document.getElementById('file-input');
                
                if ((messageText || (fileInput && fileInput.files.length > 0)) && currentChatId) {
                    sendMessage(currentChatId, messageText);
                    messageInput.value = '';
                    
                    if (fileInput.files.length > 0) {
                        resetFilePreview();
                    }
                } else if (!currentChatId) {
                    console.error('Не выбран чат для отправки сообщения.');
                }
            });
        }

    if (messageInput) {
        messageInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendButton.click();
            }
        });
    } else {
        console.error('Не найдено поле ввода сообщения в футере.');
    }

    socket.on('onlineUsers', updateOnlineStatuses);
    socket.on('newMessage', message => {
        if (currentChatId && parseInt(message.ChatId) === currentChatId) {
            if (parseInt(message.SenderId) !== parseInt(currentUserId)) {
                displayNewMessage(message, parseInt(currentUserId));
            } else {
                console.log('Получено собственное сообщение через WebSocket, игнорируем.');
            }
        } else if (parseInt(message.SenderId) !== parseInt(currentUserId)) {
            console.log('Новое сообщение в другом чате:', message);
        }
    });

    setInterval(() => {
        if (currentUserId) {
            socket.emit('userConnected', parseInt(currentUserId));
        }
    }, 30000);
});

async function loadCurrentUser() {
    if (currentUserId) {
        try {
            const response = await fetch(`http://localhost:3000/api/users/${currentUserId}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const currentUser = await response.json();
            displayCurrentUser(currentUser);
        } catch (error) {
            console.error('Ошибка при загрузке данных текущего пользователя:', error);
        }
    }
}

function displayCurrentUser(user) {
    const currentUserAvatarContainer = document.querySelector('.current-user-avatar');
    const currentUserNameSpan = document.querySelector('.current-user-name');

    if (currentUserAvatarContainer && currentUserNameSpan) {
        currentUserAvatarContainer.innerHTML = '';

        if (user.ImagePath && user.ImagePath.length > 0) {
            const byteArray = new Uint8Array(user.ImagePath);
            const mimeType = getImageMimeType(byteArray);
            const blob = new Blob([byteArray], { type: mimeType });
            const reader = new FileReader();
            reader.onloadend = function () {
                const img = document.createElement("img");
                img.src = reader.result;
                img.alt = `${user.FirstName} ${user.LastName}`;
                currentUserAvatarContainer.appendChild(img);
            };
            reader.readAsDataURL(blob);
        } else {
            currentUserAvatarContainer.textContent = user.FirstName.charAt(0).toUpperCase() + user.LastName.charAt(0).toUpperCase();
            currentUserAvatarContainer.classList.add("default-avatar");
        }
        currentUserNameSpan.textContent = `${user.FirstName} ${user.LastName}`;
    }
}

async function loadUsers() {
    try {
        const response = await fetch('http://localhost:3000/api/users');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const users = await response.json();
        displayUsers(users);
        return Promise.resolve();
    } catch (error) {
        console.log('Ошибка при загрузке пользователей:', error);
        return Promise.reject(error);
    }
}

function displayUsers(users) {
    const userList = document.querySelector('.user-list');
    userList.innerHTML = '';

    const numericCurrentUserId = parseInt(currentUserId, 10);
    const otherUsers = users.filter(user => user.UserID !== numericCurrentUserId);

    otherUsers.forEach(user => {
        const listItem = renderUserItem(user);
        listItem.addEventListener('click', () => {
            loadChatForUser(user.UserID, `${user.FirstName} ${user.LastName}`);
        });
        userList.appendChild(listItem);
    });
}

function getImageMimeType(bytes) {
    if (!bytes || bytes.length < 4) return null;
    const hex = bytes.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    console.log("Первые 8 байт (hex):", hex);

    if (hex.startsWith("89504E47")) return "image/png";
    if (hex.startsWith("FFD8FF")) return "image/jpeg";
    if (hex.startsWith("47494638")) return "image/gif";
    if (hex.startsWith("424D")) return "image/bmp";
    if (hex.startsWith("00000100") || hex.startsWith("00000120")) return "image/x-icon";

    return null;
}

function renderUserItem(user) {
    const li = document.createElement("li");
    li.classList.add("user-item");
    li.id = `user-${user.UserID}`;

    const avatarContainer = document.createElement("div");
    avatarContainer.classList.add("user-avatar");
    avatarContainer.id = `avatar-${user.UserID}`;

    if (user.ImagePath && user.ImagePath.length > 0) {
        const byteArray = new Uint8Array(user.ImagePath);
        const mimeType = getImageMimeType(byteArray);
        const blob = new Blob([byteArray], { type: mimeType });

        const reader = new FileReader();
        reader.onloadend = function () {
            const img = document.createElement("img");
            img.src = reader.result;
            img.alt = `${user.FirstName} ${user.LastName}`;
            avatarContainer.appendChild(img);
        };
        reader.readAsDataURL(blob);
    } else {
        avatarContainer.textContent = user.FirstName.charAt(0).toUpperCase() + user.LastName.charAt(0).toUpperCase();
        avatarContainer.classList.add("default-avatar");
    }

    const nameSpan = document.createElement("span");
    nameSpan.classList.add("user-name");
    nameSpan.textContent = `${user.FirstName} ${user.LastName}`;

    const statusIndicator = document.createElement("span");
    statusIndicator.classList.add("status-indicator");
    statusIndicator.classList.add(user.IsOnline ? "online" : "offline");
    statusIndicator.title = user.IsOnline ? "В сети" : "Не в сети";

    li.appendChild(avatarContainer);
    li.appendChild(nameSpan);
    li.appendChild(statusIndicator);

    return li;
}

async function loadChatForUser(selectedUserId, userName) {
    const chatTitle = document.querySelector('#chat-title');
    chatTitle.textContent = `Чат с ${userName}`;
    currentChatId = null;

    const messageListContainer = document.querySelector('.message-list');
    messageListContainer.innerHTML = '';
    messageListContainer.textContent = 'Загрузка сообщений...';

    if (!currentUserId) {
        console.error('ID текущего пользователя не определен.');
        messageListContainer.textContent = 'Ошибка: ID текущего пользователя не определен.';
        return;
    }

    try {
        const response = await fetch(`http://localhost:3000/api/chats/${selectedUserId}?userId=${currentUserId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const chatData = await response.json();
        if (chatData.chatId) {
            currentChatId = chatData.chatId;
            displayMessages(chatData.messages);
        } else if (Array.isArray(chatData)) {
            displayMessages(chatData);
        } else {
            messageListContainer.textContent = 'Чат пуст.';
        }
    } catch (error) {
        console.error(`Ошибка при загрузке сообщений для пользователя ${userName}:`, error);
        messageListContainer.textContent = 'Не удалось загрузить сообщения.';
    }
}

function downloadFile(fileUrl, fileName) {
    fetch(fileUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('Скачивание не удалось');
            }
            return response.blob();
        })
        .then(blob => {
            const a = document.createElement('a');
            const url = window.URL.createObjectURL(blob);
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        })
        .catch(error => {
            console.error('Ошибка при скачивании файла:', error);
        });
}

function displayMessages(messages) {
    const messageListContainer = document.querySelector('.message-list');
    messageListContainer.innerHTML = '';

    if (!Array.isArray(messages)) {
        console.error("displayMessages ожидает массив, получено:", messages);
        messageListContainer.textContent = 'Ошибка отображения сообщений.';
        return;
    }

    if (messages.length === 0) {
        messageListContainer.textContent = 'Сообщений пока нет.';
        return;
    }

    const numericCurrentUserId = parseInt(currentUserId, 10);

    messages.forEach(message => {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message');
        messageDiv.classList.add(message.SenderId === numericCurrentUserId ? 'sent' : 'received');

        // Для отправки с текущего юзера без своего Имени и Фамилии

        // if (message.SenderId !== numericCurrentUserId) {
        //     const senderInfo = document.createElement('span');
        //     senderInfo.classList.add('message-sender');
        //     senderInfo.textContent = `${message.FirstName} ${message.LastName}: `;
        //     messageDiv.appendChild(senderInfo);
        // }

        const senderInfo = document.createElement('span');
        senderInfo.classList.add('message-sender');
        senderInfo.textContent = `${message.FirstName} ${message.LastName}: `;
        messageDiv.appendChild(senderInfo);

        const messageContent = document.createElement('p');
        messageContent.classList.add('message-content');
        messageContent.textContent = message.Content;
        messageDiv.appendChild(messageContent);

        if (message.Attachments && message.Attachments.length > 0) {
            message.Attachments.forEach(attachment => {
                const attachmentDiv = document.createElement('div');
                attachmentDiv.classList.add('attachment-info');

                const fileName = attachment.FileName.toLowerCase();
                const isImage = fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.gif') || fileName.endsWith('.webp');

                let fileUrl = attachment.TempPreviewUrl || `http://localhost:3000/api/files/${attachment.FileId}`;

                if (isImage) {
                    const img = document.createElement('img');
                    img.src = fileUrl;
                    img.alt = attachment.FileName;
                    img.style.maxWidth = '200px';
                    img.style.borderRadius = '10px';
                    img.style.marginTop = '5px';
                    img.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.1)';
                    img.style.objectFit = 'cover';
                    img.classList.add('message-image');

                    const downloadLink = document.createElement('a');
                    downloadLink.href = '#';
                    downloadLink.appendChild(img);

                    downloadLink.addEventListener('click', (e) => {
                        e.preventDefault();
                        downloadFile(fileUrl, attachment.FileName);
                    });

                    attachmentDiv.appendChild(downloadLink);
                } else {
                    const downloadLink = document.createElement('a');
                    downloadLink.href = '#';
                    downloadLink.textContent = attachment.FileName;

                    downloadLink.addEventListener('click', (e) => {
                        e.preventDefault();
                        downloadFile(fileUrl, attachment.FileName);
                    });

                    attachmentDiv.textContent = 'Вложение: ';
                    attachmentDiv.appendChild(downloadLink);
                }

                messageDiv.appendChild(attachmentDiv);
            });
        }

        const timeStamp = document.createElement('span');
        timeStamp.classList.add('message-timestamp');
        timeStamp.textContent = new Date(message.SentDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        messageDiv.appendChild(timeStamp);

        messageListContainer.appendChild(messageDiv);
    });

    messageListContainer.scrollTop = messageListContainer.scrollHeight;
}

async function sendMessage(chatId, content) {
    const fileInput = document.getElementById('file-input');
    const formData = new FormData();

    formData.append('chatId', chatId);
    formData.append('senderId', currentUserId);
    formData.append('content', content);

    if (fileInput.files[0]) {
        const file = fileInput.files[0];
        formData.append('file', file);
        formData.append('fileSize', file.size);
    }

    try {
        const tempMessage = {
            MessageId: Date.now(),
            ChatId: chatId,
            SenderId: parseInt(currentUserId),
            FirstName: document.querySelector('.current-user-name').textContent.split(' ')[0],
            LastName: document.querySelector('.current-user-name').textContent.split(' ')[1],
            Content: content,
            SentDate: new Date().toISOString(),
            Attachments: fileInput.files[0] ? [{
                FileName: fileInput.files[0].name,
                TempPreviewUrl: URL.createObjectURL(fileInput.files[0])
            }] : []
        };

        displayNewMessage(tempMessage, parseInt(currentUserId));

        const response = await fetch('http://localhost:3000/api/messages', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            document.getElementById('message-input').value = '';
            fileInput.value = '';
            resetFilePreview();

            const realMessage = await response.json();

            const tempMsgId = tempMessage.MessageId;
            const tempMsgElement = document.querySelector(`[data-message-id="${tempMsgId}"]`);
            if (tempMsgElement) {
                tempMsgElement.setAttribute('data-message-id', realMessage.MessageId);
                tempMsgElement.querySelector('.message-content').textContent = realMessage.Content;

                const attachmentContainer = tempMsgElement.querySelector('.attachment-info');
                if (realMessage.Attachments && realMessage.Attachments.length > 0) {
                    if (attachmentContainer) {
                        attachmentContainer.innerHTML = '';
                        realMessage.Attachments.forEach(attachment => {
                            const downloadLink = document.createElement('a');
                            downloadLink.href = `http://localhost:3000/api/files/${attachment.FileId}`;
                            downloadLink.textContent = attachment.FileName;
                            downloadLink.download = attachment.FileName;
                            attachmentContainer.appendChild(document.createTextNode('Вложение: '));
                            attachmentContainer.appendChild(downloadLink);
                        });
                    }
                } else if (attachmentContainer) {
                    attachmentContainer.remove();
                }

                const timeStampElement = tempMsgElement.querySelector('.message-timestamp');
                if (timeStampElement && realMessage.SentDate) {
                    timeStampElement.textContent = new Date(realMessage.SentDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }
            }
        }
    } catch (error) {
        console.error('Ошибка:', error);
    }
}

function displayNewMessage(message, currentUserId) {
    const messageListContainer = document.querySelector('.message-list');
    if (messageListContainer) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message');
        messageDiv.classList.add(message.SenderId === currentUserId ? 'sent' : 'received');

        // Для отправки с текущего юзера без своего Имени и Фамилии

        // if (message.SenderId !== numericCurrentUserId) {
        //     const senderInfo = document.createElement('span');
        //     senderInfo.classList.add('message-sender');
        //     senderInfo.textContent = `${message.FirstName} ${message.LastName}: `;
        //     messageDiv.appendChild(senderInfo);
        // }

        const senderInfo = document.createElement('span');
        senderInfo.classList.add('message-sender');
        senderInfo.textContent = `${message.FirstName} ${message.LastName}: `;
        messageDiv.appendChild(senderInfo);

        const messageContent = document.createElement('p');
        messageContent.classList.add('message-content');
        messageContent.textContent = message.Content;
        messageDiv.appendChild(messageContent);

        if (message.Attachments && message.Attachments.length > 0) {
            message.Attachments.forEach(attachment => {
                const attachmentDiv = document.createElement('div');
                attachmentDiv.classList.add('attachment-info');

                const fileName = attachment.FileName.toLowerCase();
                const isImage = fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.gif') || fileName.endsWith('.webp');
                const fileUrl = attachment.TempPreviewUrl ? attachment.TempPreviewUrl : `http://localhost:3000/api/files/${attachment.FileId}`;

                if (isImage) {
                    const img = document.createElement('img');
                    img.src = fileUrl;
                    img.alt = attachment.FileName;
                    img.style.maxWidth = '200px';
                    img.style.borderRadius = '10px';
                    img.style.marginTop = '5px';
                    img.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.1)';
                    img.style.objectFit = 'cover';
                    img.classList.add('message-image');

                    const downloadLink = document.createElement('a');
                    downloadLink.href = '#';
                    downloadLink.appendChild(img);

                    downloadLink.addEventListener('click', (e) => {
                        e.preventDefault();
                        downloadFile(fileUrl, attachment.FileName);
                    });

                    attachmentDiv.appendChild(downloadLink);
                } else {
                    const downloadLink = document.createElement('a');
                    downloadLink.href = '#';
                    downloadLink.textContent = attachment.FileName;

                    downloadLink.addEventListener('click', (e) => {
                        e.preventDefault();
                        downloadFile(fileUrl, attachment.FileName);
                    });

                    attachmentDiv.textContent = 'Вложение: ';
                    attachmentDiv.appendChild(downloadLink);
                }

                messageDiv.appendChild(attachmentDiv);
            });
        }

        const timeStamp = document.createElement('span');
        timeStamp.classList.add('message-timestamp');
        timeStamp.textContent = new Date(message.SentDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        messageDiv.appendChild(timeStamp);

        messageListContainer.appendChild(messageDiv);
        messageListContainer.scrollTop = messageListContainer.scrollHeight;
    }
}

function updateOnlineStatuses(onlineUserIds) {
    document.querySelectorAll('.user-item').forEach(li => {
        const userId = parseInt(li.id.replace('user-', ''));
        const statusIndicator = li.querySelector('.status-indicator');

        if (statusIndicator) {
            if (onlineUserIds.includes(userId)) {
                statusIndicator.classList.remove('offline');
                statusIndicator.classList.add('online');
                statusIndicator.title = 'В сети';
            } else {
                statusIndicator.classList.remove('online');
                statusIndicator.classList.add('offline');
                statusIndicator.title ='Не в сети';
            }
        }
    });
}
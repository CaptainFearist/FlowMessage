let currentUserId;

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    currentUserId = urlParams.get('userId');

    if (currentUserId) {
        console.log(`ID пользователя, переданный из WPF: ${currentUserId}`);
        loadCurrentUser();
    } else {
        console.log('ID пользователя не передан из WPF.');
    }

    loadUsers();
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
    } catch (error) {
        console.log('Ошибка при загрузке пользователей:', error);
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

    li.appendChild(avatarContainer);
    li.appendChild(nameSpan);
    li.appendChild(statusIndicator);

    return li;
}

async function loadChatForUser(selectedUserId, userName) {
    const chatTitle = document.querySelector('#chat-title');
    chatTitle.textContent = `Чат с ${userName}`;

    const messageListContainer = document.querySelector('.message-list');
    messageListContainer.innerHTML = '';

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
        const messages = await response.json();
        displayMessages(messages);
    } catch (error) {
        console.error(`Ошибка при загрузке сообщений для пользователя ${userName}:`, error);
        messageListContainer.textContent = 'Не удалось загрузить сообщения.';
    }
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

        const senderInfo = document.createElement('span');
        senderInfo.classList.add('message-sender');
        senderInfo.textContent = `${message.SenderName}: `;
        messageDiv.appendChild(senderInfo);

        const messageContent = document.createElement('p');
        messageContent.classList.add('message-content');
        messageContent.textContent = message.Content;
        messageDiv.appendChild(messageContent);

        if (message.FileId && message.FileName) {
            const attachmentDiv = document.createElement('div');
            attachmentDiv.classList.add('attachment-info');

            const downloadLink = document.createElement('a');
            downloadLink.href = `http://localhost:3000/api/download/${message.FileId}`;
            downloadLink.textContent = message.FileName;
            downloadLink.download = message.FileName;

            attachmentDiv.textContent = 'Вложение: ';
            attachmentDiv.appendChild(downloadLink);
            messageDiv.appendChild(attachmentDiv);
        }

        const timeStamp = document.createElement('span');
        timeStamp.classList.add('message-timestamp');
        timeStamp.textContent = new Date(message.SentDate).toLocaleString();
        messageDiv.appendChild(timeStamp);

        messageListContainer.appendChild(messageDiv);
    });

    messageListContainer.scrollTop = messageListContainer.scrollHeight;
}

const socket = io('http://localhost:3000');

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    currentUserId = urlParams.get('userId');
    if (currentUserId) {
        socket.emit('userConnected', parseInt(currentUserId));
    }

    socket.on('onlineUsers', updateOnlineStatuses);
    socket.on('newMessage', message => {
        if (parseInt(message.senderId) !== parseInt(currentUserId)) {
            loadChatForUser(message.senderId, message.senderName);
        }
    });

    setInterval(() => {
        socket.emit('userConnected', parseInt(currentUserId));
    }, 30000);
});

function updateOnlineStatuses(onlineUserIds) {
    document.querySelectorAll('.user-item').forEach(li => {
        const userId = parseInt(li.id.replace('user-', ''));
        const statusIndicator = li.querySelector('.status-indicator');

        if (statusIndicator) {
            if (onlineUserIds.includes(userId)) {
                statusIndicator.classList.remove('offline');
                statusIndicator.classList.add('online');
            } else {
                statusIndicator.classList.remove('online');
                statusIndicator.classList.add('offline');
            }
        }
    });
}
let currentUserId;

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    currentUserId = urlParams.get('userId');

    if (currentUserId) {
        console.log(`ID пользователя, переданный из WPF: ${currentUserId}`);
    } else {
        console.log('ID пользователя не передан из WPF.');
    }

    loadUsers();
});

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
        const listItem = document.createElement('li');
        listItem.classList.add('user-item');

        const avatar = document.createElement('div');
        avatar.classList.add('user-avatar');

        if (user.ImagePath && user.ImagePath.length > 0) {
            const mimeType = getImageMimeType(user.ImagePath);

            if (mimeType) {
                const uint8Array = new Uint8Array(user.ImagePath);
                const blob = new Blob([uint8Array], { type: mimeType });
                const reader = new FileReader();

                reader.onloadend = function () {
                    avatar.style.backgroundImage = `url(${reader.result})`;
                };

                reader.readAsDataURL(blob);
            } else {
                avatar.textContent = user.FirstName.charAt(0) + user.LastName.charAt(0);
                avatar.classList.add('default-avatar');
            }
        } else {
            avatar.textContent = user.FirstName.charAt(0) + user.LastName.charAt(0);
            avatar.classList.add('default-avatar');
        }

        const userInfo = document.createElement('div');
        userInfo.classList.add('user-info');
        userInfo.textContent = `${user.FirstName} ${user.LastName}`;

        listItem.appendChild(avatar);
        listItem.appendChild(userInfo);
        userList.appendChild(listItem);

        listItem.addEventListener('click', () => {
            loadChatForUser(user.UserID, `${user.FirstName} ${user.LastName}`);
        });
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

    const avatar = document.createElement("div");
    avatar.classList.add("user-avatar");
    avatar.id = `avatar-${user.UserID}`;

    if (user.ImagePath && user.ImagePath.length > 0) {
        const mimeType = getImageMimeType(user.ImagePath);
        const byteArray = new Uint8Array(user.ImagePath);
        const blob = new Blob([byteArray], { type: mimeType });

        const reader = new FileReader();
        reader.onloadend = function () {
            avatar.style.backgroundImage = `url(${reader.result})`;
            avatar.style.backgroundSize = "cover";
            avatar.style.backgroundPosition = "center";
            avatar.textContent = "";
        };
        reader.readAsDataURL(blob);
    } else {
        avatar.textContent = user.FirstName.charAt(0).toUpperCase() + user.LastName.charAt(0).toUpperCase();
    }

    const nameSpan = document.createElement("span");
    nameSpan.classList.add("user-name");
    nameSpan.textContent = `${user.FirstName} ${user.LastName}`;

    li.appendChild(avatar);
    li.appendChild(nameSpan);

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

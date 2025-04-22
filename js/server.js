const express = require('express');
const cors = require('cors');
const { Connection, Request, TYPES } = require('tedious');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const port = 3000;

const corsOptions = {
    origin: 'http://localhost:5500',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// Создание HTTP сервера и инициализация Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
    cors: corsOptions
});

let onlineUsers = new Map();

io.on('connection', socket => {
    console.log('Новое соединение');

    socket.on('userConnected', userId => {
        onlineUsers.set(userId, socket.id);
        io.emit('onlineUsers', Array.from(onlineUsers.keys()));
    });

    socket.on('sendMessage', async (message) => {
        try {
            const messageId = await saveMessageToDatabase(message.chatId, message.senderId, message.content);

            const senderNameResult = await executeQuery(
                `SELECT FirstName, LastName FROM Users WHERE UserID = @senderId`,
                [{ name: 'senderId', type: TYPES.Int, value: message.senderId }]
            );
            
            const firstName = senderNameResult[0]?.FirstName || '';
            const lastName = senderNameResult[0]?.LastName || '';
            
            const messageToSend = {
                MessageId: messageId,
                ChatId: message.chatId,
                SenderId: message.senderId,
                FirstName: firstName,
                LastName: lastName,
                Content: message.content,
                SentDate: message.sentDate
            };
        
            const chatParticipantsResult = await executeQuery(`
                SELECT UserId FROM ChatParticipants WHERE ChatId = @chatId
            `, [{ name: 'chatId', type: TYPES.Int, value: message.chatId }]);

            chatParticipantsResult.forEach(participant => {
                const recipientSocketId = onlineUsers.get(participant.UserId);
                if (recipientSocketId) {
                    io.to(recipientSocketId).emit('newMessage', messageToSend);
                }
            });
        } catch (error) {
            console.error('Ошибка при обработке sendMessage:', error);
        }
    });

    socket.on('disconnect', () => {
        for (const [userId, sockId] of onlineUsers.entries()) {
            if (sockId === socket.id) {
                onlineUsers.delete(userId);
                break;
            }
        }
        io.emit('onlineUsers', Array.from(onlineUsers.keys()));
    });
});

const config = {
    server: 'HONEYPOT',
    port: 1433,
    authentication: {
        type: 'default',
        options: {
            userName: 'flowmessage_user',
            password: 'dadada'
        }
    },
    options: {
        database: 'IT_Departments',
        trustServerCertificate: true,
        encrypt: false
    }
};

function executeQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        const connection = new Connection(config);

        connection.on('connect', err => {
            if (err) {
                return reject(err);
            }

            const results = [];
            const request = new Request(sql, (err) => {
                if (err) {
                    return reject(err);
                }
                resolve(results);
                connection.close();
            });

            request.on('row', columns => {
                const row = {};
                columns.forEach(column => {
                    row[column.metadata.colName] = column.value;
                });
                results.push(row);
            });

            params.forEach(param =>
                request.addParameter(param.name, param.type, param.value)
            );

            connection.execSql(request);
        });

        connection.connect();
    });
}

async function getOrCreateChat(userId1, userId2) {
    console.log('userId1:', userId1, 'userId2:', userId2);

    const checkChatSql = `
        SELECT ChatId
        FROM ChatParticipants
        WHERE UserId IN (@userId1, @userId2)
        GROUP BY ChatId
        HAVING COUNT(DISTINCT UserId) = 2;
    `;

    let existingChat;
    try {
        existingChat = await executeQuery(checkChatSql, [
            { name: 'userId1', type: TYPES.Int, value: userId1 },
            { name: 'userId2', type: TYPES.Int, value: userId2 }
        ]);
    } catch (err) {
        console.error('Ошибка при выполнении checkChatSql:', err);
        throw err;
    }

    console.log('Результат checkChatSql:', existingChat);

    if (existingChat && existingChat.length > 0) {
        return existingChat[0].ChatId;
    }

    try {
        const createChatSql = `
            INSERT INTO Chats
            OUTPUT INSERTED.ChatId
            DEFAULT VALUES;
        `;
        const newChatResult = await executeQuery(createChatSql);
        console.log('newChatResult:', newChatResult);

        if (!newChatResult || !newChatResult[0]?.ChatId) {
            throw new Error('Не удалось получить ChatId после вставки');
        }

        const newChatId = newChatResult[0].ChatId;

        const addParticipantsSql = `
            INSERT INTO ChatParticipants (ChatId, UserId) VALUES (@chatId, @userId1);
            INSERT INTO ChatParticipants (ChatId, UserId) VALUES (@chatId, @userId2);
        `;

        await executeQuery(addParticipantsSql, [
            { name: 'chatId', type: TYPES.Int, value: newChatId },
            { name: 'userId1', type: TYPES.Int, value: userId1 },
            { name: 'userId2', type: TYPES.Int, value: userId2 }
        ]);

        return newChatId;
    } catch (err) {
        console.error('Ошибка при создании нового чата:', err);
        throw err;
    }
}

async function saveMessageToDatabase(chatId, senderId, content) {
    const sql = `
        INSERT INTO Messages (ChatId, SenderId, Content, SentDate)
        OUTPUT INSERTED.MessageId
        VALUES (@chatId, @senderId, @content, GETDATE());
    `;
    const result = await executeQuery(sql, [
        { name: 'chatId', type: TYPES.Int, value: chatId },
        { name: 'senderId', type: TYPES.Int, value: senderId },
        { name: 'content', type: TYPES.NVarChar, value: content }
    ]);
    return result[0].MessageId;
}

async function fetchMessages(chatId) {
    const sql = `
        SELECT m.MessageId, m.ChatId, m.SenderId, m.Content, m.SentDate, u.FirstName, u.LastName
        FROM Messages m
        JOIN Users u ON m.SenderId = u.UserID
        WHERE m.ChatId = @chatId
        ORDER BY m.SentDate;
    `;
    return executeQuery(sql, [
        { name: 'chatId', type: TYPES.Int, value: chatId }
    ]);
}

app.get('/api/users', (req, res) => {
    const connection = new Connection(config);

    connection.on('connect', err => {
        if (err) {
            console.error('Ошибка подключения к БД:', err);
            return res.status(500).json({ error: 'Ошибка подключения к БД' });
        }

        const request = new Request("SELECT UserID, FirstName, LastName, ImagePath FROM Users", (err) => {
            if (err) {
                console.error('Ошибка получения пользователей:', err);
                return res.status(500).json({ error: 'Ошибка получения пользователей' });
            }
            connection.close();
        });

        const users = [];

        request.on('row', columns => {
            const user = {};
            columns.forEach(column => {
                user[column.metadata.colName] = column.value instanceof Buffer
                    ? Array.from(column.value)
                    : column.value;
            });
            users.push(user);
        });

        request.on('requestCompleted', () => {
            res.json(users);
        });

        connection.execSql(request);
    });

    connection.connect();
});

app.get('/api/users/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);
    const connection = new Connection(config);

    connection.on('connect', err => {
        if (err) {
            console.error('Ошибка подключения к БД:', err);
            return res.status(500).json({ error: 'Ошибка подключения к БД' });
        }

        const request = new Request(`SELECT UserID, FirstName, LastName, ImagePath FROM Users WHERE UserID = @userId`, (err) => {
            if (err) {
                console.error('Ошибка получения пользователя:', err);
                return res.status(500).json({ error: 'Ошибка получения пользователя' });
            }
            connection.close();
        });

        request.addParameter('userId', TYPES.Int, userId);

        let user = null;

        request.on('row', columns => {
            user = {};
            columns.forEach(column => {
                user[column.metadata.colName] = column.value instanceof Buffer
                    ? Array.from(column.value)
                    : column.value;
            });
        });

        request.on('requestCompleted', () => {
            if (user) {
                res.json(user);
            } else {
                res.status(404).json({ error: 'Пользователь не найден' });
            }
        });

        connection.execSql(request);
    });

    connection.connect();
});

app.get('/api/chats/:selectedUserId', async (req, res) => {
    const selectedUserId = parseInt(req.params.selectedUserId);
    const currentUserId = parseInt(req.query.userId);

    try {
        const chatId = await getOrCreateChat(currentUserId, selectedUserId);
        if (chatId) {
            const messages = await fetchMessages(chatId);
            res.json({ chatId: chatId, messages: messages });
        } else {
            res.status(404).json({ error: 'Чат не найден или не создан' });
        }
    } catch (error) {
        console.error('Ошибка при получении или создании чата:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/api/download/:fileId', (req, res) => {
    const fileId = parseInt(req.params.fileId);
    const connection = new Connection(config);

    let responseSent = false;

    connection.on('connect', err => {
        if (err) {
            responseSent = true;
            return res.status(500).send('Ошибка подключения к базе данных.');
        }

        const request = new Request(`
            SELECT FileName, FileContent FROM Files WHERE FileId = @fileId
        `, (err, rowCount) => {
            if (err || rowCount === 0) {
                if (!responseSent) {
                    responseSent = true;
                    res.status(404).send('Файл не найден.');
                }
            }
        });

        request.addParameter('fileId', TYPES.Int, fileId);

        request.on('row', columns => {
            if (responseSent) return;

            const fileName = columns.find(col => col.metadata.colName === 'FileName')?.value;
            const fileContent = columns.find(col => col.metadata.colName === 'FileContent')?.value;

            if (fileName && fileContent) {
                responseSent = true;
                res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
                res.send(Buffer.from(fileContent));
            } else {
                responseSent = true;
                res.status(404).send('Файл не найден.');
            }
        });

        request.on('requestCompleted', () => {
            connection.close();
        });

        connection.execSql(request);
    });

    connection.connect();
});

server.listen(port, () => {
    console.log(`Сервер запущен на http://localhost:${port}`);
});
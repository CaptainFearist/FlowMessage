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

    socket.on('sendMessage', message => {
        const recipientSocketId = onlineUsers.get(message.receiverId);
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('newMessage', message);
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

app.get('/api/chats/:selectedUserId', (req, res) => {
    const selectedUserId = parseInt(req.params.selectedUserId);
    const currentUserId = parseInt(req.query.userId);

    const connection = new Connection(config);

    connection.on('connect', err => {
        if (err) return res.status(500).json({ error: 'Ошибка подключения к БД' });

        const findChatRequest = new Request(`
            SELECT cp1.ChatId
            FROM ChatParticipants cp1
            JOIN ChatParticipants cp2 ON cp1.ChatId = cp2.ChatId
            WHERE cp1.UserId = @userId1 AND cp2.UserId = @userId2;
        `, (err, rowCount) => {
            if (err || rowCount === 0) {
                connection.close();
                return res.json([]);
            }
        });

        let chatId = null;

        findChatRequest.addParameter('userId1', TYPES.Int, currentUserId);
        findChatRequest.addParameter('userId2', TYPES.Int, selectedUserId);

        findChatRequest.on('row', columns => {
            chatId = columns.find(c => c.metadata.colName === 'ChatId')?.value;
        });

        findChatRequest.on('requestCompleted', () => {
            if (!chatId) {
                connection.close();
                return res.status(404).json({ error: 'Чат не найден' });
            }

            fetchMessages(chatId, connection, res);
        });

        connection.execSql(findChatRequest);
    });

    connection.connect();
});

function fetchMessages(chatId, connection, res) {
    const request = new Request(`
        SELECT
            m.MessageId,
            m.Content,
            m.SentDate,
            m.SenderId,
            u.FirstName + ' ' + u.LastName AS SenderName,
            f.FileId,
            f.FileName
        FROM Messages m
        JOIN Users u ON m.SenderId = u.UserId
        LEFT JOIN ChatAttachments ca ON m.MessageId = ca.MessageId
        LEFT JOIN Files f ON ca.FileId = f.FileId
        WHERE m.ChatId = @chatId
        ORDER BY m.SentDate;
    `, err => {
        if (err) {
            res.status(500).json({ error: 'Ошибка при получении сообщений' });
        }
        connection.close();
    });

    request.addParameter('chatId', TYPES.Int, chatId);

    const messages = [];

    request.on('row', columns => {
        const message = {};
        columns.forEach(column => {
            message[column.metadata.colName] = column.value;
        });
        messages.push(message);
    });

    request.on('requestCompleted', () => {
        res.json(messages);
    });

    connection.execSql(request);
}

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

function sendMessage(receiverId, content) {
    const message = {
        senderId: parseInt(currentUserId),
        receiverId: parseInt(receiverId),
        senderName: 'Текущий пользователь',
        content: content,
        sentDate: new Date().toISOString()
    };

    socket.emit('sendMessage', message);
    displayMessages([message]);
}

server.listen(port, () => {
    console.log(`Сервер запущен на http://localhost:${port}`);
});

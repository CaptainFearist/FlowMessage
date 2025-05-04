const express = require('express');
const cors = require('cors');
const { Connection, Request, TYPES } = require('tedious');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // Чтобы не ломались русские символы в имени файла
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, true);
  }
});

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
            const response = await fetch('http://localhost:3000/api/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(message)
            });
            
            if (!response.ok) {
                throw new Error('Failed to send message');
            }
        } catch (error) {
            console.error('Error sending message:', error);
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

app.post('/api/messages', upload.single('file'), async (req, res) => {
    const { chatId, senderId, content } = req.body;
    const fileSize = req.file ? req.body.fileSize : null;
    const file = req.file;

    try {
        const messageSql = `
            INSERT INTO Messages (ChatId, SenderId, Content, SentDate)
            OUTPUT INSERTED.MessageId
            VALUES (@chatId, @senderId, @content, GETDATE());
        `;
        const messageResult = await executeQuery(messageSql, [
            { name: 'chatId', type: TYPES.Int, value: chatId },
            { name: 'senderId', type: TYPES.Int, value: senderId },
            { name: 'content', type: TYPES.NVarChar, value: content }
        ]);
        const messageId = messageResult[0].MessageId;
        const sentDateFromDb = messageResult[0].SentDate;

        let fileId = null;
        if (file) {

            const fileExtension = path.extname(file.originalname).toLowerCase().substring(1);
            const fileTypeResult = await executeQuery(
                `SELECT FileTypeId FROM FileTypes WHERE FileTypeName = @fileTypeName`,
                [{ name: 'fileTypeName', type: TYPES.NVarChar, value: fileExtension }]
            );

            let fileTypeId;
            if (fileTypeResult.length > 0) {
                fileTypeId = fileTypeResult[0].FileTypeId;
            } else {
                const newFileTypeResult = await executeQuery(
                    `INSERT INTO FileTypes (FileTypeName) OUTPUT INSERTED.FileTypeId VALUES (@fileTypeName)`,
                    [{ name: 'fileTypeName', type: TYPES.NVarChar, value: fileExtension }]
                );
                fileTypeId = newFileTypeResult[0].FileTypeId;
            }

            const fileSql = `
                INSERT INTO Files (FileName, FileContent, FileTypeId, UploadDate, UserId, FileSize)
                OUTPUT INSERTED.FileId
                VALUES (@fileName, @fileContent, @fileTypeId, GETDATE(), @userId, @fileSize);
            `;

            const fileResult = await executeQuery(fileSql, [
                { name: 'fileName', type: TYPES.NVarChar, value: file.originalname },
                { name: 'fileContent', type: TYPES.VarBinary, value: file.buffer },
                { name: 'fileTypeId', type: TYPES.Int, value: fileTypeId },
                { name: 'userId', type: TYPES.Int, value: senderId },
                { name: 'fileSize', type: TYPES.BigInt, value: fileSize ? parseInt(fileSize) : null }
            ]);
            fileId = fileResult[0].FileId;

            await executeQuery(
                `INSERT INTO ChatAttachments (MessageId, FileId) VALUES (@messageId, @fileId)`,
                [
                    { name: 'messageId', type: TYPES.Int, value: messageId },
                    { name: 'fileId', type: TYPES.Int, value: fileId }
                ]
            );
        }

        const senderResult = await executeQuery(
            `SELECT FirstName, LastName FROM Users WHERE UserID = @senderId`,
            [{ name: 'senderId', type: TYPES.Int, value: senderId }]
        );
        const firstName = senderResult[0]?.FirstName || '';
        const lastName = senderResult[0]?.LastName || '';

        const responseData = {
            MessageId: messageId,
            ChatId: chatId,
            SenderId: senderId,
            FirstName: firstName,
            LastName: lastName,
            Content: content,
            SentDate: sentDateFromDb ? sentDateFromDb.toISOString() : new Date().toISOString(),
            Attachments: fileId ? [{
                FileId: fileId,
                FileName: file.originalname
            }] : []
        };

        const chatParticipants = await executeQuery(
            `SELECT UserId FROM ChatParticipants WHERE ChatId = @chatId`,
            [{ name: 'chatId', type: TYPES.Int, value: chatId }]
        );

        chatParticipants.forEach(participant => {
            const recipientSocketId = onlineUsers.get(participant.UserId);
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('newMessage', responseData);
            }
        });

        res.status(201).json(responseData);
    } catch (error) {
        console.error('Ошибка при сохранении сообщения:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
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
        SELECT 
            m.MessageId, 
            m.ChatId, 
            m.SenderId, 
            m.Content, 
            m.SentDate, 
            u.FirstName, 
            u.LastName,
            ca.ChatAttachmentId,
            f.FileId,
            f.FileName
        FROM Messages m
        JOIN Users u ON m.SenderId = u.UserID
        LEFT JOIN ChatAttachments ca ON m.MessageId = ca.MessageId
        LEFT JOIN Files f ON ca.FileId = f.FileId
        WHERE m.ChatId = @chatId
        ORDER BY m.SentDate;
    `;
    
    const rows = await executeQuery(sql, [
        { name: 'chatId', type: TYPES.Int, value: chatId }
    ]);
    
    const messagesMap = new Map();
    
    rows.forEach(row => {
        if (!messagesMap.has(row.MessageId)) {
            messagesMap.set(row.MessageId, {
                MessageId: row.MessageId,
                ChatId: row.ChatId,
                SenderId: row.SenderId,
                Content: row.Content,
                SentDate: row.SentDate,
                FirstName: row.FirstName,
                LastName: row.LastName,
                Attachments: []
            });
        }
        
        if (row.FileId) {
            messagesMap.get(row.MessageId).Attachments.push({
                FileId: row.FileId,
                FileName: row.FileName
            });
        }
    });
    
    return Array.from(messagesMap.values());
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

app.get('/api/files/:fileId', async (req, res) => {
    const fileId = req.params.fileId;
    
    try {
        const result = await executeQuery(
            `SELECT FileName, FileContent FROM Files WHERE FileId = @fileId`,
            [{ name: 'fileId', type: TYPES.Int, value: fileId }]
        );
        
        if (result.length === 0) {
            return res.status(404).send('File not found');
        }
        
        const file = result[0];
        res.setHeader('Content-Disposition', `attachment; filename="${file.FileName}"`);
        res.send(file.FileContent);
    } catch (error) {
        console.error('Error downloading file:', error);
        res.status(500).send('Server error');
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
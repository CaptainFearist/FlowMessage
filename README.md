# FlowMessage

**FlowMessage** — это вспомогательный модуль к десктопному приложению [FlowDocs](https://github.com/CaptainFearist/FlowDocs), который расширяет возможности платформы Flow, предоставляя веб-интерфейс мессенджера.

🔗 **Основное приложение**: [FlowDocs — GitHub](https://github.com/CaptainFearist/FlowDocs)

## Что это?

FlowMessage — веб-приложение, которое служит связующим звеном в экосистеме Flow. Оно позволяет пользователям обмениваться сообщениями, оставаясь внутри платформы Flow, и доступно напрямую из десктопного приложения FlowDocs одним кликом.

## Основные особенности

- Интеграция с FlowDocs  
- Реализация мессенджера через браузер
- Поддержка отправки файлов в сообщениях с использованием `Multer`
- Удобный и отзывчивый интерфейс прикрепления файлов с плавной анимацией появления превью и возврата к исходному состоянию
- Поддержка отправки файлов в сообщениях  
- Автоматическая проверка и сохранение вложений в базу данных  
- Удобное скачивание файлов в один клик прямо из чата
- Отображение онлайн-статусов пользователей в реальном времени

## Технологии

- **Node.js** — серверная платформа  
- **Express.js** — веб-сервер  
- **CORS** — поддержка кросс-доменных запросов  
- **Tedious** — работа с Microsoft SQL Server
- **Socket.IO** — реализация взаимодействия в реальном времени (онлайн-статусы, обмен сообщениями)
- **Multer** — middleware для эффективной обработки загрузки файлов
- **ESLint** — линтинг кода

## Как использовать

1. Откройте десктопное приложение [FlowDocs](https://github.com/CaptainFearist/FlowDocs).
2. Нажмите кнопку перехода к мессенджеру.
3. FlowMessage откроется в браузере, предоставляя доступ к чату.

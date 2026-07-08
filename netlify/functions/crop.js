const sharp = require('sharp');
const axios = require('axios');

exports.handler = async (event) => {
    // Разрешаем только POST-запросы
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    
    try {
        const { imageUrl } = JSON.parse(event.body);
        
        if (!imageUrl) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Нужен imageUrl' }) };
        }

        // Скачиваем картинку
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data, 'binary');
        const mimeType = response.headers['content-type'];

        // Обрезаем белый фон
        const croppedBuffer = await sharp(buffer).trim().toBuffer();
        
        // Конвертируем в Base64
        const base64 = croppedBuffer.toString('base64');

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                success: true, 
                mime: mimeType, 
                base64: base64 
            })
        };
    } catch (error) {
        console.error('Ошибка:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
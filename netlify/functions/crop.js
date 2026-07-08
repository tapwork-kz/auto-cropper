const sharp = require('sharp');
const axios = require('axios');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    
    try {
        const { imageUrl } = JSON.parse(event.body);
        if (!imageUrl) return { statusCode: 400, body: JSON.stringify({ error: 'Нужен imageUrl' }) };

        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data, 'binary');
        const mimeType = response.headers['content-type'];

        // Читаем сырые пиксели картинки (RGB)
        const { data, info } = await sharp(buffer)
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const width = info.width;
        const height = info.height;
        const channels = info.channels; // 3 канала (R, G, B)

        // Функция оценки "документности" строки
        // Строка считается частью документа, если более 60% пикселей светлые (фон)
        const isDocLikeRow = (y) => {
            let whiteCount = 0;
            let offset = y * width * channels;
            for (let x = 0; x < width; x++) {
                const r = data[offset];
                const g = data[offset + 1];
                const b = data[offset + 2];
                // Если цвет пикселя светло-серый или белый
                if (r > 220 && g > 220 && b > 220) {
                    whiteCount++;
                }
                offset += channels;
            }
            return (whiteCount / width) > 0.60;
        };

        const mid = Math.floor(height / 2);
        let topCrop = mid;
        let bottomCrop = mid;
        const TOLERANCE = 40; // Игнорируем мелкие темные полосы (до 40 пикселей)

        // Ищем верхнюю границу (сканируем от центра вверх)
        let nonDocCount = 0;
        for (let y = mid; y >= 0; y--) {
            if (!isDocLikeRow(y)) {
                nonDocCount++;
                if (nonDocCount > TOLERANCE) {
                    topCrop = y + TOLERANCE; // Уперлись в шапку, откатываемся на границу
                    break;
                }
            } else {
                nonDocCount = 0;
                topCrop = y;
            }
        }

        // Ищем нижнюю границу (сканируем от центра вниз)
        nonDocCount = 0;
        for (let y = mid; y < height; y++) {
            if (!isDocLikeRow(y)) {
                nonDocCount++;
                if (nonDocCount > TOLERANCE) {
                    bottomCrop = y - TOLERANCE; // Уперлись в футер, откатываемся на границу
                    break;
                }
            } else {
                nonDocCount = 0;
                bottomCrop = y;
            }
        }

        // Защита от сбоев алгоритма: 
        // Если вырезанный кусок получился слишком маленьким, возвращаем оригинал
        let extractHeight = bottomCrop - topCrop;
        if (extractHeight < height * 0.2) {
            topCrop = 0;
            extractHeight = height;
        }

        // Вырезаем найденный документ точно по границам
        const croppedBuffer = await sharp(buffer)
            .extract({ left: 0, top: topCrop, width: width, height: extractHeight })
            .toBuffer();

        const base64 = croppedBuffer.toString('base64');

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true, mime: mimeType, base64: base64 })
        };
    } catch (error) {
        console.error('Ошибка:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
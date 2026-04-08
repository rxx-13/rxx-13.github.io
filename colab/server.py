# ════════════════════════════════════════════════════════
# server.py — Scriptorium OCR Backend
# Скачивается Colab-ноутбуком из GitHub и запускается через %run
# Требует: model и processor уже загружены в ячейке 3
# ════════════════════════════════════════════════════════

import base64
import io
import threading
import torch

from PIL import Image
from flask import Flask, request, jsonify
from flask_cors import CORS
from pyngrok import ngrok
from qwen_vl_utils import process_vision_info


# ── ФУНКЦИЯ РАСПОЗНАВАНИЯ ─────────────────────────────
def recognize(image_b64: str) -> dict:
    # Убираем префикс data:image/...;base64,
    if ',' in image_b64:
        image_b64 = image_b64.split(',')[1]

    image_bytes = base64.b64decode(image_b64)
    image = Image.open(io.BytesIO(image_bytes)).convert('RGB')

    messages = [
        {
            'role': 'user',
            'content': [
                {'type': 'image', 'image': image},
                {
                    'type': 'text',
                    'text': (
                        'Перепиши весь рукописный текст на изображении точно как написано. '
                        'Выведи только текст, без пояснений и комментариев.'
                    )
                }
            ]
        }
    ]

    text = processor.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    )

    image_inputs, video_inputs = process_vision_info(messages)

    inputs = processor(
        text=[text],
        images=image_inputs,
        videos=video_inputs,
        padding=True,
        return_tensors='pt'
    ).to(model.device)

    with torch.no_grad():
        output_ids = model.generate(**inputs, max_new_tokens=1024)

    generated_ids = [output_ids[0][len(inputs.input_ids[0]):]]
    result = processor.batch_decode(
        generated_ids, skip_special_tokens=True, clean_up_tokenization_spaces=False
    )[0]

    return {'corrected': result.strip()}


# ── FLASK-СЕРВЕР ──────────────────────────────────────
app = Flask(__name__)
CORS(app)


@app.route('/predict', methods=['POST'])
def predict():
    data = request.get_json(force=True)
    image_b64 = data.get('image', '')
    if not image_b64:
        return jsonify({'error': 'Поле image отсутствует'}), 400
    result = recognize(image_b64)
    return jsonify(result)


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})


def run_server():
    app.run(port=7860, use_reloader=False, threaded=True)


thread = threading.Thread(target=run_server, daemon=True)
thread.start()

tunnel = ngrok.connect(7860)
url = tunnel.public_url

print('\n' + '=' * 50)
print('✅ СЕРВЕР ЗАПУЩЕН!')
print(f'Вставь в js/api.js строку 6:')
print(f"var SPACE_URL = '{url}';")
print('=' * 50)

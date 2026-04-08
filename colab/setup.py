# ════════════════════════════════════════════════════════
#  setup.py — Статичная часть Colab-ноутбука (справочник)
#
#  Этот файл НЕ запускается напрямую.
#  Он содержит код ячеек 1–4 ноутбука scriptorium_colab.ipynb
#  для версионирования и справки.
#
#  Динамическая часть (логика сервера) — в server.py.
# ════════════════════════════════════════════════════════


# ── ЯЧЕЙКА 1 — Установка библиотек ───────────────────
# Запускается один раз. Занимает ~3 минуты.
#
# !pip install -q transformers pyngrok accelerate qwen-vl-utils pillow flask flask-cors


# ── ЯЧЕЙКА 2 — ngrok токен ────────────────────────────
# Получить токен: https://dashboard.ngrok.com/get-started/your-authtoken
#
# NGROK_TOKEN = 'YOUR_TOKEN_HERE'
#
# from pyngrok import ngrok
# ngrok.set_auth_token(NGROK_TOKEN)


# ── ЯЧЕЙКА 3 — Загрузка модели ───────────────────────
# Занимает 5–10 минут. Требует GPU (T4 или лучше).
#
# import torch
# from transformers import Qwen2_5_VLForConditionalGeneration, AutoProcessor
# from PIL import Image
#
# MODEL_ID = 'Qwen/Qwen2.5-VL-3B-Instruct'
#
# processor = AutoProcessor.from_pretrained(MODEL_ID)
# model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
#     MODEL_ID,
#     torch_dtype=torch.float16,
#     device_map='auto'
# )
# model.eval()


# ── ЯЧЕЙКА 4 — Запуск сервера ─────────────────────────
# Скачивает актуальный server.py с GitHub и запускает.
# Единственная ячейка, которую нужно перезапускать при обновлениях.
#
# !wget -q -O server.py \
#   https://raw.githubusercontent.com/rxx-13/rxx-13.github.io/main/colab/server.py
#
# %run server.py

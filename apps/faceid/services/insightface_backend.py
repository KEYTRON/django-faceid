"""
Backend для эмбеддингов/сравнения.
Используем InsightFace -> FaceAnalysis (детекция + нормированный эмбеддинг).
"""

import io
import numpy as np
from PIL import Image
from insightface.app import FaceAnalysis

# Загружаем один раз при старте воркера
_app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
_app.prepare(ctx_id=0, det_size=(640, 640))


def _read_image(image_bytes: bytes) -> np.ndarray:
    im = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    return np.array(im)


def embed_from_bytes(image_bytes: bytes) -> np.ndarray | None:
    """Возвращает эмбеддинг лица (np.array) или None, если лицо не найдено."""
    img = _read_image(image_bytes)
    faces = _app.get(img)
    if not faces:
        return None
    # Берем самое крупное лицо
    faces.sort(key=lambda f: (f.bbox[2]-f.bbox[0])*(f.bbox[3]-f.bbox[1]), reverse=True)
    f = faces[0]
    # normed_embedding — уже нормирован
    return f.normed_embedding.astype(np.float32)

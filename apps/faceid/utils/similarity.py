import numpy as np
from typing import List


def cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    # Косинусное сходство [-1..1], нужно ближе к 1
    denom = (np.linalg.norm(a) * np.linalg.norm(b)) + 1e-8
    return float(np.dot(a, b) / denom)


def best_score(probe: np.ndarray, gallery: List[np.ndarray]) -> float:
    return max(cosine_sim(probe, g) for g in gallery)


def aggregate(embs: List[np.ndarray]) -> np.ndarray:
    # Усреднение нескольких эмбеддингов для устойчивости
    M = np.stack(embs, axis=0)
    v = M.mean(axis=0)
    # Нормализация — InsightFace обычно уже нормирует, но не лишнее
    n = np.linalg.norm(v) + 1e-8
    return v / n

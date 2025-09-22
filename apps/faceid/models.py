from django.conf import settings
from django.db import models
from django.utils import timezone
from typing import List
import json


class FaceTemplate(models.Model):
    """
    Храним один или несколько эмбеддингов на пользователя.
    В MVP — JSON массивы float32. В проде — pgvector.
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    embeddings_json = models.TextField()  # JSON: List[List[float]]
    created_at = models.DateTimeField(default=timezone.now)

    def get_embeddings(self) -> List[List[float]]:
        return json.loads(self.embeddings_json)

    class Meta:
        verbose_name = "Шаблон лица"
        verbose_name_plural = "Шаблоны лиц"

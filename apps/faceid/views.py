import json
import numpy as np
from typing import List
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse, HttpRequest
from django.shortcuts import render
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from .models import FaceTemplate
from .services.insightface_backend import embed_from_bytes
from .utils.similarity import aggregate, best_score


@ensure_csrf_cookie
@login_required
def enroll_page(request: HttpRequest):
    # Страница с камерой и челленджем для записи эмбеддинга
    return render(request, "faceid/enroll.html")


@ensure_csrf_cookie
def verify_page(request: HttpRequest):
    # Гостям можно логиниться через face verify (вариант)
    return render(request, "faceid/verify.html")


@login_required
@require_POST
def api_enroll(request: HttpRequest):
    """
    Принимаем 3–5 кадров (multipart form-data: files[]),
    считаем эмбеддинги, агрегируем и сохраняем.
    """
    files = request.FILES.getlist("files[]")
    embs = []
    for f in files:
        emb = embed_from_bytes(f.read())
        if emb is not None:
            embs.append(emb)
    if len(embs) < 2:
        return JsonResponse({"ok": False, "error": "Недостаточно валидных кадров"}, status=400)
    rep = aggregate(embs)

    # Сохраняем: на будущее можно хранить набор, а не усреднение
    tpl, _ = FaceTemplate.objects.get_or_create(user=request.user)
    tpl.embeddings_json = json.dumps([rep.tolist()])
    tpl.save()
    return JsonResponse({"ok": True})


@require_POST
def api_verify(request: HttpRequest):
    """
    Принимаем один кадр (files[0]) и сверяем с эмбеддингами юзера.
    Вариант A: по username (простой сценарий).
    Вариант B: ищем по всем (если делаем "кто это?").
    """
    username = request.POST.get("username")
    if not username:
        return JsonResponse({"ok": False, "error": "username обязателен"}, status=400)

    try:
        tpl = FaceTemplate.objects.select_related("user").get(user__username=username)
    except FaceTemplate.DoesNotExist:
        return JsonResponse({"ok": False, "error": "шаблон не найден"}, status=404)

    f = request.FILES.get("file")
    if not f:
        return JsonResponse({"ok": False, "error": "нет файла"}, status=400)

    probe = embed_from_bytes(f.read())
    if probe is None:
        return JsonResponse({"ok": False, "error": "лицо не найдено"}, status=400)

    gallery = [np.array(e, dtype=np.float32) for e in json.loads(tpl.embeddings_json)]
    score = best_score(probe, gallery)

    # Порог эмпирический: 0.35–0.45 для cosine с normed embedding — начните с 0.4
    threshold = 0.40
    return JsonResponse({"ok": True, "score": score, "passed": score >= threshold})

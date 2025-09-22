from django.urls import path
from apps.faceid.consumers import LivenessConsumer

websocket_urlpatterns = [
    path("ws/faceid/<str:session_id>/", LivenessConsumer.as_asgi()),
]

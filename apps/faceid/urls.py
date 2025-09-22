from django.urls import path
from . import views

app_name = "faceid"

urlpatterns = [
    path("enroll/", views.enroll_page, name="enroll_page"),
    path("verify/", views.verify_page, name="verify_page"),
    path("api/enroll", views.api_enroll, name="api_enroll"),
    path("api/verify", views.api_verify, name="api_verify"),
]

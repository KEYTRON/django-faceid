from django.contrib import admin
from .models import FaceTemplate


@admin.register(FaceTemplate)
class FaceTemplateAdmin(admin.ModelAdmin):
    list_display = ['user', 'created_at']
    list_filter = ['created_at']
    search_fields = ['user__username']

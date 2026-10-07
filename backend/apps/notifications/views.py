"""In-app notification feed."""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Notification
from .serializers import NotificationSerializer


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def notifications(request):
    rows = Notification.objects.filter(user=request.user).order_by("-created_at")[:100]
    return Response(NotificationSerializer(rows, many=True).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_read(request, notification_id):
    # Scoped to the caller: without user=request.user anyone could mark another
    # person's notifications read by guessing an id.
    updated = Notification.objects.filter(pk=notification_id, user=request.user).update(
        is_read=True
    )
    if not updated:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(NotificationSerializer(Notification.objects.get(pk=notification_id)).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_all_read(request):
    Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
    rows = Notification.objects.filter(user=request.user).order_by("-created_at")[:100]
    return Response(NotificationSerializer(rows, many=True).data)

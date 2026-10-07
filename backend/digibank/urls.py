"""
Root URL configuration.

These paths are the contract the React frontend codes against - see
frontend/src/services/endpoints.js, which must be kept in step with this file.

Note there is deliberately no plain "password in, token out" route. Getting a
session takes two calls: /auth/login/ proves the password and sends a code,
/auth/verify-otp/ checks the code and issues the token.
"""
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path

from apps.accounts import kyc as kyc_views
from apps.accounts.urls import account_urlpatterns, auth_urlpatterns, kyc_urlpatterns
from apps.emergency import views as emergency_views
from apps.notifications import views as notification_views
from apps.payments import views as payment_views
from apps.savings import views as savings_views


def health(request):
    """Quick check that the server and database are wired up correctly."""
    from django.db import connection

    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
        cursor.fetchone()
    return JsonResponse({"status": "ok", "database": "connected"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health),

    # Auth: register -> OTP -> login -> OTP -> session
    path("api/auth/", include((auth_urlpatterns, "auth"))),
    path("api/accounts/", include((account_urlpatterns, "accounts"))),
    path("api/kyc/", include((kyc_urlpatterns, "kyc"))),
    # Staff-only, session-authenticated (Django admin login). KYC files have no public URL.
    path("staff/kyc-documents/<int:pk>/<str:field>/", kyc_views.kyc_document, name="kyc-document"),

    # Savings
    path("api/savings/individual/", savings_views.individual_savings, name="individual-savings"),
    path("api/savings/deposit-targets/", savings_views.deposit_targets, name="deposit-targets"),
    path("api/savings/withdrawal-targets/", savings_views.withdrawal_targets, name="withdrawal-targets"),
    path("api/clubs/", savings_views.clubs, name="clubs"),
    path("api/dashboard/summary/", savings_views.dashboard_summary, name="dashboard-summary"),


    # Money
    path("api/payments/deposits/", payment_views.create_deposit, name="create-deposit"),
    path("api/payments/withdrawals/", payment_views.create_withdrawal, name="create-withdrawal"),
    path("api/payments/wallet/deposit/", payment_views.wallet_deposit, name="wallet-deposit"),
    path("api/payments/wallet/withdraw/", payment_views.wallet_withdraw, name="wallet-withdraw"),
    path("api/payments/wallet/transactions/", payment_views.wallet_transactions, name="wallet-transactions"),
    path("api/payments/config/", payment_views.payments_config, name="payments-config"),
    path("api/payments/wallet/topup/order/", payment_views.topup_order, name="topup-order"),
    path("api/payments/wallet/topup/verify/", payment_views.topup_verify, name="topup-verify"),
    path("api/payments/razorpay/webhook/", payment_views.razorpay_webhook, name="razorpay-webhook"),
    path("api/transactions/", payment_views.transactions, name="transactions"),

    # Emergency withdrawal
    path("api/emergency/requests/", emergency_views.emergency_requests, name="emergency-requests"),
    path(
        "api/emergency/requests/<int:request_id>/approve/",
        emergency_views.approve,
        name="emergency-approve",
    ),
    path(
        "api/emergency/requests/<int:request_id>/reject/",
        emergency_views.reject,
        name="emergency-reject",
    ),

    # Notifications
    path("api/notifications/", notification_views.notifications, name="notifications"),
    path(
        "api/notifications/<int:notification_id>/read/",
        notification_views.mark_read,
        name="notification-read",
    ),
    path(
        "api/notifications/read-all/",
        notification_views.mark_all_read,
        name="notifications-read-all",
    ),
]

#!/bin/sh
# send-webhook.sh — simulate an App Store Connect webhook delivery.
#
# Signs a JSON payload exactly the way App Store Connect does — HMAC-SHA256 over
# the raw body, keyed with your webhook secret — and POSTs it to your endpoint
# with the `x-apple-signature: hmacsha256=<hex>` header. This is what the
# App Store Connect Trigger (and the Verify Webhook Signature node) validate, so
# a correctly-signed request is accepted and a tampered one is rejected (401).
#
# Payload shape matches Apple's docs (developer.apple.com → webhook-events):
#   { "data": { "type": "<eventType>", "id": "<uuid>", "version": 1,
#               "attributes": { "timestamp": "...", "ping": false, ... },
#               "relationships": { "instance": { "data": {...} } } } }
# The event type is `data.type`; a test ping is a normal event with
# `attributes.ping: true`. Real deliveries only include `attributes.appId` on
# some events (the alternative-distribution family) — this script always adds it
# so you can exercise the Trigger's "Strict Match" app filter; the inner
# attribute detail is otherwise illustrative and does not affect signing.
#
# Usage:
#   scripts/send-webhook.sh --url <URL> --secret <SECRET> [options]
#   scripts/send-webhook.sh -u http://localhost:5678/webhook/abc -s mysecret -e buildUploadStateUpdated
#
# Options:
#   -u, --url URL           Target webhook URL (required). From the Trigger node's
#                           "Webhook URLs" (Test URL while the canvas is open,
#                           Production URL when the workflow is active).
#   -s, --secret SECRET     Shared webhook secret (required). Defaults to $ASC_WEBHOOK_SECRET.
#   -e, --event TYPE        Event type → data.type (default: buildUploadStateUpdated).
#                           "ping" sends a normal event with attributes.ping=true. See --list.
#   -a, --app APP_ID        App id placed in attributes.appId (default: 1234567890).
#   -d, --delivery-id ID    Delivery id (data.id). Default: a random UUID.
#       --no-sign           Send a deliberately WRONG signature to test rejection (expect 401).
#       --print             Print the body + headers instead of sending.
#   -l, --list              List known event types and exit.
#   -h, --help              Show this help.
set -eu

URL=""
SECRET="${ASC_WEBHOOK_SECRET:-}"
EVENT="buildUploadStateUpdated"
APP_ID="1234567890"
DELIVERY_ID=""
NO_SIGN=0
PRINT_ONLY=0

KNOWN_EVENTS="appStoreVersionAppVersionStateUpdated buildUploadStateUpdated buildBetaDetailExternalBuildStateUpdated betaFeedbackCrashSubmissionCreated betaFeedbackScreenshotSubmissionCreated backgroundAssetVersionStateUpdated backgroundAssetVersionInternalBetaReleaseCreated backgroundAssetVersionExternalBetaReleaseStateUpdated backgroundAssetVersionAppStoreReleaseStateUpdated alternativeDistributionPackageVersionCreated alternativeDistributionPackageAvailableUpdated alternativeDistributionTerritoryAvailabilityUpdated"

usage() { sed -n '2,/^set -eu/p' "$0" | sed '$d;s/^# \{0,1\}//'; }

uuid() {
	if command -v uuidgen >/dev/null 2>&1; then
		uuidgen | tr 'A-Z' 'a-z'
	elif command -v openssl >/dev/null 2>&1; then
		openssl rand -hex 16 | sed 's/\(........\)\(....\)\(....\)\(....\)\(............\)/\1-\2-\3-\4-\5/'
	else
		echo "id-$(date +%s)-$$"
	fi
}

while [ $# -gt 0 ]; do
	case "$1" in
		-u|--url) URL="$2"; shift 2 ;;
		-s|--secret) SECRET="$2"; shift 2 ;;
		-e|--event) EVENT="$2"; shift 2 ;;
		-a|--app) APP_ID="$2"; shift 2 ;;
		-d|--delivery-id) DELIVERY_ID="$2"; shift 2 ;;
		--no-sign) NO_SIGN=1; shift ;;
		--print) PRINT_ONLY=1; shift ;;
		-l|--list) printf '%s\n' $KNOWN_EVENTS; exit 0 ;;
		-h|--help) usage; exit 0 ;;
		*) echo "Unknown option: $1" >&2; echo "Try --help." >&2; exit 2 ;;
	esac
done

# "ping" is a convenience: a normal event flagged attributes.ping=true.
PING=false
if [ "$EVENT" = "ping" ]; then EVENT="buildUploadStateUpdated"; PING=true; fi

if [ "$PRINT_ONLY" -eq 0 ] && [ -z "$URL" ]; then
	echo "Error: --url is required (or use --print)." >&2; exit 2
fi
if [ "$NO_SIGN" -eq 0 ] && [ -z "$SECRET" ]; then
	echo "Error: --secret is required (or set ASC_WEBHOOK_SECRET, or use --no-sign)." >&2; exit 2
fi

[ -z "$DELIVERY_ID" ] && DELIVERY_ID=$(uuid)
INSTANCE_ID=$(uuid)
TS=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)

# Event-specific illustrative attributes + the affected resource's type
# (relationships.instance). Only `data.type` and the signature matter to the node.
case "$EVENT" in
	appStoreVersionAppVersionStateUpdated)
		EXTRA='"oldValue":"PREPARE_FOR_SUBMISSION","newValue":"READY_FOR_REVIEW"'; REL_TYPE="appStoreVersions" ;;
	buildUploadStateUpdated)
		EXTRA='"oldValue":"PROCESSING","newValue":"VALID"'; REL_TYPE="builds" ;;
	buildBetaDetailExternalBuildStateUpdated)
		EXTRA='"oldValue":"IN_BETA_REVIEW","newValue":"READY_FOR_BETA_TESTING"'; REL_TYPE="buildBetaDetails" ;;
	betaFeedbackCrashSubmissionCreated)
		EXTRA='"deviceModel":"iPhone16,2","osVersion":"18.5"'; REL_TYPE="betaFeedbackCrashSubmissions" ;;
	betaFeedbackScreenshotSubmissionCreated)
		EXTRA='"deviceModel":"iPhone16,2","osVersion":"18.5"'; REL_TYPE="betaFeedbackScreenshotSubmissions" ;;
	backgroundAssetVersion*)
		EXTRA='"oldValue":"AWAITING_UPLOAD","newValue":"COMPLETE"'; REL_TYPE="backgroundAssetVersions" ;;
	alternativeDistribution*)
		EXTRA='"state":"AVAILABLE"'; REL_TYPE="alternativeDistributionPackageVersions" ;;
	*)
		EXTRA='"note":"custom event type"'; REL_TYPE="resourceInstances" ;;
esac

# Build the exact body once, to a temp file, so the bytes we sign are the bytes
# we send (any reserialization would change the digest).
TMP=$(mktemp "${TMPDIR:-/tmp}/asc-webhook.XXXXXX")
trap 'rm -f "$TMP"' EXIT

printf '%s' "{\"data\":{\"type\":\"$EVENT\",\"id\":\"$DELIVERY_ID\",\"version\":1,\"attributes\":{\"timestamp\":\"$TS\",\"ping\":$PING,\"appId\":\"$APP_ID\",$EXTRA},\"relationships\":{\"instance\":{\"data\":{\"type\":\"$REL_TYPE\",\"id\":\"$INSTANCE_ID\"}}}}}" > "$TMP"

# Compute the signature header value.
if [ "$NO_SIGN" -eq 1 ]; then
	SIG_HEADER="hmacsha256=0000000000000000000000000000000000000000000000000000000000000000"
else
	SIG_HEX=$(openssl dgst -sha256 -hmac "$SECRET" "$TMP" | awk '{print $NF}' | tr 'A-Z' 'a-z')
	SIG_HEADER="hmacsha256=$SIG_HEX"
fi

if [ "$PRINT_ONLY" -eq 1 ]; then
	echo "Content-Type: application/json"
	echo "x-apple-signature: $SIG_HEADER"
	echo
	cat "$TMP"; echo
	exit 0
fi

echo "→ POST $URL"
echo "  event:       $EVENT (data.type)$( [ "$PING" = true ] && echo '  [ping]')"
echo "  delivery id: $DELIVERY_ID"
echo "  app id:      $APP_ID (attributes.appId)"
echo "  signature:   $SIG_HEADER$( [ "$NO_SIGN" -eq 1 ] && echo '  (intentionally invalid — expect HTTP 401)')"
echo

curl -sS -X POST "$URL" \
	-H "Content-Type: application/json" \
	-H "x-apple-signature: $SIG_HEADER" \
	--data-binary @"$TMP" \
	-w '\n\nHTTP %{http_code}\n'

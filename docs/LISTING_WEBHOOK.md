# Consumer map listing webhook

OPEN DOOR TOKYO can send a newly published Access Card to a separate,
consumer-facing venue map. This integration is optional and is disabled unless
both server-side variables are present:

```text
LISTING_WEBHOOK_URL
LISTING_WEBHOOK_SECRET
```

## Request contract

- Method: `POST`
- Event: `access_card.published`
- Schema version: `1`
- Retry count: `0`
- Timeout: `5 seconds`
- Idempotency key: `open-door:<cardId>`
- Signature:
  `x-open-door-signature: sha256=<HMAC-SHA256 of the exact request body>`

The JSON body contains:

```json
{
  "event": "access_card.published",
  "schemaVersion": 1,
  "cardId": "venue-id",
  "publicUrl": "https://open-door-tokyo.vercel.app/c/venue-id",
  "card": {}
}
```

The receiving map must verify the signature before parsing or persisting the
card, and use the idempotency key or `cardId` as an upsert key. A `2xx` response
is displayed as delivered. A missing configuration, timeout, transport error,
or remote rejection never blocks the Access Card itself from being published.

This webhook does not post directly to Google Business Profile. The review UI
instead produces a public URL and ready-to-paste Google listing text, avoiding
an unauthorized external account change. A separate OAuth-enabled publisher
can be connected later with venue-owner approval.

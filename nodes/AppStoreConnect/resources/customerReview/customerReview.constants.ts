/**
 * JSON:API resource type for customer reviews — the `type` in read responses
 * (`GET /v1/apps/{id}/customerReviews`, `GET /v1/customerReviews/{id}`) and the
 * `relationships.review.data.type` used when creating a response
 * (`customerReview.body.ts`).
 *
 * ⚠️ NEEDS LIVE 2xx CONFIRMATION (see `docs/apple-api-notes.md` and the
 * roadmap's "verify JSON:API resource-type strings against the live API"
 * guidance): doc-derived. If the live API rejects `customerReviews`, this is the
 * only line that needs to change.
 */
export const CUSTOMER_REVIEW_RESOURCE_TYPE = 'customerReviews';

/**
 * JSON:API resource type for customer-review responses — used as `data.type` on
 * the Create (`POST /v1/customerReviewResponses`) and Update
 * (`PATCH /v1/customerReviewResponses/{id}`) request bodies.
 *
 * ⚠️ NEEDS LIVE 2xx CONFIRMATION (doc-derived). If the live API rejects
 * `customerReviewResponses`, this is the only line that needs to change.
 */
export const CUSTOMER_REVIEW_RESPONSE_RESOURCE_TYPE = 'customerReviewResponses';

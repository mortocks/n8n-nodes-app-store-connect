/**
 * JSON:API resource type — and matching URL path segment — for TestFlight beta
 * **crash** feedback submissions. Used both as the collection segment on the
 * app-scoped Get Many (`GET /v1/apps/{id}/betaFeedbackCrashSubmissions`) and as
 * the resource segment on Get / Delete
 * (`/v1/betaFeedbackCrashSubmissions/{id}`). It is also the `data.type` in the
 * read responses.
 *
 * The value doubles as the "Feedback Type" selector's option value, so the same
 * string flows straight into the declarative URL expression — one source of
 * truth for the path and the type.
 *
 * ⚠️ NEEDS LIVE 2xx CONFIRMATION (see `docs/apple-api-notes.md` and the
 * roadmap's "verify JSON:API resource-type strings against the live API"
 * guidance): doc-derived. If the live API rejects `betaFeedbackCrashSubmissions`,
 * this is the only line that needs to change.
 */
export const BETA_FEEDBACK_CRASH_RESOURCE_TYPE = 'betaFeedbackCrashSubmissions';

/**
 * JSON:API resource type — and matching URL path segment — for TestFlight beta
 * **screenshot** feedback submissions. Used both as the collection segment on
 * the app-scoped Get Many (`GET /v1/apps/{id}/betaFeedbackScreenshotSubmissions`)
 * and as the resource segment on Get / Delete
 * (`/v1/betaFeedbackScreenshotSubmissions/{id}`). It is also the `data.type` in
 * the read responses.
 *
 * ⚠️ NEEDS LIVE 2xx CONFIRMATION (doc-derived). If the live API rejects
 * `betaFeedbackScreenshotSubmissions`, this is the only line that needs to
 * change.
 */
export const BETA_FEEDBACK_SCREENSHOT_RESOURCE_TYPE = 'betaFeedbackScreenshotSubmissions';

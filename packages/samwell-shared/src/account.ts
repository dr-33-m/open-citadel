/**
 * The one name Samwell Cloud goes by, to Logto and to itself.
 *
 * The app asks Logto for an access token FOR this resource, and the server
 * checks that the token in front of it names this resource as its audience.
 * Both halves have to be the same string or every request is rejected, so it
 * is written once, here, rather than twice in two packages.
 *
 * OAuth calls this a resource indicator, and nothing ever fetches it: it is
 * compared as a string and that is all. But it is the address Samwell Cloud
 * is moving to, chosen on purpose. A resource indicator is baked into every
 * token already issued and registered by hand in the Logto console, so it is
 * the one value here that is genuinely awkward to change later — naming the
 * destination rather than today's host means the move costs a
 * `SAMWELL_CLOUD_URL` and nothing else.
 */
export const SAMWELL_API_RESOURCE = 'https://api.open-citadel.online';

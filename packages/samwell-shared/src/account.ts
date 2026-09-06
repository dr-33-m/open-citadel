/**
 * The one name Samwell Cloud goes by, to Logto and to itself.
 *
 * The app asks Logto for an access token FOR this resource, and the server
 * checks that the token in front of it names this resource as its audience.
 * Both halves have to be the same string or every request is rejected, so it
 * is written once, here, rather than twice in two packages.
 *
 * It is an identifier, not an address. Nothing fetches it.
 */
export const SAMWELL_API_RESOURCE = 'https://api.open-citadel.online';

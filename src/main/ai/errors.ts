// An AI that can't be reached right now (offline, out of quota, too slow to answer or to start).
// Auto mode then asks the other AI. A class, so this works whatever language the message is in.
// It keeps Error's name: the windows receive errors as "Error: message" and show the message.
export class UnreachableError extends Error {}

// Silksong rules that are written and tested but switched off in the app, because a wrong guess
// would have the companion say something happened that didn't. Each stays off until real
// footage shows it can be trusted.

/**
 * Leaving a boss arena alive 20 s or more into the fight is taken to mean the boss was beaten.
 * Off: a missed death (a dark scene, or a fade that was not read as one) would turn the next door
 * into a win.
 */
export const INFER_BOSS_DEFEAT = false

/**
 * Text in the pickup region is read and logged as a pickup. Off: the region is only an estimate,
 * and dialogue, prompts or misreads there would be logged (and sent to the model) as pickups.
 * Turn on once calibration shows the region holds only pickup names.
 */
export const READ_PICKUPS = false

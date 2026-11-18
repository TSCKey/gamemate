// Every sequence rule, in one static list. A rule only runs for games in its scope.
import type { CorrelationRule } from '../correlation'
import { attemptMilestones } from './attemptMilestones'

export const RULES: readonly CorrelationRule[] = [attemptMilestones] as CorrelationRule[]

// Every sequence rule, in one static list. A rule only runs for games in its scope.
import type { CorrelationRule } from '../correlation'
import { apexEngagement } from './apexEngagement'
import { attemptMilestones } from './attemptMilestones'
import { closeCallSurvived } from './closeCallSurvived'
import { newAreaAfterDeaths } from './newAreaAfterDeaths'

export const RULES: readonly CorrelationRule[] = [
  apexEngagement,
  attemptMilestones,
  closeCallSurvived,
  newAreaAfterDeaths
] as CorrelationRule[]

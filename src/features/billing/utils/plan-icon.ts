import { ChessPawn, ChessRook, Crown, type LucideIcon } from '@/components/icons';
import type { PlanId } from 'samwell-shared';

/**
 * The mark each plan goes by.
 *
 * A pawn, a rook, a crown: an order of rank rather than three sizes of the
 * same badge, because the plans differ in what Samwell can think with and not
 * in how much of the same thing you get.
 *
 * Shared because the plan is drawn in three places - the carousel card, the
 * current-plan row in the Cloud panel, and the manage sheet - and a plan that
 * wore a rook in one and a crown in another would be two different answers
 * to "which plan am I on".
 */
export const PLAN_ICON: Record<PlanId, LucideIcon> = {
  maester: ChessPawn,
  grand_maester: ChessRook,
  archmaester: Crown,
};

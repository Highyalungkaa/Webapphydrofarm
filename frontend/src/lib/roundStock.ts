import type {PlantingRound} from '../types/index.js';
import {isCurrentPlantingRound} from './managedOrders.js';

export function canAddRoundStock(round: PlantingRound): boolean {
  // A sold-out round can display step 8 while still waiting for final closure.
  return isCurrentPlantingRound(round) && Number(round.current_step) >= 6 && !round.closure_reason;
}

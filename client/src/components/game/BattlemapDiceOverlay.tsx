import { useEffect } from 'react';
import { type DiceRollResult } from '@/lib/diceSystem';
import { triggerDiceRollNotification } from './RollNotification';

interface BattlemapDiceOverlayProps {
  onRollComplete?: (result: DiceRollResult) => void;
}

export function BattlemapDiceOverlay({ onRollComplete }: BattlemapDiceOverlayProps) {
  useEffect(() => {
    const handleDiceRoll = (event: CustomEvent<DiceRollResult>) => {
      const result = event.detail;
      
      // Don't broadcast - server already broadcast this roll to all clients
      // Use characterName if available (from server), fallback to username
      triggerDiceRollNotification(
        result.dieType,
        result.result,
        result.modifier,
        result.total,
        result.username || 'Unknown',
        (result as any).characterName,
        false // broadcast = false, server already sent to all clients
      );
      
      if (onRollComplete) {
        onRollComplete(result);
      }
    };
    
    window.addEventListener('battlemap-dice-roll' as any, handleDiceRoll);
    return () => {
      window.removeEventListener('battlemap-dice-roll' as any, handleDiceRoll);
    };
  }, [onRollComplete]);
  
  return null;
}

export function triggerBattlemapDiceRoll(result: DiceRollResult) {
  const event = new CustomEvent('battlemap-dice-roll', { detail: result });
  window.dispatchEvent(event);
}

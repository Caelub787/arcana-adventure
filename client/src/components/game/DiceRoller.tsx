import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dices, Plus, Minus } from 'lucide-react';
import { gameWs } from '@/lib/api';
import { 
  initDiceSystem, 
  cleanupDiceSystem, 
  handleServerRollResult, 
  type DieType,
  type DiceRollResult
} from '@/lib/diceSystem';

interface DiceRollerProps {
  campaignId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

const DIE_TYPES: { type: DieType; label: string; color: string }[] = [
  { type: 'd4', label: 'D4', color: 'bg-red-600 hover:bg-red-700' },
  { type: 'd6', label: 'D6', color: 'bg-blue-600 hover:bg-blue-700' },
  { type: 'd8', label: 'D8', color: 'bg-green-600 hover:bg-green-700' },
  { type: 'd10', label: 'D10', color: 'bg-purple-600 hover:bg-purple-700' },
  { type: 'd12', label: 'D12', color: 'bg-orange-600 hover:bg-orange-700' },
  { type: 'd20', label: 'D20', color: 'bg-cyan-600 hover:bg-cyan-700' },
];

interface RollHistoryItem extends DiceRollResult {
  isLocal: boolean;
}

export function DiceRoller({ campaignId, isOpen, onOpenChange }: DiceRollerProps) {
  const [modifier, setModifier] = useState(0);
  const [rollHistory, setRollHistory] = useState<RollHistoryItem[]>([]);
  const [isRolling, setIsRolling] = useState(false);
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    setContainerEl(node);
  }, []);
  
  useEffect(() => {
    if (isOpen && containerEl) {
      initDiceSystem({
        container: containerEl,
        onRollStart: () => setIsRolling(true),
        onRollComplete: () => setIsRolling(false),
      });
      
      return () => {
        cleanupDiceSystem();
      };
    }
  }, [isOpen, containerEl]);
  
  useEffect(() => {
    const handleWsMessage = (data: any) => {
      if (data.type === 'dice_roll' && data.roll) {
        handleServerRollResult(data.roll);
        setRollHistory(prev => [{
          ...data.roll,
          isLocal: false,
        }, ...prev.slice(0, 9)]);
      }
    };
    
    const unsubscribe = gameWs.onMessage(handleWsMessage);
    return () => { unsubscribe(); };
  }, []);
  
  const rollDie = useCallback((dieType: DieType) => {
    if (isRolling) return;
    
    gameWs.sendDiceRoll(dieType, modifier);
  }, [modifier, isRolling]);
  
  const adjustModifier = (delta: number) => {
    setModifier(prev => Math.max(-10, Math.min(20, prev + delta)));
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-stone-900 border-stone-700 text-stone-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-stone-100">
            <Dices className="h-5 w-5" />
            Dice Roller
          </DialogTitle>
          <DialogDescription className="text-stone-400">
            Roll dice for your campaign. All rolls are server-verified.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div 
            ref={containerRef} 
            className="relative h-32 bg-stone-800 rounded-lg border border-stone-700 overflow-hidden"
            data-testid="dice-animation-container"
          >
            {!isRolling && rollHistory.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-stone-500">
                Click a die to roll
              </div>
            )}
            {!isRolling && rollHistory.length > 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-4xl font-bold text-white">
                  {rollHistory[0].total}
                </div>
                <div className="text-sm text-stone-400">
                  {rollHistory[0].dieType.toUpperCase()}: {rollHistory[0].result}
                  {rollHistory[0].modifier !== 0 && (
                    <span> {rollHistory[0].modifier > 0 ? '+' : ''}{rollHistory[0].modifier}</span>
                  )}
                </div>
                <div className="text-xs text-stone-500 mt-1">
                  by {rollHistory[0].username}
                </div>
              </div>
            )}
          </div>
          
          <div className="flex items-center justify-center gap-2">
            <Label className="text-stone-300">Modifier:</Label>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-stone-600 bg-stone-800 hover:bg-stone-700"
              onClick={() => adjustModifier(-1)}
              data-testid="button-modifier-decrease"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Input
              type="number"
              value={modifier}
              onChange={(e) => setModifier(parseInt(e.target.value) || 0)}
              className="w-16 text-center bg-stone-800 border-stone-600 text-stone-100"
              data-testid="input-modifier"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-stone-600 bg-stone-800 hover:bg-stone-700"
              onClick={() => adjustModifier(1)}
              data-testid="button-modifier-increase"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="grid grid-cols-3 gap-2">
            {DIE_TYPES.map(({ type, label, color }) => (
              <Button
                key={type}
                className={`${color} text-white font-bold py-6 text-lg`}
                onClick={() => rollDie(type)}
                disabled={isRolling}
                data-testid={`button-roll-${type}`}
              >
                {label}
              </Button>
            ))}
          </div>
          
          {rollHistory.length > 1 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-stone-400 mb-2">Recent Rolls</h4>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {rollHistory.slice(1).map((roll) => (
                  <div 
                    key={roll.id} 
                    className="flex justify-between items-center text-sm bg-stone-800 rounded px-2 py-1"
                    data-testid={`roll-history-${roll.id}`}
                  >
                    <span className="text-stone-400">
                      {roll.username}: {roll.dieType.toUpperCase()}
                    </span>
                    <span className="font-medium text-stone-200">
                      {roll.result}
                      {roll.modifier !== 0 && (
                        <span className="text-stone-400">
                          {roll.modifier > 0 ? '+' : ''}{roll.modifier}
                        </span>
                      )}
                      {' = '}
                      <span className="text-white font-bold">{roll.total}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface DiceRollNotificationProps {
  roll: DiceRollResult;
  onClose: () => void;
}

export function DiceRollNotification({ roll, onClose }: DiceRollNotificationProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);
  
  return (
    <div 
      className="fixed bottom-20 right-4 bg-stone-800 border border-stone-600 rounded-lg p-3 shadow-lg animate-in slide-in-from-right z-50"
      onClick={onClose}
      data-testid={`notification-roll-${roll.id}`}
    >
      <div className="flex items-center gap-3">
        <Dices className="h-5 w-5 text-cyan-400" />
        <div>
          <div className="text-sm text-stone-400">
            {roll.username} rolled {roll.dieType.toUpperCase()}
          </div>
          <div className="text-lg font-bold text-white">
            {roll.result}
            {roll.modifier !== 0 && (
              <span className="text-stone-400 text-sm">
                {roll.modifier > 0 ? '+' : ''}{roll.modifier}
              </span>
            )}
            {' = '}
            <span className="text-cyan-400">{roll.total}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

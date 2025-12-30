import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dices, Swords, Sparkles, Target, Shield, Zap, Flame, Heart } from 'lucide-react';
import { type DieType } from '@/lib/diceSystem';
import { gameWs } from '@/lib/api';

export interface RollNotification {
  id: string;
  type: 'dice' | 'initiative' | 'attack' | 'skill' | 'save' | 'custom' | 'system' | 'effect';
  dieType?: DieType;
  label: string;
  result: number;
  modifier?: number;
  total: number;
  username: string;
  characterName?: string;
  timestamp: number;
  calculationBreakdown?: string;
  duration?: number;
  isHealing?: boolean;
}

const ROLL_ICONS = {
  dice: Dices,
  initiative: Swords,
  attack: Target,
  skill: Zap,
  save: Shield,
  custom: Sparkles,
  system: Sparkles,
  effect: Flame,
};

const ROLL_COLORS = {
  dice: 'from-cyan-500 to-blue-600',
  initiative: 'from-amber-500 to-orange-600',
  attack: 'from-red-500 to-rose-600',
  skill: 'from-green-500 to-emerald-600',
  save: 'from-purple-500 to-violet-600',
  custom: 'from-pink-500 to-fuchsia-600',
  system: 'from-stone-500 to-stone-600',
  effect: 'from-orange-500 to-red-600',
};

const DIE_COLORS: Partial<Record<DieType, string>> = {
  d4: 'from-red-500 to-red-700',
  d6: 'from-blue-500 to-blue-700',
  d8: 'from-green-500 to-green-700',
  d10: 'from-purple-500 to-purple-700',
  d12: 'from-orange-500 to-orange-700',
  d20: 'from-cyan-500 to-cyan-700',
};

function RollCard({ notification, onComplete }: { notification: RollNotification; onComplete: (id: string) => void }) {
  // For effect type, use Heart icon for healing, Flame for damage
  const Icon = notification.type === 'effect' && notification.isHealing 
    ? Heart 
    : (ROLL_ICONS[notification.type] || Dices);
  
  // For effect type, use green for healing, orange-red for damage
  const effectColor = notification.isHealing 
    ? 'from-emerald-500 to-green-600' 
    : 'from-orange-500 to-red-600';
  
  const colorClass = notification.dieType 
    ? DIE_COLORS[notification.dieType] || ROLL_COLORS[notification.type]
    : (notification.type === 'effect' ? effectColor : ROLL_COLORS[notification.type]);
  
  const notificationDuration = notification.duration ?? (notification.type === 'system' ? 2000 : 3500);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete(notification.id);
    }, notificationDuration);
    return () => clearTimeout(timer);
  }, [notification.id, onComplete, notificationDuration]);
  
  const displayName = notification.characterName || notification.username;
  const isNat20 = notification.dieType === 'd20' && notification.result === 20;
  const isNat1 = notification.dieType === 'd20' && notification.result === 1;
  
  // Handle double-click to dismiss
  const handleDoubleClick = () => {
    onComplete(notification.id);
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: -50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.95 }}
      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      className="pointer-events-auto cursor-pointer select-none"
      onDoubleClick={handleDoubleClick}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.5}
      onDragEnd={(_, info) => {
        if (Math.abs(info.offset.x) > 100 || Math.abs(info.velocity.x) > 500) {
          onComplete(notification.id);
        }
      }}
      whileTap={{ scale: 0.98 }}
    >
      <div className={`
        relative overflow-hidden rounded-xl shadow-2xl
        bg-gradient-to-r ${colorClass}
        border border-white/20
        ${isNat20 ? 'ring-4 ring-yellow-400 ring-opacity-75' : ''}
        ${isNat1 ? 'ring-4 ring-red-900 ring-opacity-75' : ''}
      `}>
        <div className="absolute inset-0 bg-black/20" />
        
        <div className="relative px-5 py-3 flex items-center gap-4">
          <div className="flex-shrink-0">
            <motion.div
              initial={{ rotate: -180, scale: 0 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: 'spring', damping: 10, delay: 0.1 }}
              className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center"
            >
              <Icon className="w-7 h-7 text-white" />
            </motion.div>
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-white/80 text-sm">
              <span className="font-medium truncate">{displayName}</span>
              <span className="text-white/50">•</span>
              <span className="text-white/70">{notification.label}</span>
            </div>
            
            {notification.calculationBreakdown && (
              <div className="text-white/60 text-xs mt-0.5">
                {notification.calculationBreakdown}
              </div>
            )}
            
            {notification.type !== 'system' && (
              <div className="flex items-baseline gap-2 mt-0.5">
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 8, delay: 0.2 }}
                  className={`text-3xl font-bold text-white drop-shadow-lg
                    ${isNat20 ? 'text-yellow-200' : ''}
                    ${isNat1 ? 'text-red-200' : ''}
                  `}
                >
                  {notification.total}
                </motion.span>
                {isNat20 && (
                  <motion.span
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-yellow-200 font-bold text-sm uppercase tracking-wider"
                  >
                    Crit Success
                  </motion.span>
                )}
                {isNat1 && (
                  <motion.span
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-red-200 font-bold text-sm uppercase tracking-wider"
                  >
                    Crit Failure
                  </motion.span>
                )}
              </div>
            )}
          </div>
        </div>
        
        <motion.div
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: notificationDuration / 1000, ease: 'linear' }}
          className="h-1 bg-white/30 origin-left"
        />
      </div>
    </motion.div>
  );
}

export function RollNotificationContainer() {
  const [notifications, setNotifications] = useState<RollNotification[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const addNotification = useCallback((notification: RollNotification) => {
    setNotifications(prev => {
      const filtered = prev.slice(-4);
      return [...filtered, notification];
    });
  }, []);
  
  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);
  
  useEffect(() => {
    const handleRoll = (event: CustomEvent<RollNotification>) => {
      addNotification(event.detail);
    };
    
    window.addEventListener('roll-notification' as any, handleRoll);
    return () => {
      window.removeEventListener('roll-notification' as any, handleRoll);
    };
  }, [addNotification]);
  
  // Listen for roll notifications from other players via WebSocket
  useEffect(() => {
    const unsubscribe = gameWs.onMessage((data: any) => {
      if (data.type === 'roll_notification' && data.notification) {
        // Add the incoming notification from another player
        const notification: RollNotification = {
          ...data.notification,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        };
        addNotification(notification);
      }
    });
    
    return () => { unsubscribe(); };
  }, [addNotification]);
  
  return (
    <div
      ref={containerRef}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none"
      style={{ maxWidth: '90vw', width: '400px' }}
    >
      <AnimatePresence mode="popLayout">
        {notifications.map(notification => (
          <RollCard
            key={notification.id}
            notification={notification}
            onComplete={removeNotification}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

export function triggerRollNotification(notification: Omit<RollNotification, 'id' | 'timestamp'>, broadcast = true) {
  const fullNotification: RollNotification = {
    ...notification,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };
  
  // Display locally
  const event = new CustomEvent('roll-notification', { detail: fullNotification });
  window.dispatchEvent(event);
  
  // Broadcast to other players via WebSocket (for attack, damage, skill rolls)
  // Skip broadcasting for system notifications and when explicitly disabled
  if (broadcast && notification.type !== 'system') {
    gameWs.sendRollNotification({
      type: notification.type,
      dieType: notification.dieType,
      label: notification.label,
      result: notification.result,
      modifier: notification.modifier,
      total: notification.total,
      username: notification.username,
      characterName: notification.characterName,
      calculationBreakdown: notification.calculationBreakdown,
      isHealing: notification.isHealing,
    });
  }
}

export function triggerDiceRollNotification(
  dieType: DieType,
  result: number,
  modifier: number,
  total: number,
  username: string,
  characterName?: string,
  broadcast: boolean = true
) {
  triggerRollNotification({
    type: 'dice',
    dieType,
    label: dieType.toUpperCase(),
    result,
    modifier,
    total,
    username,
    characterName,
  }, broadcast);
}

export function triggerInitiativeNotification(
  result: number,
  modifier: number,
  total: number,
  username: string,
  characterName: string,
  broadcast: boolean = true
) {
  triggerRollNotification({
    type: 'initiative',
    dieType: 'd20',
    label: 'Initiative',
    result,
    modifier,
    total,
    username,
    characterName,
  }, broadcast);
}

export function triggerSkillRollNotification(
  skillName: string,
  dieType: DieType,
  result: number,
  modifier: number,
  total: number,
  username: string,
  characterName?: string,
  broadcast: boolean = true
) {
  triggerRollNotification({
    type: 'skill',
    dieType,
    label: skillName,
    result,
    modifier,
    total,
    username,
    characterName,
  }, broadcast);
}

export function triggerEffectRollNotification(
  effectName: string,
  rolls: number[],
  bonus: number,
  total: number,
  damageType: string,
  isHealing: boolean,
  characterName: string,
  broadcast: boolean = true
) {
  const rollsText = rolls.join(' + ') + (bonus > 0 ? ` + ${bonus}` : '');
  const actionText = isHealing ? 'heals' : 'takes';
  
  triggerRollNotification({
    type: 'effect',
    label: effectName,
    result: rolls.reduce((a, b) => a + b, 0),
    modifier: bonus,
    total,
    username: 'System',
    characterName,
    calculationBreakdown: `${characterName} ${actionText} ${total} ${damageType || ''} (${rollsText})`,
    isHealing,
  }, broadcast);
}

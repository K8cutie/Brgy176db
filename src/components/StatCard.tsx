import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, type LucideIcon } from 'lucide-react';

export interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: string;
    direction: 'up' | 'down' | 'neutral';
    isAlert?: boolean;
  };
  delay?: number;
  onClick?: () => void;
}

export default function StatCard({ title, value, icon: Icon, trend, delay = 0, onClick }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0, 0, 0.2, 1] as [number, number, number, number] }}
      className={
        'cos-card cos-card-hover p-5 cursor-default ' + (onClick ? 'cursor-pointer' : '')
      }
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-full bg-gold-glow flex items-center justify-center">
          <Icon className="w-5 h-5 text-gold" />
        </div>
      </div>

      <p className="label text-warm-gray mb-1">{title}</p>
      <p className="text-2xl font-bold text-charcoal dark:text-dm-text font-inter">{value}</p>

      {trend && (
        <div className="flex items-center gap-1.5 mt-2">
          {!trend.isAlert ? (
            <>
              {trend.direction === 'up' ? (
                <TrendingUp className="w-4 h-4 text-success" />
              ) : trend.direction === 'down' ? (
                <TrendingDown className="w-4 h-4 text-error" />
              ) : null}
              <span className={
                'text-sm font-medium ' +
                (trend.direction === 'up' ? 'text-success' : trend.direction === 'down' ? 'text-error' : 'text-warm-gray')
              }>
                {trend.value}
              </span>
            </>
          ) : (
            <span className="cos-badge cos-badge-warning">{trend.value}</span>
          )}
        </div>
      )}
    </motion.div>
  );
}

import React from 'react';
import { Icon } from 'lucide-react';

interface AlertCategoryCardProps {
  category: string;
  count: number;
  icon: React.ReactNode;
  onClick: () => void;
}

export function AlertCategoryCard({ category, count, icon, onClick }: AlertCategoryCardProps) {
  return (
    <div className="alert-category-card" onClick={onClick}>
      <div className="category-icon">{icon}</div>
      <div className="category-info">
        <p className="category-name">{category}</p>
        <p className="category-count">{count} Alerts</p>
      </div>
    </div>
  );
}
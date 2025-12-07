import React from 'react';

interface AlertCategoryCardProps {
  category: string;
  count: number;
  icon: React.ReactNode;
  onClick: () => void;
}

export function AlertCategoryCard({ category, count, icon, onClick }: AlertCategoryCardProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick();
  };

  return (
    <div className="alert-category-card" onClick={handleClick}>
      <div className="category-icon">{icon}</div>
      <div className="category-info">
        <p className="category-name">{category}</p>
        <p className="category-count">{count} Alerts</p>
      </div>
    </div>
  );
}
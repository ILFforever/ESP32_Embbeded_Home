import React from 'react';
import Link from 'next/link';

interface DeviceSubnavProps {
  current: 'doorbell' | 'hub';
}

const DEVICES = [
  { id: 'doorbell', label: 'Doorbell', href: '/doorbell' },
  { id: 'hub', label: 'Hub', href: '/hub' },
] as const;

export default function DeviceSubnav({ current }: DeviceSubnavProps) {
  return (
    <nav className="g-seg device-subnav" aria-label="Core devices">
      {DEVICES.map((device) => (
        <Link
          key={device.id}
          href={device.href}
          aria-current={current === device.id ? 'page' : undefined}
        >
          {device.label}
        </Link>
      ))}
    </nav>
  );
}

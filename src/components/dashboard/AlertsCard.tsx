import React, { useState } from 'react';
import { AlertTriangle, Info, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import type { Alert } from '@/types/dashboard';

interface AlertsCardProps {
  alerts: Alert[];
}

export function AlertsCard({ alerts }: AlertsCardProps) {
  const [expanded, setExpanded] = useState(false);

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'critical':
        return <XCircle className="alert-icon critical" />;
      case 'warning':
        return <AlertTriangle className="alert-icon warning" />;
      case 'info':
        return <Info className="alert-icon info" />;
      default:
        return <Info className="alert-icon" />;
    }
  };

  const unacknowledgedAlerts = alerts.filter(a => !a.acknowledged);
  const acknowledgedAlerts = alerts.filter(a => a.acknowledged);
  const criticalCount = alerts.filter(a => a.type === 'critical' && !a.acknowledged).length;

  return (
    <div className={`card ${expanded ? 'card-expanded' : ''}`}>
      <div className="card-header" onClick={() => setExpanded(!expanded)}>
        <div className="card-title-group">
          <h3>ALERTS</h3>
          {criticalCount > 0 && (
            <span className="badge badge-critical">{criticalCount} CRITICAL</span>
          )}
        </div>
        <button className="expand-button">
          {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
      </div>

      <div className="card-content">
        {!expanded ? (
          <div className="alerts-compact">
            {unacknowledgedAlerts.length === 0 ? (
              <p className="no-alerts">NO ACTIVE ALERTS</p>
            ) : (
              <div className="alerts-list">
                {unacknowledgedAlerts.slice(0, 3).map(alert => (
                  <div key={alert.id} className={`alert-item alert-${alert.type}`}>
                    {getAlertIcon(alert.type)}
                    <div className="alert-content">
                      <p className="alert-title">{alert.title}</p>
                      <p className="alert-time">{new Date(alert.timestamp).toLocaleTimeString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="alerts-expanded">
            <div className="alerts-section">
              <h4>UNACKNOWLEDGED ({unacknowledgedAlerts.length})</h4>
              {unacknowledgedAlerts.length === 0 ? (
                <p className="no-alerts">NO UNACKNOWLEDGED ALERTS</p>
              ) : (
                <div className="alerts-list">
                  {unacknowledgedAlerts.map(alert => (
                    <div key={alert.id} className={`alert-item-detailed alert-${alert.type}`}>
                      <div className="alert-header">
                        {getAlertIcon(alert.type)}
                        <div className="alert-meta">
                          <span className="alert-type">{alert.type.toUpperCase()}</span>
                          <span className="alert-timestamp">
                            {new Date(alert.timestamp).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="alert-body">
                        <h5>{alert.title}</h5>
                        <p>{alert.message}</p>
                        <div className="alert-footer">
                          <span className="alert-device">Device: {alert.device_id}</span>
                          <button className="btn-acknowledge">ACKNOWLEDGE</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {acknowledgedAlerts.length > 0 && (
              <div className="alerts-section">
                <h4>ACKNOWLEDGED ({acknowledgedAlerts.length})</h4>
                <div className="alerts-list">
                  {acknowledgedAlerts.map(alert => (
                    <div key={alert.id} className={`alert-item-detailed alert-${alert.type} acknowledged`}>
                      <div className="alert-header">
                        {getAlertIcon(alert.type)}
                        <div className="alert-meta">
                          <span className="alert-type">{alert.type.toUpperCase()}</span>
                          <span className="alert-timestamp">
                            {new Date(alert.timestamp).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="alert-body">
                        <h5>{alert.title}</h5>
                        <p>{alert.message}</p>
                        <div className="alert-footer">
                          <span className="alert-device">Device: {alert.device_id}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
